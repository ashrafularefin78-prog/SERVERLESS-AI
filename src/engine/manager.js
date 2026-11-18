import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { DEMO_MODE } from "../config.js";
import { CPU_MODEL, isCpuModel, modelByKey, resolveGpuModel } from "./catalog.js";
import { generateDemo } from "./demo.js";
import { formatCount } from "./device.js";

/**
 * @typedef {Object} EngineState
 * @property {"demo" | "webgpu" | "wasm" | null} backend
 * @property {string | null} modelKey
 * @property {string | null} modelName
 * @property {string | null} modelFamily
 * @property {string | null} modelId
 * @property {"idle" | "loading" | "ready" | "generating" | "error"} phase
 * @property {number} progress
 * @property {string} progressText
 * @property {string | null} error
 * @property {boolean} generating
 * @property {boolean} loaded
 * @property {boolean} [demo]
 */

const state = {
  backend: null,
  modelKey: null,
  modelName: null,
  modelFamily: null,
  modelId: null,
  phase: "idle",
  progress: 0,
  progressText: "",
  error: null,
  generating: false,
};

let engine = null;
let worker = null;
let wllama = null;
let loadToken = 0;
let generationController = null;
let loadAbort = null;

const listeners = new Set();

/**
 * Subscribe to engine state changes. The listener fires immediately with the
 * current snapshot.
 *
 * @param {(state: EngineState) => void} listener
 * @returns {() => void} Unsubscribe function.
 */
export function subscribe(listener) {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

/**
 * @returns {EngineState} A snapshot safe to hand to the UI.
 */
export function getState() {
  return { ...state, loaded: state.phase === "ready" || state.phase === "generating" };
}

function emit() {
  const snapshot = getState();
  for (const listener of listeners) listener(snapshot);
}

function patch(next) {
  Object.assign(state, next);
  emit();
}

function resetRuntime() {
  if (engine) {
    try {
      engine.unload();
    } catch {
      // Worker may already be gone.
    }
    engine = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
  wllama = null;
  generationController = null;
}

/**
 * Select and initialize a backend. The model-free build immediately selects
 * the built-in demo engine; the model branches remain for future use.
 *
 * @param {{ modelKey: string, device?: object }} options
 * @returns {Promise<void>}
 */
export async function loadModel({ modelKey, device }) {
  if (DEMO_MODE || modelKey === "demo") {
    resetRuntime();
    patch({
      backend: "demo",
      modelKey: "demo",
      modelName: "Built-in assistant",
      modelFamily: "Built-in engine",
      modelId: "demo",
      demo: true,
      phase: "ready",
      progress: 1,
      progressText: "Ready",
      error: null,
      generating: false,
    });
    return;
  }

  loadToken += 1;
  const token = loadToken;
  loadAbort?.abort();
  loadAbort = new AbortController();
  const signal = loadAbort.signal;

  await stop();
  resetRuntime();

  const model = modelByKey(modelKey);
  if (!model) throw new Error("Unknown model selection.");

  patch({
    backend: null,
    modelKey,
    modelName: model.name,
    modelFamily: model.family,
    modelId: null,
    phase: "loading",
    progress: 0,
    progressText: "Preparing runtime...",
    error: null,
    generating: false,
  });

  try {
    if (isCpuModel(modelKey)) {
      await loadWasm({ token, signal });
    } else {
      const resolved = resolveGpuModel(modelKey, device);
      if (!resolved) {
        throw new Error("This model needs WebGPU with shader-f16 support. Pick a smaller model.");
      }
      await loadWebGpu({ token, resolved, signal });
    }
  } catch (error) {
    if (token !== loadToken) return;
    const message = normalizeError(error);
    patch({ phase: "error", error: message, progressText: message, backend: null, modelId: null });
    throw error;
  }
}

async function loadWebGpu({ token, resolved, signal }) {
  patch({ progressText: "Loading WebLLM runtime..." });
  const webllm = await import("@mlc-ai/web-llm");
  if (token !== loadToken) return;

  const record = webllm.prebuiltAppConfig.model_list.find(
    (entry) => entry.model_id === resolved.modelId,
  );
  if (!record) {
    throw new Error(
      `The selected model (${resolved.modelId}) is not available in WebLLM 0.2.89. ` +
        "Update the model catalog or pick another model.",
    );
  }

  const localWorker = new Worker(new URL("./webllm.worker.js", import.meta.url), {
    type: "module",
  });
  worker = localWorker;

  let onAbort = null;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new DOMException("Model load cancelled.", "AbortError"));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const instance = await Promise.race([
      webllm.CreateWebWorkerMLCEngine(localWorker, resolved.modelId, {
        initProgressCallback: (report) => {
          if (token !== loadToken) return;
          const progress = Number.isFinite(report?.progress) ? report.progress : 0;
          patch({
            progress: Math.max(0, Math.min(1, progress)),
            progressText: report?.text || "Loading model...",
          });
        },
      }),
      aborted,
    ]);

    if (token !== loadToken) {
      try {
        await instance.unload();
      } catch {
        // Ignore unload failures for a stale engine.
      }
      localWorker.terminate();
      if (worker === localWorker) worker = null;
      return;
    }

    engine = instance;
    patch({
      backend: "webgpu",
      modelId: resolved.modelId,
      phase: "ready",
      progress: 1,
      progressText: "Model ready",
      error: null,
    });
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

async function loadWasm({ token, signal }) {
  patch({ progressText: "Loading WebAssembly runtime..." });
  const { Wllama } = await import("@wllama/wllama");
  if (token !== loadToken) return;

  const instance = new Wllama(
    { default: wasmUrl, "single-thread/wllama.wasm": wasmUrl },
    { allowOffline: true, suppressNativeLog: true },
  );
  wllama = instance;

  await instance.loadModelFromHF(
    { repo: CPU_MODEL.hf.repo, file: CPU_MODEL.hf.file },
    {
      n_ctx: 4096,
      n_batch: 256,
      useCache: true,
      signal,
      progressCallback: ({ loaded, total }) => {
        if (token !== loadToken) return;
        const ratio = total ? loaded / total : 0;
        patch({
          progress: Math.min(0.96, 0.04 + ratio * 0.92),
          progressText: total
            ? `Downloading model - ${formatCount(loaded)} of ${formatCount(total)}`
            : "Downloading model...",
        });
      },
    },
  );

  if (token !== loadToken) {
    try {
      await instance.exit();
    } catch {
      // Ignore cleanup failure for a stale load.
    }
    return;
  }

  patch({
    backend: "wasm",
    modelId: CPU_MODEL.hf.file,
    phase: "ready",
    progress: 1,
    progressText: "CPU model ready",
    error: null,
  });
}

/**
 * Stream a reply from the active backend.
 *
 * @param {Object} options
 * @param {Array<{ role: string, content: string }>} options.messages
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {AbortSignal} [options.signal]
 * @param {Object} [options.demo] Demo-only options (memory and reply builder).
 * @yields {{ text?: string, usage?: object }}
 */
export async function* generate({ messages, temperature, maxTokens, signal, demo }) {
  if (state.phase !== "ready" && state.phase !== "generating") {
    throw new Error("No model is loaded yet.");
  }

  patch({ phase: "generating", generating: true, error: null });

  try {
    if (state.backend === "demo") {
      yield* generateDemo(messages, signal, demo, { modelKey: state.modelKey });
      return;
    }

    if (state.backend === "webgpu") {
      yield* generateWebGpu({ messages, temperature, maxTokens, signal });
      return;
    }

    if (state.backend === "wasm") {
      yield* generateWasm({ messages, temperature, maxTokens, signal });
      return;
    }

    throw new Error("The model backend is not ready.");
  } finally {
    patch({ phase: state.backend ? "ready" : "idle", generating: false });
  }
}

async function* generateWebGpu({ messages, temperature, maxTokens, signal }) {
  if (!engine) throw new Error("The WebGPU engine is not loaded.");

  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    if (signal?.aborted) {
      try {
        engine.interruptGenerate();
      } catch {
        // Already interrupted.
      }
      break;
    }
    const text = chunk.choices?.[0]?.delta?.content || "";
    if (text) yield { text };
    if (chunk.usage) yield { usage: chunk.usage };
  }
}

async function* generateWasm({ messages, temperature, maxTokens, signal }) {
  if (!wllama) throw new Error("The CPU engine is not loaded.");

  const stream = await wllama.createChatCompletion({
    messages,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    abortSignal: signal,
  });

  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content || "";
    if (text) yield { text };
    if (chunk.usage) yield { usage: chunk.usage };
  }
}

