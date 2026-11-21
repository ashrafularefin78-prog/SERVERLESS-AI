import { CacheManager, Wllama } from "@wllama/wllama";
import wasmURL from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { recordDiagnostic } from "../diagnostics.js";
import { modelById } from "./models.js";
import {
  createOpfsStore,
  deleteStoredModel,
  downloadResumable,
  isStoredModelComplete,
  supportsResumableStore,
} from "./resumable-download.js";
import type { ChatMessage, ModelProgress, StreamChunk } from "../types.js";

let cache: CacheManager | null = null;
let runtime: Wllama | null = null;
let generation: AbortController | null = null;

function modelCache(): CacheManager {
  return (cache ??= new CacheManager());
}

function ggufModel(modelId: string) {
  const model = modelById(modelId);
  if (!model || model.runtime !== "gguf") {
    throw new Error("This model is not in the community GGUF catalogue.");
  }
  return model;
}

export async function isModelCached(modelId: string): Promise<boolean> {
  const model = ggufModel(modelId);

  // A resumable download of ours wins: it is the same weights, stored whole.
  if (await supportsResumableStore()) {
    try {
      if (await isStoredModelComplete(model.url, model.downloadBytes)) return true;
    } catch {
      // Fall through to the wllama cache.
    }
  }

  const files = await modelCache().list();
  return files.some(
    (file) =>
      file.metadata.originalURL === model.url &&
      file.size === model.downloadBytes &&
      file.metadata.originalSize === model.downloadBytes,
  );
}

export async function deleteCachedModel(modelId: string): Promise<void> {
  const model = ggufModel(modelId);
  await deleteStoredModel(model.url).catch(() => {});
  await modelCache().delete(model.url);
}

export async function loadModel(
  modelId: string,
  onProgress?: (progress: ModelProgress) => void,
): Promise<void> {
  const model = ggufModel(modelId);
  await unload();
  await navigator.storage.persist?.().catch(() => false);

  const next = new Wllama(
    { default: wasmURL },
    { allowOffline: true, cacheManager: modelCache(), suppressNativeLog: true },
  );
  next.setCompat(null);
  runtime = next;

  try {
    const params = {
      n_threads: 1,
      n_gpu_layers: 0,
      n_ctx: model.contextWindow ?? 4096,
      n_parallel: 1,
      jinja: true,
    };

    if (await supportsResumableStore()) {
      // Download through our own store so an interrupted transfer resumes.
      const store = createOpfsStore(model.url);
      try {
        const result = await downloadResumable({
          url: model.url,
          store,
          expectedSize: model.downloadBytes,
          onProgress: ({ loaded, total, resumedFrom }) => {
            const progress = Math.min(loaded / (total || model.downloadBytes), 1) * 0.9;
            const resumed =
              resumedFrom > 0 && loaded >= resumedFrom
                ? ` (resuming at ${Math.round((resumedFrom / (total || model.downloadBytes)) * 100)}%)`
                : "";
            onProgress?.({
              text:
                loaded < (total || model.downloadBytes)
                  ? `Downloading community model: ${Math.round(progress * 100)}%${resumed}`
                  : "Loading community model on your CPU...",
              progress,
            });
          },
        });
        await store.markComplete(result.bytes, result.etag);
        onProgress?.({ text: "Loading community model on your CPU...", progress: 0.9 });
        await next.loadModel([result.blob], params);
      } catch (error) {
        // Partial bytes stay on disk so the next attempt resumes, but a hard
        // failure must still surface to the caller.
        throw error;
      }
    } else {
      await next.loadModelFromUrl(model.url, {
        ...params,
        progressCallback: ({ loaded, total }) => {
          const progress = Math.min(loaded / (total || model.downloadBytes), 1);
          onProgress?.({
            text:
              progress < 1
                ? `Downloading community model: ${Math.round(progress * 100)}%`
                : "Loading community model on your CPU...",
            progress: progress * 0.9,
          });
        },
      });
    }
    onProgress?.({ text: "Community model ready on your CPU.", progress: 1 });
  } catch (error) {
    recordDiagnostic({
      level: "error",
      source: "gguf",
      message: error instanceof Error ? error.message : String(error),
      detail: `model: ${modelId}`,
    });
    await unload();
    throw error;
  }
}

export function interrupt(): void {
  generation?.abort();
}

export async function unload(): Promise<void> {
  interrupt();
  const current = runtime;
  runtime = null;
  await current?.exit();
}

export async function* streamModel(
  messages: ChatMessage[],
  signal?: AbortSignal,
  maxTokens = 1024,
): AsyncGenerator<StreamChunk> {
  if (!runtime) throw new Error("No community model is loaded.");
  if (signal?.aborted) return;

  const controller = new AbortController();
  generation = controller;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const stream = await runtime.createChatCompletion({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.7,
      top_p: 0.95,
      chat_template_kwargs: { enable_thinking: false },
      abortSignal: controller.signal,
    });
    for await (const chunk of stream) {
      if (controller.signal.aborted) return;
      const text = chunk.choices[0]?.delta.content ?? "";
      if (text) yield { text };
      if (chunk.usage) {
        yield {
          usage: {
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
          },
        };
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    controller.abort();
    signal?.removeEventListener("abort", onAbort);
    if (generation === controller) generation = null;
  }
}
