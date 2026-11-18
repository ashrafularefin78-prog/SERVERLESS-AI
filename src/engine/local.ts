// Keep both inference runtimes lazy so built-in chat needs no model download.
import type { ChatMessage, ModelProgress, StreamChunk } from "../types.js";
import { MODEL_CACHE, modelById } from "./models.js";
import type { LocalModel } from "./models.js";

type WebLLMApi = typeof import("@mlc-ai/web-llm");
type WebLLMEngine = import("@mlc-ai/web-llm").WebWorkerMLCEngine;

let engine: WebLLMEngine | null = null;
let worker: Worker | null = null;
let cacheWorker: Worker | null = null;
let loadedModelId: string | null = null;
let ggufBackend: typeof import("./gguf.js") | null = null;

interface CacheResponse {
  kind: "localmind:cache-result";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

let cacheRequestId = 0;
const cacheRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

/**
 * A dedicated worker for storage questions. The inference worker's message
 * channel belongs to WebLLM's client, so cache replies get their own worker
 * (the inference library chunk is already cached by the browser).
 */
function ensureCacheWorker(): Worker {
  if (cacheWorker) return cacheWorker;

  const nextWorker = new Worker(new URL("./model-worker.ts", import.meta.url), {
    type: "module",
  });
  nextWorker.onmessage = (event: MessageEvent) => {
    const data = event.data as CacheResponse | undefined;
    if (!data || data.kind !== "localmind:cache-result") return;
    const pending = cacheRequests.get(data.id);
    if (!pending) return;
    cacheRequests.delete(data.id);
    if (data.ok) pending.resolve(data.value);
    else pending.reject(new Error(data.error || "Cache operation failed."));
  };

  cacheWorker = nextWorker;
  return nextWorker;
}

function cacheRequest<T>(op: "has" | "delete", modelId: string): Promise<T> {
  const target = ensureCacheWorker();
  const id = ++cacheRequestId;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cacheRequests.delete(id);
      reject(new Error("The model cache did not respond."));
    }, 30_000);

    cacheRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value as T);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });

    try {
      target.postMessage({ kind: "localmind:cache", id, op, modelId });
    } catch (error) {
      cacheRequests.delete(id);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function loadApi(): Promise<WebLLMApi> {
  return import("@mlc-ai/web-llm");
}

/** WebLLM's pinned records plus the OPFS cache backend. */
function appConfig(api: WebLLMApi) {
  return {
    ...api.prebuiltAppConfig,
    cacheBackend: MODEL_CACHE.backend,
    opfsAccessMode: MODEL_CACHE.accessMode,
  };
}

export type SupportReport =
  | { available: false; reason: string }
  | {
      available: true;
      reason: string;
      features: string[];
      maxStorageBufferBindingSize: number;
    };

export function modelSupportReason(model: LocalModel, support: SupportReport): string | null {
  if (model.runtime === "gguf") {
    if (typeof WebAssembly === "undefined" || typeof Worker === "undefined") {
      return "Community GGUF models need a browser with WebAssembly and Web Workers.";
    }
    if (!("Suspending" in WebAssembly)) {
      return "Community GGUF models need a current Chrome or Edge with WebAssembly JSPI support.";
    }
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      return "Community GGUF models need browser private storage on HTTPS or localhost.";
    }
    return null;
  }
  if (!support.available) return support.reason;
  const missing = model.requiredFeatures.filter((feature) => !support.features.includes(feature));
  if (missing.length) {
    return `This model requires GPU features unavailable on this device: ${missing.join(", ")}. Pick another variant.`;
  }
  if (model.bufferSizeBytes > support.maxStorageBufferBindingSize) {
    return "This model needs larger GPU buffers than this device supports. Pick another model.";
  }
  return null;
}

/**
 * Probe for WebGPU without touching the inference library. A browser can
 * expose `navigator.gpu` and still hand back a null adapter (blocklisted GPU,
 * software renderer, disabled flag), so the adapter is the real test.
 */
export async function detectSupport(): Promise<SupportReport> {
  const nav = (typeof navigator === "undefined" ? undefined : navigator) as
    | (Navigator & {
        gpu?: {
          requestAdapter(): Promise<{
            features: Iterable<string>;
            limits: { maxStorageBufferBindingSize: number };
          } | null>;
        };
      })
    | undefined;
  if (!nav?.gpu) {
    return {
      available: false,
      reason: "This browser has no WebGPU. Models need a current Chrome, Edge, or Safari.",
    };
  }
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return {
        available: false,
        reason: "WebGPU is present but no GPU adapter is available on this device.",
      };
    }
    return {
      available: true,
      reason: "WebGPU is available on this device.",
      features: [...adapter.features],
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    };
  } catch {
    return { available: false, reason: "WebGPU could not be started in this browser." };
  }
}

