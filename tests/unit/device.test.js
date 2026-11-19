import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessModelFit,
  deviceSummary,
  isMobileDevice,
  lightestCpuModel,
  modelDisplayName,
  recommendDeviceModel,
} from "../../src/engine/device.js";

function stubMedia({ coarse = false, fine = false } = {}) {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query.includes("pointer: coarse")
      ? coarse
      : query.includes("any-pointer: fine")
        ? fine
        : false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function cpuModel(id, downloadMB, extra = {}) {
  return {
    id,
    label: `${id} - Qwen test (community)`,
    memoryLabel: `about ${downloadMB} MB download - CPU/WASM`,
    contextWindow: 4096,
    note: "Test build.",
    runtime: "gguf",
    url: `https://example.test/${id}.gguf`,
    downloadBytes: downloadMB * 1_000_000,
    baseModel: "Qwen test",
    ...extra,
  };
}

function gpuModel(id, vramMB) {
  return {
    id,
    label: `${id} - test`,
    memoryLabel: `about ${vramMB} MB GPU memory`,
    contextWindow: 4096,
    note: "Test build.",
    runtime: "webllm",
    vramMB,
    requiredFeatures: [],
    bufferSizeBytes: 1024,
  };
}

function profile(overrides = {}) {
  return {
    webgpu: false,
    memoryGB: 8,
    cores: 8,
    freeStorageMB: 50_000,
    wasmJspi: true,
    mobile: false,
    ...overrides,
  };
}

const models = [
  cpuModel("stub", 63),
  cpuModel("uncensored", 300, { uncensored: true }),
  cpuModel("tiny", 400),
  cpuModel("small", 1000),
  gpuModel("gpu", 2000),
];

describe("isMobileDevice", () => {
  it("does not treat a touch laptop as a phone", () => {
    stubMedia({ coarse: true, fine: true });
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
        userAgentData: { mobile: false },
        maxTouchPoints: 10,
      }),
    ).toBe(false);
  });

  it("uses the browser mobile flag when present", () => {
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
        userAgentData: { mobile: false },
        maxTouchPoints: 10,
      }),
    ).toBe(false);
  });

  it("recognises a phone user agent", () => {
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit Mobile Safari/537.36",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("falls back to a touch-only pointer for devices without UA hints", () => {
    stubMedia({ coarse: true, fine: false });
    expect(
      isMobileDevice({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)", maxTouchPoints: 5 }),
    ).toBe(true);
  });

  it("recognises iPadOS in desktop mode", () => {
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });
});

describe("modelDisplayName", () => {
  it("uses the base model instead of borrowed branding", () => {
    const misleading = cpuModel("claude-coder", 400, {
      label: "Claude Coder - Qwen3 0.6B Q4_K_M (community)",
      baseModel: "Qwen3 0.6B",
      url: "https://example.test/Qwen3-0.6B-Claude-Coder.Q4_K_M.gguf",
    });
    expect(modelDisplayName(misleading)).toBe("Qwen3 0.6B Q4_K_M (community)");

    const recommendation = recommendDeviceModel([misleading], profile());
    expect(recommendation?.reason).not.toContain("Claude");
    expect(recommendation?.reason).toContain("Qwen3 0.6B");
  });

  it("leaves official WebGPU names alone", () => {
    expect(modelDisplayName(gpuModel("Qwen2.5-0.5B-Instruct-q4f32_1-MLC", 800))).toContain(
      "Qwen2.5-0.5B",
    );
  });
});

describe("lightestCpuModel", () => {
  it("picks the smallest usable GGUF download and ignores WebGPU models", () => {
    expect(lightestCpuModel(models)?.id).toBe("tiny");
  });

  it("never recommends uncensored builds or tiny 0.1B stubs", () => {
    expect(
      lightestCpuModel([cpuModel("stub", 63), cpuModel("nsfw", 300, { uncensored: true })]),
    ).toBe(null);
  });

  it("returns null when only GPU models are available", () => {
    expect(lightestCpuModel([gpuModel("gpu", 2000)])).toBeNull();
  });
});

