// Main-thread client for the embedding worker. The model is loaded lazily on
// first use: no embeddings, no download.
import type { KnowledgeProgress } from "../types.js";

interface Pending {
  resolve: (vectors: number[][]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, Pending>();

let progressListener: ((progress: KnowledgeProgress) => void) | null = null;

export function setEmbeddingProgressListener(
  listener: ((progress: KnowledgeProgress) => void) | null,
): void {
  progressListener = listener;
}

function ensureWorker(): Worker {
  if (worker) return worker;

  const next = new Worker(new URL("./embed-worker.ts", import.meta.url), { type: "module" });

  next.onmessage = (event: MessageEvent) => {
    const data = event.data as
      | { type: "result"; id: number; vectors: number[][] }
      | { type: "error"; id: number; message: string }
      | { type: "progress"; file: string; loaded: number; total: number }
      | undefined;

    if (!data) return;

    if (data.type === "progress") {
      progressListener?.({
        phase: "download",
        file: data.file,
        loaded: data.loaded,
        total: data.total,
      });
      return;
    }

    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);

    if (data.type === "result") entry.resolve(data.vectors);
    else entry.reject(new Error(data.message || "Embedding failed."));
  };

  next.onerror = () => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("The embedding worker stopped unexpectedly."));
      pending.delete(id);
    }
    worker?.terminate();
    worker = null;
  };

  worker = next;
  return next;
}

/**
 * Embed one or more strings with all-MiniLM-L6-v2 (384 dimensions).
 * The first call downloads and loads the model.
 */
export function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return Promise.resolve([]);

  let target: Worker;
  try {
    target = ensureWorker();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  const id = ++requestId;

  return new Promise<number[][]>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        pending.delete(id);
        reject(new Error("Embedding took too long. Check your connection and try again."));
      },
      10 * 60 * 1000,
    );

    pending.set(id, { resolve, reject, timer });
    target.postMessage({ type: "embed", id, texts });
  });
}

/** Stop the worker and free the model's memory. */
export function disposeEmbeddings(): void {
  worker?.terminate();
  worker = null;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error("Embedding was cancelled."));
  }
  pending.clear();
}
