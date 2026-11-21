import { describe, expect, it } from "vitest";
import {
  describeLoadPlan,
  ggufLoadPlans,
  shouldRetryWithDefaultCache,
} from "../../src/engine/gguf-cache.js";

describe("ggufLoadPlans", () => {
  it("tries a quantized KV cache first, then the runtime default", () => {
    const plans = ggufLoadPlans();
    expect(plans.map((plan) => plan.kind)).toEqual(["quantized", "default"]);

    const [quantized, fallback] = plans;
    expect(quantized.params).toEqual({
      cache_type_k: "q8_0",
      cache_type_v: "q8_0",
      // Quantized V cache needs flash attention; they must travel together.
      flash_attn: true,
    });
    // The fallback pins nothing, so upstream defaults keep applying.
    expect(fallback.params).toEqual({});
  });

  it("can skip quantization entirely", () => {
    const plans = ggufLoadPlans({ quantizeCache: false });
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe("default");
  });

  it("accepts an explicit cache type", () => {
    const [plan] = ggufLoadPlans({ cacheType: "q4_0" });
    expect(plan.params.cache_type_k).toBe("q4_0");
    expect(plan.params.cache_type_v).toBe("q4_0");
  });

  it("never offers the same plan twice", () => {
    const plans = ggufLoadPlans();
    expect(new Set(plans.map((plan) => JSON.stringify(plan.params))).size).toBe(plans.length);
  });
});

describe("shouldRetryWithDefaultCache", () => {
  it("retries when the runtime rejects the cache settings", () => {
    expect(shouldRetryWithDefaultCache(new Error("failed to create context"))).toBe(true);
    expect(shouldRetryWithDefaultCache(new Error("unsupported cache type"))).toBe(true);
    expect(shouldRetryWithDefaultCache(new Error("unknown cache_type_k value"))).toBe(true);
    expect(shouldRetryWithDefaultCache(new Error("flash_attn not supported in this build"))).toBe(
      true,
    );
  });

  it("does not retry a broken model file", () => {
    // Retrying would only fail again, and would hide the real cause.
    expect(shouldRetryWithDefaultCache(new Error("Invalid GGUF"))).toBe(false);
    expect(shouldRetryWithDefaultCache(new Error("Cannot load model"))).toBe(false);
    expect(shouldRetryWithDefaultCache(new Error("unsupported file format"))).toBe(false);
  });

  it("does not retry a cancelled or failed download", () => {
    const abort = new Error("The download was stopped.");
    abort.name = "AbortError";
    expect(shouldRetryWithDefaultCache(abort)).toBe(false);
    expect(shouldRetryWithDefaultCache(new Error("The model download failed (HTTP 503)."))).toBe(
      false,
    );
    expect(shouldRetryWithDefaultCache(new Error("network error while fetching weights"))).toBe(
      false,
    );
  });

  it("does not retry failures that a retry cannot fix", () => {
    expect(shouldRetryWithDefaultCache(new Error("version_mismatch"))).toBe(false);
    expect(shouldRetryWithDefaultCache(new Error("out of memory"))).toBe(false);
    expect(shouldRetryWithDefaultCache(null)).toBe(false);
  });
});

describe("describeLoadPlan", () => {
  it("says which cache was used", () => {
    const [quantized, fallback] = ggufLoadPlans();
    expect(describeLoadPlan(quantized)).toContain("q8_0 KV cache");
    expect(describeLoadPlan(fallback)).toContain("default cache");
  });
});
