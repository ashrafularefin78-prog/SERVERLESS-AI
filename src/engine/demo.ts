// Built-in, model-free reply engine. This module deliberately has no DOM or
// app-state imports so it can be unit-tested in Node and moved to a Worker
// later without changing the UI.
import { demoChatReply } from "../chat/replies.js";
import { parseMemoryCommand } from "../memory.js";
import type { ChatMessage, DemoOptions, MemoryNote, MemoryOutcome, StreamChunk } from "../types.js";

export interface BuildDemoReplyInput {
  prompt?: string;
  messages?: ChatMessage[];
  memory?: (MemoryNote | string)[];
  memoryOutcome?: MemoryOutcome | null;
  buildDemoReply?: DemoOptions["buildDemoReply"];
}

/**
 * Resolve the reply text for one turn. Pure and deterministic apart from the
 * reply rules themselves, which makes it the main unit-test seam.
 */
export function buildDemoReply({
  prompt = "",
  messages = [],
  memory = [],
  memoryOutcome = null,
  buildDemoReply = null,
}: BuildDemoReplyInput = {}): string {
  const commandReply = memoryCommandReply(prompt, memoryOutcome);
  if (commandReply) return commandReply;

  if (typeof buildDemoReply === "function") {
    return buildDemoReply({ prompt, messages, systemPrompt: messages[0]?.content || "" });
  }

  return demoChatReply({ prompt, messages, memory });
}

/** Stream a reply word by word so the chat UI can render it like a model. */
export async function* generateDemo(
  messages: ChatMessage[],
  signal?: AbortSignal,
  demo: DemoOptions | null = null,
  options: { delayMs?: number } = {},
): AsyncGenerator<StreamChunk> {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const prompt = lastUser?.content?.trim() || "your message";
  const reply = buildDemoReply({
    prompt,
    messages,
    memory: demo?.memory || [],
    memoryOutcome: demo?.memoryOutcome,
    buildDemoReply: demo?.buildDemoReply,
  });
  const chunks = reply.match(/\S+\s*/g) || [reply];
  const fixedDelay =
    options.delayMs !== undefined && Number.isFinite(options.delayMs)
      ? Math.max(0, options.delayMs)
      : null;

  for (const chunk of chunks) {
    if (signal?.aborted) return;
    yield { text: chunk };
    await sleep(fixedDelay ?? 14 + Math.random() * 26);
  }

  yield { usage: { completion_tokens: chunks.length, total_tokens: chunks.length } };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Deterministic confirmation text for explicit memory commands. The app has
 * already applied the command before generation starts.
 */
function memoryCommandReply(
  prompt: string,
  memoryOutcome: MemoryOutcome | null = null,
): string | null {
  const command = parseMemoryCommand(prompt);
  if (!command) return null;

  if (command.type === "add") {
    const name = (command.text ?? "").match(/^The user's name is ([A-Za-z][A-Za-z' -]{0,39})\.$/);
    if (name && memoryOutcome?.added) {
      return `Nice to meet you, ${escapeMarkdown(name[1] ?? "")}. I'll remember your name on this device.`;
    }
    if (memoryOutcome?.added) {
      return `Got it, I'll remember that ${escapeMarkdown(command.text ?? "")}\n\nIt stays on this device and will follow you into later chats. You can view or remove it under Settings, Memory.`;
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

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}