/**
 * Abort the current generation and return the engine to `ready`.
 *
 * @returns {Promise<void>}
 */
export async function stop() {
  generationController?.abort();
  generationController = null;

  if (state.backend === "webgpu" && engine) {
    try {
      engine.interruptGenerate();
    } catch {
      // No active generation.
    }
  }

  if (state.generating) {
    patch({ phase: "ready", generating: false });
  }
}

/**
 * Cancel an in-flight model load and release runtime resources.
 */
export function abortLoad() {
  loadToken += 1;
  loadAbort?.abort();
  loadAbort = null;
  resetRuntime();
  patch({
    phase: "idle",
    backend: null,
    modelId: null,
    progress: 0,
    progressText: "",
    error: null,
  });
}

/**
 * Stop generation, release the backend, and return to `idle`.
 *
 * @returns {Promise<void>}
 */
export async function unload() {
  loadToken += 1;
  await stop();

  if (engine) {
    try {
      await engine.unload();
    } catch {
      // Ignore.
    }
  }
  if (wllama) {
    try {
      await wllama.exit();
    } catch {
      // Ignore.
    }
  }

  resetRuntime();
  patch({
    backend: null,
    modelKey: state.modelKey,
    modelId: null,
    phase: "idle",
    progress: 0,
    progressText: "",
    error: null,
  });
}

/**
 * Cancel any previous run and create a fresh signal for a new one.
 *
 * @returns {AbortSignal}
 */
export function newGenerationSignal() {
  generationController?.abort();
  generationController = new AbortController();
  return generationController.signal;
}

/**
 * @returns {boolean} True when a backend can accept a reply request.
 */
export function isReady() {
  return state.phase === "ready" || state.phase === "generating";
}

function normalizeError(error) {
  if (!error) return "Unknown error.";
  if (error.name === "AbortError") return "Cancelled.";
  const message = String(error.message || error);
  if (/out of memory|OOM/i.test(message)) {
    return "The browser ran out of memory. Pick a smaller model or close other tabs.";
  }
  if (/webgpu/i.test(message) && /not supported|unavailable/i.test(message)) {
    return "WebGPU is not available on this device. Use the CPU fallback model.";
  }
  return message;
}
