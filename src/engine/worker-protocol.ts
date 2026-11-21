// Shared message shapes between the page and the model worker. Keeping them in
// one place means a request that compiles on one side cannot drift silently
// from the handler on the other.

export type CacheOperation = "has" | "delete";

export interface CacheRequest {
  kind: "localmind:cache";
  id: number;
  op: CacheOperation;
  modelId: string;
}

export type CacheResponse =
  | { kind: "localmind:cache-result"; id: number; ok: true; value: unknown }
  | { kind: "localmind:cache-result"; id: number; ok: false; error: string };

/** Worker -> page report used when the inference worker dies unexpectedly. */
export interface WorkerCrashReport {
  kind: "localmind:worker-crash";
  reason: "oom" | "crash";
  message: string;
  modelId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCacheRequest(data: unknown): data is CacheRequest {
  if (!isRecord(data) || data.kind !== "localmind:cache") return false;
  return (
    typeof data.id === "number" &&
    (data.op === "has" || data.op === "delete") &&
    typeof data.modelId === "string"
  );
}

export function isCacheResponse(data: unknown): data is CacheResponse {
  if (!isRecord(data) || data.kind !== "localmind:cache-result") return false;
  if (typeof data.id !== "number" || typeof data.ok !== "boolean") return false;
  return data.ok === true ? "value" in data : typeof data.error === "string";
}

export function isWorkerCrashReport(data: unknown): data is WorkerCrashReport {
  if (!isRecord(data) || data.kind !== "localmind:worker-crash") return false;
  return (
    (data.reason === "oom" || data.reason === "crash") &&
    typeof data.message === "string" &&
    (data.modelId === null || typeof data.modelId === "string")
  );
}

/**
 * Errors a crashed inference worker reports when the device is out of GPU or
 * WASM memory. Matching stays explicit so an ordinary bug is not mislabelled.
 */
const OUT_OF_MEMORY_PATTERNS = [
  /out of memory/i,
  /\boom\b/i,
  /device lost/i,
  /memory access out of bounds/i,
  /allocation failed/i,
  /failed to allocate/i,
  /insufficient memory/i,
  /array buffer allocation/i,
];

export function isOutOfMemoryMessage(message: string): boolean {
  return OUT_OF_MEMORY_PATTERNS.some((pattern) => pattern.test(String(message ?? "")));
}
