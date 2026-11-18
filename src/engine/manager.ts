// Rules-only engine. LocalMind is intentionally model-free: replies come from
// the built-in rule engine, with no model loading, no downloads, no network.
import { generateDemo } from "./demo.js";
import type { ChatMessage, DemoOptions, EngineState, StreamChunk } from "../types.js";

const state: { phase: EngineState["phase"]; generating: boolean } = {
  phase: "idle",
  generating: false,
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
  return { ...state, loaded: state.phase === "ready" || state.phase === "generating" };
}

function emit(): void {
  const snapshot = getState();
  for (const listener of listeners) listener(snapshot);
}

function patch(next: Partial<typeof state>): void {
  Object.assign(state, next);
  emit();
}

/**
 * Bring the built-in engine up. Instant and synchronous in practice; async so
 * the engine can move to a Worker later without changing the UI.
 */
export async function init(): Promise<void> {
  await stop();
  patch({ phase: "ready", generating: false });
}

/** Stream a reply from the built-in rule engine. */
export async function* generate({
  messages,
  signal,
  demo,
}: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  demo?: DemoOptions | null;
}): AsyncGenerator<StreamChunk> {
  if (state.phase !== "ready" && state.phase !== "generating") {
    throw new Error("The assistant is not ready yet.");
  }

  patch({ phase: "generating", generating: true });

  try {
    yield* generateDemo(messages, signal, demo);
  } finally {
    patch({ phase: "ready", generating: false });
  }
}

/** Abort the current generation and return the engine to `ready`. */
export async function stop(): Promise<void> {
  generationController?.abort();
  generationController = null;

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
