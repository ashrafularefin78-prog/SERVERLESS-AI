// Turns a raw indexing event into something a person can read: a percentage and a
// sentence. Pure, so the wording and the arithmetic are testable without a model.
import type { KnowledgeProgress } from "../types.js";

export interface IndexProgressView {
  /** 0-100, monotonically increasing across the stages of one document. */
  percent: number;
  label: string;
  /** True while the work is still running, so the UI can show a moving bar. */
  busy: boolean;
}

/**
 * Indexing has four stages and they cost very different amounts of time: chunking
 * is instant, the first embedding call may download ~25 MB, embedding dominates,
 * and saving is quick. The bar reflects that instead of pretending each stage is a
 * quarter of the work.
 */
export function describeIndexProgress(progress: KnowledgeProgress): IndexProgressView {
  const file = progress.file || "document";
  const total = progress.total > 0 ? progress.total : 1;
  const ratio = Math.min(1, Math.max(0, progress.loaded / total));

  switch (progress.phase) {
    case "chunk":
      return { percent: 5, label: `Reading ${file}...`, busy: true };
    case "download": {
      const percent = Math.round(10 + ratio * 30);
      return {
        percent,
        label: `Preparing the on-device embedding model... ${Math.round(ratio * 100)}%`,
        busy: true,
      };
    }
    case "embed": {
      const percent = Math.round(40 + ratio * 50);
      return {
        percent,
        label: `Generating embeddings for ${file}... ${progress.loaded}/${progress.total} chunks`,
        busy: true,
      };
    }
    case "save":
      return { percent: 95, label: `Saving ${file} to this device...`, busy: true };
    default:
      return { percent: 0, label: `Indexing ${file}...`, busy: false };
  }
}
