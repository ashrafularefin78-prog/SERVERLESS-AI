import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CacheManager, Wllama } from "@wllama/wllama";
import { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { DEFAULT_MODEL_ID, GGUF_MODELS } from "../../src/engine/models.js";

vi.mock("@wllama/wllama", () => ({ CacheManager: vi.fn(), Wllama: vi.fn() }));
vi.mock("@mlc-ai/web-llm", () => ({ WebWorkerMLCEngine: vi.fn() }));
vi.mock("@wllama/wllama/esm/wasm/wllama.wasm?url", () => ({
  default: "/assets/wllama.wasm",
}));

const [model, otherModel] = GGUF_MODELS;
const messages = [
  { role: "system", content: "Answer briefly." },
  { role: "user", content: "Hello" },
];
const usage = { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 };
let gguf;
let local;
let runtimes;
let entries;
let cacheManager;
let loadFromUrl;
let createCompletion;
let fetchMock;
let workerMock;
let suspendingDescriptor;

function cacheName(url) {
  return `${createHash("sha1").update(url).digest("hex")}_${url.split("/").pop()}`;
}

function cachedFile(record) {
  return {
    name: cacheName(record.url),
    size: record.downloadBytes,
    metadata: {
      etag: "test-etag",
      originalURL: record.url,
      originalSize: record.downloadBytes,
    },
  };
}

function chunk(delta = {}, extra = {}) {
  return {
    id: "completion-1",
    object: "chat.completion.chunk",
    created: 1,
    model: model.id,
    choices: [{ index: 0, delta, finish_reason: null, logprobs: null }],
    ...extra,
  };
}

async function* chunks(...values) {
  yield* values;
}

async function collect(stream) {
  const result = [];
  for await (const value of stream) result.push(value);
  return result;
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  entries = [];
  runtimes = [];
  loadFromUrl = vi.fn().mockResolvedValue(undefined);
  createCompletion = vi.fn().mockImplementation(async () => chunks());
  cacheManager = {
    list: vi.fn(async () => [...entries]),
    // Wllama accepts URLs or storage keys, even when a partial file has no metadata.
    delete: vi.fn(async (nameOrURL) => {
      const name = cacheName(nameOrURL);
      entries = entries.filter((entry) => entry.name !== nameOrURL && entry.name !== name);
    }),
  };
  CacheManager.mockImplementation(function () {
    return cacheManager;
  });
  Wllama.mockImplementation(function () {
    this.setCompat = vi.fn();
    this.loadModelFromUrl = loadFromUrl;
    this.createChatCompletion = createCompletion;
    this.exit = vi.fn().mockResolvedValue(undefined);
    runtimes.push(this);
  });

  fetchMock = vi.fn().mockRejectedValue(new Error("Unexpected network request"));
  workerMock = vi.fn(function () {
    throw new Error("Unexpected WebLLM worker");
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Worker", workerMock);
  vi.stubGlobal("navigator", {
    storage: {
      getDirectory: vi.fn().mockResolvedValue({}),
      persist: vi.fn().mockResolvedValue(false),
    },
  });
  suspendingDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Suspending");
  Object.defineProperty(WebAssembly, "Suspending", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  gguf = await import("../../src/engine/gguf.js");
  local = await import("../../src/engine/local.js");
});

afterEach(async () => {
  try {
    await local.unload();
    await gguf.unload();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(workerMock).not.toHaveBeenCalled();
    expect(WebWorkerMLCEngine).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (suspendingDescriptor) {
      Object.defineProperty(WebAssembly, "Suspending", suspendingDescriptor);
    } else {
      Reflect.deleteProperty(WebAssembly, "Suspending");
    }
  }
});

describe("browser GGUF loading", () => {
  it.each(GGUF_MODELS)("loads the pinned URL for $id on one CPU thread", async (record) => {
    loadFromUrl.mockImplementationOnce(async () => {
      expect(runtimes[0].setCompat).toHaveBeenCalledExactlyOnceWith(null);
    });
    await gguf.loadModel(record.id);

    expect(record.url).toMatch(
      /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[a-f0-9]{40}\/[^/]+\.gguf$/,
    );
    expect(Wllama).toHaveBeenCalledExactlyOnceWith(
      { default: "/assets/wllama.wasm" },
      expect.objectContaining({ allowOffline: true, cacheManager }),
    );
    expect(loadFromUrl).toHaveBeenCalledExactlyOnceWith(
      record.url,
      expect.objectContaining({
        n_threads: 1,
        n_gpu_layers: 0,
        n_ctx: record.contextWindow,
        n_parallel: 1,
        jinja: true,
      }),
    );
  });

  it("reports download progress, handles missing totals, and reserves readiness for loading", async () => {
    const onProgress = vi.fn();
    loadFromUrl.mockImplementationOnce(async (_url, { progressCallback }) => {
      progressCallback({ loaded: 0, total: model.downloadBytes });
      progressCallback({ loaded: model.downloadBytes / 2, total: model.downloadBytes });
      progressCallback({ loaded: model.downloadBytes * 0.75, total: 0 });
      progressCallback({ loaded: model.downloadBytes * 2, total: model.downloadBytes });
      expect(onProgress).toHaveBeenLastCalledWith({
        text: "Loading community model on your CPU...",
        progress: 0.9,
      });
    });
    await gguf.loadModel(model.id, onProgress);
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { text: "Downloading community model: 0%", progress: 0 },
      { text: "Downloading community model: 50%", progress: 0.45 },
      { text: "Downloading community model: 75%", progress: 0.675 },
      { text: "Loading community model on your CPU...", progress: 0.9 },
      { text: "Community model ready on your CPU.", progress: 1 },
    ]);
  });

  it.each(["rejected", "unavailable"])(
    "treats %s storage persistence as best effort",
    async (state) => {
      if (state === "rejected") navigator.storage.persist.mockRejectedValue(new Error("Denied"));
      else delete navigator.storage.persist;
      await expect(gguf.loadModel(model.id)).resolves.toBeUndefined();
      expect(loadFromUrl).toHaveBeenCalledOnce();
    },
  );

  it("unloads the previous runtime and makes repeated unloads safe", async () => {
    gguf.interrupt();
    await gguf.unload();
    await gguf.loadModel(model.id);
    await gguf.loadModel(otherModel.id);
    expect(runtimes[0].exit).toHaveBeenCalledOnce();
    expect(runtimes[1].exit).not.toHaveBeenCalled();
    await gguf.unload();
    await gguf.unload();
    expect(runtimes[1].exit).toHaveBeenCalledOnce();
    await expect(collect(gguf.streamModel(messages))).rejects.toThrow(
      "No community model is loaded",
    );
    expect(cacheManager.delete).not.toHaveBeenCalled();
  });

  it("cleans up failed loading, preserves the error and cache, and permits retry", async () => {
    const error = new Error("Invalid GGUF");
    const onProgress = vi.fn();
    entries = [cachedFile(model)];
    loadFromUrl.mockRejectedValueOnce(error);
    await expect(gguf.loadModel(model.id, onProgress)).rejects.toBe(error);
    expect(runtimes[0].exit).toHaveBeenCalledOnce();
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ progress: 1 }));
    await expect(collect(gguf.streamModel(messages))).rejects.toThrow(
      "No community model is loaded",
    );
    expect(await gguf.isModelCached(model.id)).toBe(true);
    expect(cacheManager.delete).not.toHaveBeenCalled();
    await expect(gguf.loadModel(model.id)).resolves.toBeUndefined();
    expect(Wllama).toHaveBeenCalledTimes(2);
  });

  it("forgets the runtime even if exit fails", async () => {
    await gguf.loadModel(model.id);
    const error = new Error("Worker exit failed");
    runtimes[0].exit.mockRejectedValueOnce(error);
    await expect(gguf.unload()).rejects.toBe(error);
    await expect(collect(gguf.streamModel(messages))).rejects.toThrow(
      "No community model is loaded",
    );
    await gguf.unload();
    expect(runtimes[0].exit).toHaveBeenCalledOnce();
  });

  it.each(["", "unknown-model", "https://example.com/model.gguf", DEFAULT_MODEL_ID])(
    "rejects non-GGUF catalogue id %j without loading or deleting files",
    async (id) => {
      await expect(gguf.loadModel(id)).rejects.toThrow("community GGUF catalogue");
      await expect(gguf.isModelCached(id)).rejects.toThrow("community GGUF catalogue");
      await expect(gguf.deleteCachedModel(id)).rejects.toThrow("community GGUF catalogue");
      expect(Wllama).not.toHaveBeenCalled();
      expect(cacheManager.list).not.toHaveBeenCalled();
      expect(cacheManager.delete).not.toHaveBeenCalled();
    },
  );
});

