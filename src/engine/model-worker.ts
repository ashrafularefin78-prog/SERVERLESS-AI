// Web Worker that owns the WebLLM engine. All WebGPU work, weight downloads
// and tokenisation happen here so the UI thread never blocks on inference.
//
// It also answers lightweight cache queries (is a model downloaded? delete its
// weights) so the page never has to import the inference library just to look
// at storage.
import {
  WebWorkerMLCEngineHandler,
  deleteModelAllInfoInCache,
  hasModelInCache,
  prebuiltAppConfig,
} from "@mlc-ai/web-llm";
import { MODEL_CACHE } from "./models.js";
import { isCacheRequest, type CacheResponse } from "./worker-protocol.js";

const appConfig = {
  ...prebuiltAppConfig,
  cacheBackend: MODEL_CACHE.backend,
  opfsAccessMode: MODEL_CACHE.accessMode,
};

const handler = new WebWorkerMLCEngineHandler();

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (event: MessageEvent) => {
  const data = event.data as unknown;

  if (isCacheRequest(data)) {
    void (async () => {
      try {
        const value =
          data.op === "has"
            ? await hasModelInCache(data.modelId, appConfig)
            : (await deleteModelAllInfoInCache(data.modelId, appConfig), true);
        const response: CacheResponse = {
          kind: "localmind:cache-result",
          id: data.id,
          ok: true,
          value,
        };
        scope.postMessage(response);
      } catch (error) {
        const response: CacheResponse = {
          kind: "localmind:cache-result",
          id: data.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
        scope.postMessage(response);
      }
    })();
    return;
  }

  handler.onmessage(event);
};