describe("recommendDeviceModel", () => {
  it("recommends the lightest CPU model on a desktop without WebGPU", () => {
    const recommendation = recommendDeviceModel(models, profile({ webgpu: false }));
    expect(recommendation).toMatchObject({ kind: "cpu", modelId: "tiny" });
    expect(recommendation.reason).toContain("CPU");
  });

  it("sends phones without WebGPU to the built-in assistant", () => {
    const recommendation = recommendDeviceModel(models, profile({ mobile: true }));
    expect(recommendation).toMatchObject({ kind: "builtin", modelId: null });
    expect(recommendation.reason).toContain("built-in assistant");
  });

  it("falls back to the built-in assistant when no CPU model fits", () => {
    const recommendation = recommendDeviceModel(
      [cpuModel("huge", 1800)],
      profile({ memoryGB: 1, cores: 2 }),
    );
    expect(recommendation).toMatchObject({ kind: "builtin", modelId: null });
  });

  it("suggests the built-in assistant on a low-memory device even with WebGPU", () => {
    const recommendation = recommendDeviceModel(
      models,
      profile({ webgpu: true, memoryGB: 2, mobile: true }),
    );
    expect(recommendation).toMatchObject({ kind: "builtin" });
  });

  it("stays quiet on a capable device", () => {
    expect(recommendDeviceModel(models, profile({ webgpu: true, memoryGB: 8 }))).toBeNull();
  });

  it("does not recommend a CPU model when WebAssembly JSPI is missing", () => {
    const recommendation = recommendDeviceModel(models, profile({ wasmJspi: false }));
    expect(recommendation).toMatchObject({ kind: "builtin" });
  });
});

describe("assessModelFit", () => {
  it("accepts the lightest model on a modest phone", () => {
    const fit = assessModelFit(cpuModel("tiny", 400), profile({ memoryGB: 2, mobile: true }));
    expect(fit.level).toBe("ok");
    expect(fit.downloadMB).toBe(400);
  });

  it("flags a model that cannot fit in the reported memory", () => {
    const fit = assessModelFit(cpuModel("huge", 3800), profile({ memoryGB: 1, cores: 2 }));
    expect(fit.level).toBe("too-large");
    expect(fit.reasons.join(" ")).toContain("free memory");
  });

  it("warns when the download barely fits the reported RAM", () => {
    const fit = assessModelFit(cpuModel("edge", 1000), profile({ memoryGB: 2 }));
    expect(fit.level).toBe("tight");
  });

  it("flags a download larger than the free storage", () => {
    const fit = assessModelFit(cpuModel("big", 900), profile({ memoryGB: 8, freeStorageMB: 500 }));
    expect(fit.level).toBe("too-large");
    expect(fit.reasons.join(" ")).toContain("free space");
  });

  it("warns about slow CPU generation on two cores", () => {
    const fit = assessModelFit(cpuModel("tiny", 400), profile({ cores: 2 }));
    expect(fit.level).toBe("tight");
    expect(fit.reasons.join(" ")).toContain("CPU cores");
  });

  it("only compares GPU memory for WebLLM models", () => {
    const fit = assessModelFit(gpuModel("gpu", 8000), profile({ webgpu: true, memoryGB: 4 }));
    expect(fit.level).toBe("too-large");
    expect(fit.downloadMB).toBeNull();
  });
});

describe("deviceSummary", () => {
  it("lists the detected capabilities", () => {
    const summary = deviceSummary(profile({ memoryGB: 4, cores: 6 }));
    expect(summary).toContain("No WebGPU");
    expect(summary).toContain("4 GB RAM");
    expect(summary).toContain("6 cores");
  });

  it("marks the capped memory value as a minimum", () => {
    expect(deviceSummary(profile({ webgpu: true }))).toContain("8 GB+ RAM");
  });
});
