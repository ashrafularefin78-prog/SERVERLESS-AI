import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { DEMO_MODE } from "../config.js";
import { parseMemoryCommand } from "../memory.js";
import { analyzeIntent } from "../understand.js";
import { CPU_MODEL, isCpuModel, modelByKey, resolveGpuModel } from "./catalog.js";
import { formatCount } from "./device.js";

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

export function subscribe(listener) {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

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
      webllm.CreateWebWorkerMLCEngine(
        localWorker,
        resolved.modelId,
        {
          initProgressCallback: (report) => {
            if (token !== loadToken) return;
            const progress = Number.isFinite(report?.progress) ? report.progress : 0;
            patch({
              progress: Math.max(0, Math.min(1, progress)),
              progressText: report?.text || "Loading model...",
            });
          },
        },
      ),
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

export async function* generate({ messages, temperature, maxTokens, signal, demo }) {
  if (state.phase !== "ready" && state.phase !== "generating") {
    throw new Error("No model is loaded yet.");
  }

  patch({ phase: "generating", generating: true, error: null });

  try {
    if (state.backend === "demo") {
      yield* generateDemo(messages, signal, demo);
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

export function newGenerationSignal() {
  generationController?.abort();
  generationController = new AbortController();
  return generationController.signal;
}

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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function* generateDemo(messages, signal, demo = null) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const prompt = lastUser?.content?.trim() || "your message";
  const reply =
    state.modelKey === "demo" && demo && typeof demo.buildDemoReply === "function"
      ? demo.buildDemoReply({ prompt, messages, systemPrompt: messages[0]?.content || "" })
      : buildDemoReply(prompt, demo?.memoryOutcome);
  const chunks = reply.match(/\S+\s*/g) || [reply];

  for (const chunk of chunks) {
    if (signal?.aborted) return;
    yield { text: chunk };
    await sleep(14 + Math.random() * 26);
  }

  yield { usage: { completion_tokens: chunks.length, total_tokens: chunks.length } };
}

function buildDemoReply(prompt, memoryOutcome = null) {
  const command = parseMemoryCommand(prompt);
  if (command?.type === "add") {
    if (memoryOutcome?.added) {
      return `Got it, I'll remember that ${escapeMarkdown(command.text)}\n\nIt's saved on this device only, and I'll carry it into our later chats. You can view or remove it under Settings, Memory.`;
    }
    if (memoryOutcome?.duplicate) return "I already have that note, so nothing new was saved. Settings, Memory shows what I know.";
    if (memoryOutcome?.full) return "My memory is full, so I couldn't save that. Forget an old note first, then ask me again.";
  }
  if (command?.type === "forget" || command?.type === "forget-all") {
    if (memoryOutcome?.removed) {
      return command.type === "forget-all"
        ? "Done, I've forgotten everything I had noted about you."
        : `Done, I forgot ${memoryOutcome.removed} note${memoryOutcome.removed === 1 ? "" : "s"} matching that.`;
    }
    return "I looked, but no note matched that, so there was nothing to forget.";
  }

  const short = prompt.length > 120 ? `${prompt.slice(0, 117)}...` : prompt;
  if (analyzeIntent(prompt).vague) {
    return "I want to get this right instead of guessing. Can you paste the code or the exact error, and tell me what you expected to happen?";
  }
  const smallTalk = smallTalkReply(prompt);
  if (smallTalk) return smallTalk;
  return `I'm the **built-in assistant**. I run on local rules inside this tab, so I can chat, remember notes, help you think something through, and scaffold code - but I can't generate a full open-ended answer to this one.

You asked: _${escapeMarkdown(short)}_

**What I can do right now, fully offline:**

1. Chat naturally and remember facts you give me ("remember ...", "forget ...").
2. Detect the language and task in a coding question and scaffold a solution.
3. Keep every message private on this device - nothing is uploaded.

If you want to go further on this one, give me the exact goal, any constraints, and a small example, and I'll lay out the structure and the steps to get there.`;
}

function smallTalkReply(prompt) {
  const text = prompt.toLowerCase();
  if (/^(hi|hiya|hello|hey|yo|howdy|good (morning|afternoon|evening))\b/.test(text)) {
    return "Hey! Good to see you. What's on your mind today?";
  }
  if (/\bhow are you\b|\bhow's it going\b|\bhow are things\b/.test(text)) {
    return "Doing well, thanks for asking! Mostly I enjoy a good problem or a bit of chat. How about you?";
  }
  if (/\b(rough|bad|terrible|awful|hard|stressful)\s+(day|week|morning|night)\b|\bi'm (sad|stressed|anxious|exhausted|tired|upset)\b|\bi am (sad|stressed|anxious|exhausted|tired|upset)\b/.test(text)) {
    return "That sounds genuinely draining, I'm sorry. Do you want to vent about it, or would a distraction help more right now?";
  }
  if (/\b(i'm (happy|excited|thrilled)|i am (happy|excited|thrilled)|great day|good news)\b/.test(text)) {
    return "That's lovely to hear! Tell me what happened, I want the details.";
  }
  if (/^(thanks|thank you|thx|cheers|ty)\b/.test(text)) {
    return "Anytime! Glad I could help.";
  }
  if (/^(bye|goodbye|see you|good night|gn)\b/.test(text)) {
    return "See you later! I'll be right here whenever you want to pick things back up.";
  }
  return null;
}

function escapeMarkdown(text) {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}
