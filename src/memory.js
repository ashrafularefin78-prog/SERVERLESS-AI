// Local, user-controlled memory: facts the assistant carries across chats.
// Capture is explicit ("remember ...", "my name is ...") so nothing is
// inferred silently from conversation.

/** Maximum number of memory notes kept on a device. */
export const MAX_MEMORIES = 30;
/** Maximum length of a single memory note, in characters. */
export const MAX_MEMORY_LENGTH = 200;

/**
 * @typedef {Object} MemoryNote
 * @property {string} id
 * @property {string} text
 * @property {number} addedAt
 */

/**
 * @typedef {Object} MemoryCommand
 * @property {"add" | "forget" | "forget-all"} type
 * @property {string} [text]
 */

/**
 * @typedef {Object} MemoryOutcome
 * @property {MemoryNote[]} memory
 * @property {boolean} changed
 * @property {MemoryNote | null} added
 * @property {number} removed
 * @property {boolean} duplicate
 * @property {boolean} full
 */

function clean(text) {
  return String(text).replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_LENGTH);
}

/**
 * Read an explicit memory command from the start of a message. Nothing is
 * inferred: only "remember ...", "forget ...", and name introductions match.
 *
 * @param {string} text
 * @returns {MemoryCommand | null}
 */
export function parseMemoryCommand(text) {
  const source = String(text || "").trim();

  let match = source.match(
    /^(?:please\s+)?(?:remember|note down|keep in mind|don't forget|do not forget)\s+(?:that\s+|this:\s*)?([\s\S]+)$/i,
  );
  if (match) return { type: "add", text: clean(match[1]) };

  match = source.match(/^(?:please\s+)?forget\s+(?:that\s+|about\s+)?([\s\S]+)$/i);
  if (match) {
    const query = clean(match[1]);
    if (/^(?:everything|all|it all|everything about me)$/i.test(query))
      return { type: "forget-all" };
    return { type: "forget", text: query };
  }

  match = source.match(/^(?:my name is|i am called|call me)\s+([A-Za-z][A-Za-z' -]{0,39})[.!]*$/i);
  if (match)
    return { type: "add", text: `The user's name is ${clean(match[1]).replace(/[.!]+$/, "")}.` };

  return null;
}

/**
 * Apply a parsed command to an existing list without mutating the input.
 *
 * @param {MemoryNote[] | null | undefined} memory
 * @param {MemoryCommand | null | undefined} command
 * @returns {MemoryOutcome}
 */
export function applyMemoryCommand(memory, command) {
  const list = [...(memory || [])];
  const result = {
    memory: list,
    changed: false,
    added: null,
    removed: 0,
    duplicate: false,
    full: false,
  };
  if (!command) return result;

  if (command.type === "add") {
    if (!command.text) return result;
    if (list.some((item) => item.text.toLowerCase() === command.text.toLowerCase())) {
      result.duplicate = true;
      return result;
    }
    if (list.length >= MAX_MEMORIES) {
      result.full = true;
      return result;
    }
    const item = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: command.text,
      addedAt: Date.now(),
    };
    result.memory = [...list, item];
    result.added = item;
    result.changed = true;
    return result;
  }

  if (command.type === "forget-all") {
    result.removed = list.length;
    result.memory = [];
    result.changed = list.length > 0;
    return result;
  }

  const query = command.text.toLowerCase();
  const kept = list.filter((item) => !item.text.toLowerCase().includes(query));
  result.removed = list.length - kept.length;
  result.memory = kept;
  result.changed = result.removed > 0;
  return result;
}

/**
 * Build the optional memory block added to the model context. Returns null
 * when there is nothing to add.
 *
 * @param {MemoryNote[] | null | undefined} memory
 * @param {string} latestUserText
 * @param {MemoryOutcome | null | undefined} outcome
 * @returns {string | null}
 */
export function buildMemoryPrompt(memory, latestUserText, outcome) {
  const parts = [];
  const list = memory || [];

  if (list.length) {
    parts.push(
      "Memory notes about the user, saved on this device and carried across conversations:\n" +
        list.map((item) => `- ${item.text}`).join("\n") +
        "\nWeave these in naturally when relevant. Never recite the list or mention that you keep notes.",
    );
  }

  const command = parseMemoryCommand(latestUserText);
  if (command?.type === "add") {
    if (outcome?.added)
      parts.push(
        "The user just asked you to remember something new. Confirm it in one short, natural sentence.",
      );
    else if (outcome?.duplicate)
      parts.push(
        "The user asked you to remember something you already know. Say so briefly, without repeating the whole note.",
      );
    else if (outcome?.full)
      parts.push(
        "The user asked you to remember something, but your memory is full. Tell them briefly and suggest forgetting an old note first.",
      );
  } else if (command?.type === "forget" || command?.type === "forget-all") {
    if (outcome?.removed)
      parts.push(
        "The user asked you to forget something and it was removed. Confirm briefly what is gone.",
      );
    else
      parts.push(
        "The user asked you to forget something, but no note matched. Say so plainly and briefly.",
      );
  }

  return parts.join("\n\n") || null;
}
