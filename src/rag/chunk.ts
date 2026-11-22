// Text chunking for retrieval. Pure and deterministic: the same document
// always produces the same chunks, which keeps the stored index stable across
// reloads and makes this testable in Node.
import { RAG } from "./config.js";

export interface ChunkOptions {
  /** Soft ceiling for one chunk, in characters. */
  maxChars?: number;
  /** Characters of the previous chunk repeated at the start of the next. */
  overlapChars?: number;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(200, options.maxChars ?? RAG.chunkChars);
  const overlapChars = Math.min(
    Math.max(0, options.overlapChars ?? RAG.overlapChars),
    Math.floor(maxChars / 3),
  );

  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!normalized) return [];

  const units: string[] = [];

  for (const paragraph of normalized.split(/\n{2,}/)) {
    const clean = paragraph.trim();
    if (!clean) continue;

    if (clean.length <= maxChars) {
      units.push(clean);
      continue;
    }

    for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if (trimmed.length <= maxChars) units.push(trimmed);
      else units.push(...hardSplit(trimmed, maxChars));
    }
  }

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (!current) {
      current = unit;
    } else if (current.length + 1 + unit.length <= maxChars) {
      current = `${current}\n${unit}`;
    } else {
      chunks.push(current);
      current = unit;
    }
  }

  if (current) chunks.push(current);
  if (overlapChars === 0 || chunks.length < 2) return chunks;

  return chunks.map((chunk, index) => {
    if (index === 0) return chunk;
    const tail = wordTail(chunks[index - 1] ?? "", overlapChars);
    return tail ? `${tail}\n${chunk}` : chunk;
  });
}

/** Split a single over-long unit on word boundaries, never mid-word if avoidable. */
function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"));
      if (cut > maxChars * 0.5) end = start + cut;
    }
    const piece = text.slice(start, end).trim();
    if (piece) parts.push(piece);
    if (end >= text.length) break;
    start = Math.max(end, start + 1);
  }

  return parts;
}

/** Last `size` characters, trimmed forward to the next word start. */
function wordTail(text: string, size: number): string {
  if (size <= 0 || !text) return "";
  const tail = text.slice(-size);
  const space = tail.indexOf(" ");
  if (space > 0 && space < tail.length - 1) return tail.slice(space + 1).trim();
  return tail.trim();
}