describe("GGUF streaming", () => {
  it("requires a loaded model", async () => {
    await expect(collect(gguf.streamModel(messages))).rejects.toThrow(
      "No community model is loaded",
    );
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it.each(["empty choices", "text and usage"])("streams text and %s chunks", async (ending) => {
    await gguf.loadModel(model.id);
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    createCompletion.mockResolvedValueOnce(
      chunks(
        chunk({ role: "assistant" }),
        chunk({ content: "Hello" }),
        chunk({ content: null }),
        ending === "empty choices"
          ? chunk({}, { choices: [], usage })
          : chunk({ content: "!" }, { usage }),
      ),
    );
    expect(await collect(gguf.streamModel(messages, controller.signal))).toEqual([
      { text: "Hello" },
      ...(ending === "text and usage" ? [{ text: "!" }] : []),
      { usage: { completion_tokens: 2, total_tokens: 10 } },
    ]);
    expect(createCompletion).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        messages,
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(createCompletion.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not start inference for a pre-aborted signal", async () => {
    await gguf.loadModel(model.id);
    const controller = new AbortController();
    controller.abort();
    expect(await collect(gguf.streamModel(messages, controller.signal))).toEqual([]);
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it.each(["request", "iterator"])(
    "propagates %s errors and allows a fresh generation",
    async (phase) => {
      await gguf.loadModel(model.id);
      const error = new Error("Inference failed");
      if (phase === "request") createCompletion.mockRejectedValueOnce(error);
      else
        createCompletion.mockResolvedValueOnce(
          (async function* () {
            yield chunk({ content: "Partial" });
            throw error;
          })(),
        );
      await expect(collect(gguf.streamModel(messages))).rejects.toBe(error);
      expect(createCompletion.mock.calls[0][0].abortSignal.aborted).toBe(true);
      createCompletion.mockResolvedValueOnce(chunks(chunk({ content: "Recovered" })));
      expect(await collect(gguf.streamModel(messages))).toEqual([{ text: "Recovered" }]);
      expect(runtimes[0].exit).not.toHaveBeenCalled();
    },
  );

  it("drops buffered tokens after interruption without poisoning later generations", async () => {
    await gguf.loadModel(model.id);
    createCompletion.mockResolvedValueOnce(
      chunks(chunk({ content: "First" }), chunk({ content: "Late" })),
    );
    const stream = gguf.streamModel(messages);
    expect(await stream.next()).toEqual({ value: { text: "First" }, done: false });
    gguf.interrupt();
    expect(await stream.next()).toEqual({ value: undefined, done: true });
    gguf.interrupt();
    createCompletion.mockResolvedValueOnce(chunks(chunk({ content: "Next" })));
    expect(await collect(gguf.streamModel(messages))).toEqual([{ text: "Next" }]);
  });

  it("cancels inference when the consumer closes the stream", async () => {
    await gguf.loadModel(model.id);
    createCompletion.mockResolvedValueOnce(
      chunks(chunk({ content: "First" }), chunk({ content: "Late" })),
    );
    const stream = gguf.streamModel(messages);
    await stream.next();
    const signal = createCompletion.mock.calls[0][0].abortSignal;
    expect(signal.aborted).toBe(false);
    await stream.return();
    expect(signal.aborted).toBe(true);
  });
});

// Exercise cancellation through both public entry points while inference is awaiting data.
describe.each(["GGUF adapter", "local dispatch"])("%s cancellation", (entryPoint) => {
  it.each(["signal", "interrupt", "unload"])("stops active inference via %s", async (method) => {
    const api = entryPoint === "GGUF adapter" ? gguf : local;
    await api.loadModel(model.id);
    const waiting = Promise.withResolvers();
    const closed = vi.fn();
    createCompletion.mockImplementationOnce(async ({ abortSignal }) =>
      (async function* () {
        try {
          yield chunk({ content: "First" });
          await new Promise((_, reject) => {
            abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
            waiting.resolve(abortSignal);
          });
        } finally {
          closed();
        }
      })(),
    );
    const controller = new AbortController();
    const stream = api.streamModel(messages, controller.signal);
    expect(await stream.next()).toEqual({ value: { text: "First" }, done: false });
    const pending = stream.next();
    const internalSignal = await waiting.promise;
    expect(internalSignal.aborted).toBe(false);
    if (method === "signal") controller.abort();
    else await api[method]();
    await expect(pending).resolves.toEqual({ value: undefined, done: true });
    expect(internalSignal.aborted).toBe(true);
    expect(closed).toHaveBeenCalledOnce();
    if (method === "unload") expect(runtimes[0].exit).toHaveBeenCalledOnce();
  });
});

describe("GGUF cache integrity", () => {
  it("requires the selected URL, and finds a complete entry among unrelated files", async () => {
    expect(await gguf.isModelCached(model.id)).toBe(false);
    entries = [cachedFile(otherModel)];
    expect(await gguf.isModelCached(model.id)).toBe(false);
    entries.push(cachedFile(model));
    expect(await gguf.isModelCached(model.id)).toBe(true);
  });

  it.each([
    { label: "one byte short", sizeDelta: -1 },
    { label: "one byte extra", sizeDelta: 1 },
    { label: "metadata one byte short", metadataDelta: -1 },
    { label: "metadata one byte extra", metadataDelta: 1 },
    { label: "matching but incorrect sizes", sizeDelta: -1, metadataDelta: -1 },
    {
      label: "unpinned URL",
      originalURL: model.url.replace(/\/resolve\/[^/]+\//, "/resolve/main/"),
    },
    { label: "missing metadata", originalURL: "" },
  ])("rejects $label", async ({ sizeDelta = 0, metadataDelta = 0, originalURL = model.url }) => {
    const file = cachedFile(model);
    file.size += sizeDelta;
    file.metadata.originalSize += metadataDelta;
    file.metadata.originalURL = originalURL;
    entries = [file, cachedFile(otherModel)];
    expect(await gguf.isModelCached(model.id)).toBe(false);
  });

  it.each(["complete", "partial", "missing metadata", "empty"])(
    "deletes only the selected %s file",
    async (state) => {
      const target = cachedFile(model);
      if (state !== "complete") target.size = state === "empty" ? 0 : 123;
      if (state === "missing metadata" || state === "empty") {
        target.metadata = { etag: "", originalURL: "", originalSize: target.size };
      }
      const differentRevision = cachedFile({
        ...model,
        url: model.url.replace(/\/resolve\/[^/]+\//, `/resolve/${"0".repeat(40)}/`),
      });
      const untouched = [cachedFile(otherModel), differentRevision];
      entries = [target, ...untouched];
      await gguf.deleteCachedModel(model.id);
      expect(await cacheManager.list()).toEqual(untouched);
      expect(await gguf.isModelCached(model.id)).toBe(false);
      await gguf.deleteCachedModel(model.id);
      expect(await cacheManager.list()).toEqual(untouched);
    },
  );

  it("propagates cache read and deletion failures", async () => {
    const error = new Error("Storage unavailable");
    cacheManager.list.mockRejectedValueOnce(error);
    await expect(gguf.isModelCached(model.id)).rejects.toBe(error);
    cacheManager.delete.mockRejectedValueOnce(error);
    await expect(gguf.deleteCachedModel(model.id)).rejects.toBe(error);
  });
});

describe("local GGUF dispatch", () => {
  it("filters Qwen3 thinking tags split across streamed chunks", () => {
    const filter = new local.ThinkTagFilter();
    expect(filter.push("Visible <thi")).toBe("Visible ");
    expect(filter.push("nk>private reasoning</think> answer")).toBe(" answer");
    expect(filter.push(" <THINK>hidden</THINK> done", true)).toBe("  done");
  });

  it("loads without WebGPU and reuses the same model id", async () => {
    expect((await local.detectSupport()).available).toBe(false);
    expect(local.modelSupportReason(model, { available: false, reason: "No WebGPU" })).toBeNull();
    const onProgress = vi.fn();
    await local.loadModel(model.id, onProgress);
    expect(local.loadedModel()).toBe(model.id);
    expect(local.isLoaded(model.id)).toBe(true);
    expect(local.isLoaded(otherModel.id)).toBe(false);
    expect(onProgress).toHaveBeenCalledWith({
      text: "Community model ready on your CPU.",
      progress: 1,
    });
    await local.loadModel(model.id);
    expect(Wllama).toHaveBeenCalledOnce();
    expect(loadFromUrl).toHaveBeenCalledOnce();
    expect(runtimes[0].exit).not.toHaveBeenCalled();
  });

  it("keeps only one loaded model and delegates unload", async () => {
    await local.loadModel(model.id);
    await local.loadModel(otherModel.id);
    expect(runtimes[0].exit).toHaveBeenCalledOnce();
    expect(local.loadedModel()).toBe(otherModel.id);
    expect(local.isLoaded(model.id)).toBe(false);
    expect(local.isLoaded(otherModel.id)).toBe(true);
    await local.unload();
    await local.unload();
    expect(runtimes[1].exit).toHaveBeenCalledOnce();
    expect(local.loadedModel()).toBeNull();
    expect(local.isLoaded(otherModel.id)).toBe(false);
    await expect(collect(local.streamModel(messages))).rejects.toThrow(
      "No on-device model is loaded",
    );
  });

  it("delegates cache operations without loading an inference runtime", async () => {
    entries = [cachedFile(model), cachedFile(otherModel)];
    expect(await local.isModelCached(model.id)).toBe(true);
    await local.deleteCachedModel(model.id);
    expect(await local.isModelCached(model.id)).toBe(false);
    expect(entries).toEqual([cachedFile(otherModel)]);
    expect(Wllama).not.toHaveBeenCalled();
    cacheManager.list.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect(await local.isModelCached(otherModel.id)).toBe(false);
    const error = new Error("Cannot delete");
    cacheManager.delete.mockRejectedValueOnce(error);
    await expect(local.deleteCachedModel(otherModel.id)).rejects.toBe(error);
  });

  it("delegates streamed text, usage, and pre-aborted signals", async () => {
    await local.loadModel(model.id);
    createCompletion.mockResolvedValueOnce(chunks(chunk({ content: "Hello" }, { usage })));
    expect(await collect(local.streamModel(messages))).toEqual([
      { text: "Hello" },
      { usage: { completion_tokens: 2, total_tokens: 10 } },
    ]);
    expect(createCompletion.mock.calls[0][0].messages).toEqual(messages);
    const controller = new AbortController();
    controller.abort();
    expect(await collect(local.streamModel(messages, controller.signal))).toEqual([]);
    expect(createCompletion).toHaveBeenCalledOnce();
  });

  it("does not mark a failed load as loaded and retries the same id", async () => {
    const error = new Error("Cannot load model");
    loadFromUrl.mockRejectedValueOnce(error);
    await expect(local.loadModel(model.id)).rejects.toBe(error);
    expect(local.loadedModel()).toBeNull();
    expect(local.isLoaded(model.id)).toBe(false);
    expect(runtimes[0].exit).toHaveBeenCalledOnce();
    await local.loadModel(model.id);
    expect(local.isLoaded(model.id)).toBe(true);
    expect(Wllama).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Worker", "Web Workers"],
    ["JSPI", "JSPI support"],
    ["storage", "private storage"],
  ])("rejects missing %s before starting a runtime", async (feature, reason) => {
    if (feature === "Worker") vi.stubGlobal("Worker", undefined);
    if (feature === "JSPI") Reflect.deleteProperty(WebAssembly, "Suspending");
    if (feature === "storage") vi.stubGlobal("navigator", { storage: {} });
    await expect(local.loadModel(model.id)).rejects.toThrow(reason);
    expect(Wllama).not.toHaveBeenCalled();
    expect(local.loadedModel()).toBeNull();
    if (feature === "storage") {
      expect(await local.isModelCached(model.id)).toBe(false);
      expect(cacheManager.list).not.toHaveBeenCalled();
    }
  });

  it.each(["", "unknown-model"])(
    "rejects unknown id %j without disturbing a loaded model",
    async (id) => {
      await local.loadModel(model.id);
      await expect(local.loadModel(id)).rejects.toThrow("available catalogue");
      expect(local.loadedModel()).toBe(model.id);
      expect(Wllama).toHaveBeenCalledOnce();
      expect(runtimes[0].exit).not.toHaveBeenCalled();
    },
  );
});
