// Generation lifecycle for both backends: the built-in rule engine (always
// available, no download) and an optional on-device neural model running in a
// Worker. The UI only talks to this module.
import { generateDemo } from "./demo.js";
import {
  deleteCachedModel,
  detectSupport,
  interrupt,
  isLoaded,
  isModelCached,
  loadModel as loadLocalModel,
  loadedModel,
  modelSupportReason,
  storageUsage,
  streamModel,
  unload,
} from "./local.js";
import { LOCAL_MODELS } from "./models.js";
import type {
  ChatMessage,
  DemoOptions,
  EngineState,
  ModelProgress,
  StreamChunk,
} from "../types.js";

type Phase = EngineState["phase"];

const state: {
  phase: Phase;
  generating: boolean;
  mode: EngineState["mode"];
  modelId: string | null;
  progress: ModelProgress | null;
  error: string | null;
} = {
  phase: "idle",
  generating: false,
  mode: "builtin",
  modelId: null,
  progress: null,
  error: null,
};

let generationController: AbortController | null = null;

const listeners = new Set<(state: EngineState) => void>();

/**
 * Subscribe to engine state changes. The listener fires immediately with the
 * current snapshot. Returns an unsubscribe function.
 */
export function subscribe(listener: (state: EngineState) => void): () => void {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

/** A snapshot safe to hand to the UI. */
export function getState(): EngineState {
  return {
    phase: state.phase,
    generating: state.generating,
    loaded: state.phase === "ready" || state.phase === "generating",
    mode: state.mode,
    modelId: state.modelId,
    progress: state.progress ? { ...state.progress } : null,
    error: state.error,
  };
}

function emit(): void {
  const snapshot = getState();
  for (const listener of listeners) listener(snapshot);
}

function patch(next: Partial<typeof state>): void {
  Object.assign(state, next);
  emit();
}

export const models = LOCAL_MODELS;
export { detectSupport, modelSupportReason, storageUsage };

/**
 * Bring the built-in engine up. Instant, and independent of any model. When a
 * model id is supplied and its weights are already cached, it is loaded in the
 * background so the next conversation can use it without another click.
 */
export async function init({ modelId = null }: { modelId?: string | null } = {}): Promise<void> {
  await stop();
  patch({
    phase: "ready",
    generating: false,
    mode: "builtin",
    modelId: null,
    progress: null,
    error: null,
  });

  if (modelId) {
    void restoreModel(modelId);
  }
}

async function restoreModel(modelId: string): Promise<void> {
  try {
    if (!(await isModelCached(modelId))) return;
    await useModel(modelId);
  } catch {
    // A failed restore falls back to the built-in engine; the UI shows why.
  }
}

/**
 * Download if necessary, then load a model and make it the active backend.
 * Rejects with a readable message when the device or the download fails, and
 * leaves the built-in engine in place.
 */
export async function useModel(modelId: string): Promise<void> {
  if (state.generating) await stop();

  patch({
    phase: "loading",
    mode: "builtin",
    modelId,
    progress: { text: "Preparing on-device model...", progress: 0 },
    error: null,
  });

  try {
    await loadLocalModel(modelId, (progress) => {
      patch({ phase: "loading", progress });
    });
    patch({
      phase: "ready",
      mode: "model",
      modelId,
      progress: null,
      error: null,
    });
  } catch (error) {
    await unload().catch(() => {});
    const message = describeError(error);
    patch({
      phase: "ready",
      mode: "builtin",
      modelId: null,
      progress: null,
      error: message,
    });
    throw new Error(message);
  }
}

/** Drop back to the built-in engine and free the model's GPU memory. */
export async function unloadModel(): Promise<void> {
  if (state.generating) await stop();
  await unload();
  patch({ phase: "ready", mode: "builtin", modelId: null, progress: null });
}

export async function deleteModel(modelId: string): Promise<void> {
  if (isLoaded(modelId)) await unloadModel();
  await deleteCachedModel(modelId);
}

/** True when this model's weights are already on the device. */
export async function hasCachedModel(modelId: string): Promise<boolean> {
  return isModelCached(modelId);
}

/** Stream a reply from whichever backend is active. */
export async function* generate({
  messages,
  signal,
  demo,
  maxTokens,
}: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  demo?: DemoOptions | null;
  maxTokens?: number;
}): AsyncGenerator<StreamChunk> {
  if (state.phase !== "ready" && state.phase !== "generating") {
    throw new Error("The assistant is not ready yet.");
  }

  patch({ phase: "generating", generating: true });

  try {
    if (state.mode === "model" && loadedModel()) {
      yield* streamModel(messages, signal, maxTokens);
    } else {
      yield* generateDemo(messages, signal, demo);
    }
  } finally {
    patch({ phase: "ready", generating: false });
  }
}

/** Abort the current generation and return the engine to `ready`. */
export async function stop(): Promise<void> {
  generationController?.abort();
  generationController = null;
  interrupt();

  if (state.generating) {
    patch({ phase: "ready", generating: false });
  }
}

/** Cancel any previous run and create a fresh signal for a new one. */
export function newGenerationSignal(): AbortSignal {
  generationController?.abort();
  generationController = new AbortController();
  return generationController.signal;
}

/** True when the engine can accept a reply request. */
export function isReady(): boolean {
  return state.phase === "ready" || state.phase === "generating";
}

function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.replace(/^Error:\s*/i, "").trim();
  if (!message) return "The model could not be loaded on this device.";
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}
