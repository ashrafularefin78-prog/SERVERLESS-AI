// KV cache quantization for community GGUF models.
//
// A conversation's KV cache grows with every token and is stored at f16 by
// default: for a 4k context on a 1B model that is a few hundred megabytes of
// working set, which is exactly what pushes a phone over its tab budget. Storing
// it at q8_0 roughly halves it and is the standard trade in llama.cpp; q4_0
// halves it again but starts to cost accuracy on small models, so it is not the
// default here.
//
// Quantized V cache requires flash attention, so the plan sets both together.
// Not every build supports them, and the app cannot test a real model in CI, so
// a failed load falls back to the runtime's defaults instead of failing the
// download: the parameters are a hint, not a hard requirement.

export type KvCacheType = "f16" | "q8_0" | "q4_0";

export interface GgufLoadPlan {
  kind: "quantized" | "default";
  /** Shown in diagnostics, not in the UI. */
  note: string;
  params: {
    cache_type_k?: KvCacheType;
    cache_type_v?: KvCacheType;
    flash_attn?: boolean;
  };
}

export interface GgufLoadOptions {
  /** Set false to skip the quantized attempt entirely. */
  quantizeCache?: boolean;
  cacheType?: KvCacheType;
}

/**
 * Load attempts in order. The default plan passes nothing, so it inherits
 * upstream's behavior rather than pinning a type this code would have to keep
 * in sync with the runtime.
 */
export function ggufLoadPlans({
  quantizeCache = true,
  cacheType = "q8_0",
}: GgufLoadOptions = {}): GgufLoadPlan[] {
  const plans: GgufLoadPlan[] = [];

  if (quantizeCache) {
    plans.push({
      kind: "quantized",
      note: `${cacheType} KV cache`,
      params: {
        cache_type_k: cacheType,
        cache_type_v: cacheType,
        flash_attn: true,
      },
    });
  }

  plans.push({ kind: "default", note: "runtime default KV cache", params: {} });
  return plans;
}

/**
 * Whether a failed load is worth retrying with default cache settings.
 *
 * Deliberately narrow. A retry only makes sense when the failure could be about
 * the cache or context configuration, so the message has to point at one of
 * those. A bad file, a failed transfer, or an aborted download is not a cache
 * problem, and retrying it would hide the real error behind a second attempt.
 */
export function shouldRetryWithDefaultCache(error: unknown): boolean {
  if (!error) return false;

  const name = (error as { name?: string }).name ?? "";
  if (name === "AbortError") return false;

  const message = String((error as { message?: string }).message ?? error);
  const unrecoverable =
    /abort|download|fetch|network|offline|http\s*\d|version|out of memory|invalid|corrupt|magic|unsupported file/i;
  if (unrecoverable.test(message)) return false;

  // llama.cpp reports these while building the context, before any generation.
  return /cache|flash|attention|context|kv[\s_-]/i.test(message);
}

/** Human-readable summary of the plan that succeeded, for diagnostics. */
export function describeLoadPlan(plan: GgufLoadPlan): string {
  return plan.kind === "quantized"
    ? `Loaded with a ${plan.note} to save memory.`
    : "Loaded with the runtime's default cache settings.";
}