/** True when the model's weights and config are already in the local cache. */
export async function isModelCached(modelId: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return false;
  try {
    if (modelById(modelId)?.runtime === "gguf") {
      return await (await import("./gguf.js")).isModelCached(modelId);
    }
    return await cacheRequest<boolean>("has", modelId);
  } catch {
    return false;
  }
}

/** Remove a model's weights, config and compiled library from the cache. */
export async function deleteCachedModel(modelId: string): Promise<void> {
  if (modelById(modelId)?.runtime === "gguf") {
    await (await import("./gguf.js")).deleteCachedModel(modelId);
    return;
  }
  await cacheRequest<boolean>("delete", modelId);
}

export interface StorageUsage {
  usageMB: number;
  quotaMB: number;
}

export async function storageUsage(): Promise<StorageUsage | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return null;
    return {
      usageMB: Math.round((estimate.usage ?? 0) / 1048576),
      quotaMB: Math.round((estimate.quota ?? 0) / 1048576),
    };
  } catch {
    return null;
  }
}

/**
 * Download (if needed), compile and load a model into the worker. Progress is
 * forwarded from WebLLM: first a fetch report, then shader compilation.
 */
export async function loadModel(
  modelId: string,
  onProgress?: (progress: ModelProgress) => void,
): Promise<void> {
  if ((engine || ggufBackend) && loadedModelId === modelId) return;

  const model = modelById(modelId);
  if (!model) throw new Error("This model is not in the available catalogue.");
  const unsupportedReason = modelSupportReason(model, await detectSupport());
  if (unsupportedReason) throw new Error(unsupportedReason);

  await unload();

  if (model.runtime === "gguf") {
    ggufBackend = await import("./gguf.js");
    await ggufBackend.loadModel(modelId, onProgress);
    loadedModelId = modelId;
    return;
  }

  const api = await loadApi();

  // Ask the browser to keep the weights instead of evicting them under
  // storage pressure. Best effort: a refusal is not fatal.
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is a hint, not a requirement.
  }

  const nextWorker = new Worker(new URL("./model-worker.ts", import.meta.url), {
    type: "module",
  });

  const nextEngine = new api.WebWorkerMLCEngine(nextWorker, {
    appConfig: appConfig(api),
    initProgressCallback: (report) => {
      onProgress?.({ text: report.text, progress: report.progress });
    },
  });

  try {
    await nextEngine.reload(modelId);
  } catch (error) {
    nextWorker.terminate();
    try {
      await nextEngine.unload();
    } catch {
      // The worker is already gone.
    }
    throw error;
  }

  engine = nextEngine;
  worker = nextWorker;
  loadedModelId = modelId;
}

export function isLoaded(modelId: string): boolean {
  return loadedModelId === modelId && (engine !== null || ggufBackend !== null);
}

export function loadedModel(): string | null {
  return loadedModelId;
}

/** Unload the model, terminate the worker, and free GPU memory. */
export async function unload(): Promise<void> {
  const current = engine;
  const currentWorker = worker;
  const currentGGUF = ggufBackend;
  ggufBackend = null;
  engine = null;
  worker = null;
  loadedModelId = null;

  await currentGGUF?.unload();

  if (current) {
    try {
      await current.unload();
    } catch {
      // Engine may already be disposed.
    }
  }
  currentWorker?.terminate();
  cacheWorker?.terminate();
  cacheWorker = null;
  for (const pending of cacheRequests.values()) {
    pending.reject(new Error("The model cache worker was stopped."));
  }
  cacheRequests.clear();
}

/** Ask the worker to stop generating. Safe to call when idle. */
export function interrupt(): void {
  ggufBackend?.interrupt();
  try {
    engine?.interruptGenerate();
  } catch {
    // Interrupting an idle engine is harmless.
  }
}

/**
 * Stream a completion from the loaded model. The signal is wired to
 * `interruptGenerate()` so the UI's stop button ends the worker-side loop.
 */
export async function* streamModel(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  if (ggufBackend) {
    yield* ggufBackend.streamModel(messages, signal);
    return;
  }
  if (!engine) throw new Error("No on-device model is loaded.");

  const onAbort = () => interrupt();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 1024,
    });

    for await (const chunk of stream) {
      if (signal?.aborted) return;
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) yield { text };
      const usage = chunk.usage;
      if (usage) {
        yield {
          usage: {
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          },
        };
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
