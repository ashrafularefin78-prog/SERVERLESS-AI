// Context-window management for the model-free engine. When a conversation
// outgrows the bounded window, older turns are dropped from the live context.
// Instead of losing them silently, we keep an extractive digest of the dropped
// turns and carry it as a system note, and we can recap it on request.
// Pure: no DOM, no app state, no network.
import type { ChatMessage } from "./types.js";

export const COMPACTION_HEADER = "Earlier in this conversation (compacted to fit context):";

export interface ContextLimits {
  maxMessages: number;
  maxChars: number;
}

export interface CompactionResult {
  kept: ChatMessage[];
  dropped: ChatMessage[];
  summary: string | null;
}

const MAX_SUMMARY_ITEMS = 6;
const MAX_SUMMARY_CHARS = 500;
const MAX_TOPIC_CHARS = 90;

function topicLine(content: string): string {
  const flat = String(content ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "";
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const line = sentence.length <= MAX_TOPIC_CHARS ? sentence : flat;
  return line.length > MAX_TOPIC_CHARS ? `${line.slice(0, MAX_TOPIC_CHARS - 1).trimEnd()}…` : line;
}

/** Extractive digest of the turns that fell out of the window: the user's topics. */
export function buildHistorySummary(dropped: ChatMessage[]): string | null {
  const seen = new Set<string>();
  const items: string[] = [];
  let chars = 0;
  for (const message of dropped) {
    if (message.role !== "user") continue;
    const line = topicLine(message.content);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    if (items.length >= MAX_SUMMARY_ITEMS || chars + line.length > MAX_SUMMARY_CHARS) break;
    seen.add(key);
    items.push(line);
    chars += line.length;
  }
  if (!items.length) return null;
  return items.map((line) => `- ${line}`).join("\n");
}

/**
 * Split history into the suffix that fits the window and the prefix that does
 * not, mirroring the app's tail-first trimming. `measure` lets the caller budget
 * by transformed content while we return the original message objects.
 */
export function compactHistory(
  history: ChatMessage[],
  limits: ContextLimits,
  measure: (message: ChatMessage) => string = (message) => message.content,
): CompactionResult {
  const kept: ChatMessage[] = [];
  let characters = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]!;
    if (kept.length >= limits.maxMessages) break;
    const length = measure(message).length;
    if (characters + length > limits.maxChars && kept.length > 0) break;
    kept.unshift(message);
    characters += length;
  }
  const dropped = history.slice(0, history.length - kept.length);
  return { kept, dropped, summary: buildHistorySummary(dropped) };
}

/** The system-note block carrying the digest, or null when nothing was dropped. */
export function formatCompactionNote(summary: string | null): string | null {
  if (!summary) return null;
  return `${COMPACTION_HEADER}\n${summary}`;
}

/** Read the digest back out of a system message, if present. */
export function readCompactionSummary(messages: ChatMessage[]): string | null {
  const system = messages.find((message) => message.role === "system");
  const content = system?.content ?? "";
  const at = content.indexOf(COMPACTION_HEADER);
  if (at < 0) return null;
  const block = content.slice(at + COMPACTION_HEADER.length).trim();
  return block || null;
}

const RECAP_INTENT =
  /\b(?:recap|recapitulate)\b|\b(?:summarize|summarise|summary)\b[^.]*\b(?:conversation|chat|discussion|thread|we|us|our|so far|earlier|above)\b|\bwhat (?:did|have) (?:we|i) (?:talk about|discuss|say|cover)\b|\bwhat (?:was|were) we (?:talking|discussing)\b/;

/**
 * Answer "recap / what did we talk about" from the compacted digest plus the
 * prior turns still in the window. Returns null when the prompt is not a recap
 * request, so other rules (including passage-summarize) keep their behavior.
 */
export function recapReply(messages: ChatMessage[]): string | null {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const prompt = String(lastUser?.content ?? "").toLowerCase();
  if (!RECAP_INTENT.test(prompt)) return null;

  const topics: string[] = [];
  const summary = readCompactionSummary(messages);
  if (summary) {
    for (const line of summary.split("\n")) {
      const text = line.replace(/^-\s*/, "").trim();
      if (text) topics.push(text);
    }
  }
  const priorUsers = messages.filter((message) => message.role === "user");
  for (const message of priorUsers.slice(0, -1)) {
    const line = topicLine(message.content);
    if (line && !topics.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
      topics.push(line);
    }
  }

  if (!topics.length) {
    return "We're just getting started, so there isn't much to recap yet. Tell me what's on your mind and I'll keep the thread as we go.";
  }
  const listed = topics
    .slice(0, MAX_SUMMARY_ITEMS)
    .map((line) => `- ${line}`)
    .join("\n");
  return `Here's the thread so far:\n${listed}\n\nWant to pick up any of these, or add something new?`;
}
