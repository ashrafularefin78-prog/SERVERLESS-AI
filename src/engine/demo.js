// Built-in, model-free reply engine. This module deliberately has no DOM or
// app-state imports so it can be unit-tested in Node and moved to a Worker
// later without changing the UI.
import { demoChatReply } from "../chat/replies.js";
import { parseMemoryCommand } from "../memory.js";

/**
 * @typedef {Object} ChatMessage
 * @property {"system" | "user" | "assistant"} role
 * @property {string} content
 */

/**
 * @typedef {Object} MemoryNote
 * @property {string} text
 */

/**
 * @typedef {Object} MemoryOutcome
 * @property {boolean} changed
 * @property {MemoryNote|null} added
 * @property {number} removed
 * @property {boolean} duplicate
 * @property {boolean} full
 */

/**
 * Resolve the reply text for one demo turn. Pure and deterministic apart from
 * the reply rules themselves, which makes it the main unit-test seam.
 *
 * @param {Object} [input]
 * @param {string} [input.prompt] Latest user message.
 * @param {ChatMessage[]} [input.messages] Full conversation, oldest first.
 * @param {Array<MemoryNote|string>} [input.memory] Saved memory notes.
 * @param {MemoryOutcome|null} [input.memoryOutcome] Result of applyMemoryCommand for this turn.
 * @param {((args: { prompt: string, messages: ChatMessage[], systemPrompt: string }) => string)|null} [input.buildDemoReply]
 *   Optional mode-specific reply builder (for example the Coder demo).
 * @param {string} [input.modelKey] Active model key; custom replies only run for "demo".
 * @returns {string}
 */
export function buildDemoReply({
  prompt,
  messages = [],
  memory = [],
  memoryOutcome = null,
  buildDemoReply = null,
  modelKey = "demo",
} = {}) {
  const commandReply = memoryCommandReply(prompt, memoryOutcome);
  if (commandReply) return commandReply;

  if (modelKey === "demo" && typeof buildDemoReply === "function") {
    return buildDemoReply({ prompt, messages, systemPrompt: messages[0]?.content || "" });
  }

  return demoChatReply({ prompt, messages, memory });
}

/**
 * Stream a demo reply word by word so the chat UI can render it like a model.
 *
 * @param {ChatMessage[]} messages Conversation sent to the engine, oldest first.
 * @param {AbortSignal} [signal] Stops the stream before the next chunk.
 * @param {Object|null} [demo] Demo options forwarded by the app.
 * @param {Array<MemoryNote|string>} [demo.memory]
 * @param {MemoryOutcome|null} [demo.memoryOutcome]
 * @param {Function|null} [demo.buildDemoReply]
 * @param {Object} [options]
 * @param {string} [options.modelKey] Active model key.
 * @param {number} [options.delayMs] Fixed delay between chunks. Tests pass 0.
 * @yields {{ text: string } | { usage: { completion_tokens: number, total_tokens: number } }}
 */
export async function* generateDemo(messages, signal, demo = null, options = {}) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const prompt = lastUser?.content?.trim() || "your message";
  const reply = buildDemoReply({
    prompt,
    messages,
    memory: demo?.memory || [],
    memoryOutcome: demo?.memoryOutcome,
    buildDemoReply: demo?.buildDemoReply,
    modelKey: options.modelKey,
  });
  const chunks = reply.match(/\S+\s*/g) || [reply];
  const fixedDelay = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : null;

  for (const chunk of chunks) {
    if (signal?.aborted) return;
    yield { text: chunk };
    await sleep(fixedDelay ?? 14 + Math.random() * 26);
  }

  yield { usage: { completion_tokens: chunks.length, total_tokens: chunks.length } };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Deterministic confirmation text for explicit memory commands. The app has
 * already applied the command before generation starts.
 *
 * @param {string} prompt Latest user message.
 * @param {MemoryOutcome|null} [memoryOutcome]
 * @returns {string|null}
 */
function memoryCommandReply(prompt, memoryOutcome = null) {
  const command = parseMemoryCommand(prompt);
  if (!command) return null;

  if (command.type === "add") {
    const name = command.text.match(/^The user's name is ([A-Za-z][A-Za-z' -]{0,39})\.$/);
    if (name && memoryOutcome?.added) {
      return `Nice to meet you, ${escapeMarkdown(name[1])}. I'll remember your name on this device.`;
    }
    if (memoryOutcome?.added) {
      return `Got it, I'll remember that ${escapeMarkdown(command.text)}\n\nIt stays on this device and will follow you into later chats. You can view or remove it under Settings, Memory.`;
    }
    if (memoryOutcome?.duplicate)
      return "I already have that note, so nothing new was saved. Settings, Memory shows what I know.";
    if (memoryOutcome?.full)
      return "My memory is full, so I couldn't save that. Forget an old note first, then ask me again.";
  }

  if (command.type === "forget" || command.type === "forget-all") {
    if (memoryOutcome?.removed) {
      return command.type === "forget-all"
        ? "Done, I've forgotten everything I had noted about you."
        : `Done, I forgot ${memoryOutcome.removed} note${memoryOutcome.removed === 1 ? "" : "s"} matching that.`;
    }
    return "I looked, but no note matched that, so there was nothing to forget.";
  }

  return null;
}

function escapeMarkdown(text) {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}
