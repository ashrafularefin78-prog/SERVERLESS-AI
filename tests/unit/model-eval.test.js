import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelType, prebuiltAppConfig } from "@mlc-ai/web-llm";
import { detectSupport, loadModel, modelSupportReason } from "../../src/engine/local.js";
import { DEFAULT_SETTINGS } from "../../src/config.js";
import {
  DEFAULT_MODEL_ID,
  GGUF_MODELS,
  LOCAL_MODELS,
  WEBLLM_MODELS,
  isKnownModel,
  modelById,
} from "../../src/engine/models.js";
import {
  compareRuns,
  countSentences,
  detectLanguage,
  evaluateCase,
  summarize,
} from "../../scripts/lib/model-eval.mjs";
import cases from "../evals/model/cases.json";

const baseCase = {
  id: "sample",
  prompt: "hello",
  expect: { minChars: 3, maxChars: 40, contains: ["hello"], notContains: ["goodbye"] },
};

describe("local model catalogue", () => {
  it("includes every chat-capable WebLLM model and excludes embedding-only models", () => {
    const expected = prebuiltAppConfig.model_list
      .filter((model) => model.model_type !== ModelType.embedding)
      .map((model) => model.model_id)
      .sort();
    expect(WEBLLM_MODELS.map((model) => model.id).sort()).toEqual(expected);
  });

  it("uses unique ids and labels and sorts by estimated GPU memory", () => {
    expect(new Set(LOCAL_MODELS.map((model) => model.id)).size).toBe(LOCAL_MODELS.length);
    expect(new Set(LOCAL_MODELS.map((model) => model.label)).size).toBe(LOCAL_MODELS.length);
    const sizes = WEBLLM_MODELS.map((model) => model.vramMB ?? Infinity);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it.each(WEBLLM_MODELS)("resolves $label to a supported WebLLM record", (model) => {
    const record = prebuiltAppConfig.model_list.find((item) => item.model_id === model.id);
    expect(record).toBeDefined();
    expect(record.model).toBeTruthy();
    expect(record.model_lib).toBeTruthy();
    expect(model.requiredFeatures).toEqual([
      ...new Set([
        ...(record.required_features ?? []),
        ...(model.id.includes("f16") ? ["shader-f16"] : []),
      ]),
    ]);
    expect(model.bufferSizeBytes).toBe(record.buffer_size_required_bytes ?? 0);
    expect(model.contextWindow).toBe(record.overrides?.context_window_size ?? null);
    expect(model.vramMB).toBe(record.vram_required_MB ?? null);
    expect(model.memoryLabel).toContain("GPU memory");
    expect(model.label).toBeTruthy();
    expect(model.note).toContain("not the download size");
    if (record.model_type === ModelType.VLM) expect(model.note).toContain("text-only chat");
    if (model.contextWindow === 1024) expect(model.note).toContain("Short context");
    expect(modelById(model.id)).toBe(model);
    expect(isKnownModel(model.id)).toBe(true);
  });

  it.each(GGUF_MODELS)("labels $label as a pinned community GGUF, not official Claude", (model) => {
    expect(model.runtime).toBe("gguf");
    expect(model.label).toContain("(community)");
    expect(model.label).toContain("Qwen");
    expect(model.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[a-f0-9]{40}\/.+\.gguf$/);
    expect(model.downloadBytes).toBeGreaterThan(0);
    expect(model.downloadBytes).toBeLessThan(2_000_000_000);
    expect(model.memoryLabel).toContain("MB download - CPU/WASM");
    expect(model.note).toContain("not an official Anthropic Claude model");
    expect(modelById(model.id)).toBe(model);
    expect(LOCAL_MODELS).toContain(model);
  });

  it("preserves the built-in startup and existing recommended model", () => {
    expect(DEFAULT_SETTINGS.modelId).toBe("");
    expect(DEFAULT_MODEL_ID).toBe("Qwen2.5-0.5B-Instruct-q4f32_1-MLC");
  });

  it("does not resolve unknown or built-in ids as downloadable models", () => {
    for (const id of ["", "unknown-model"]) {
      expect(modelById(id)).toBeNull();
      expect(isKnownModel(id)).toBe(false);
    }
  });
});

describe("model device support", () => {
  afterEach(() => vi.unstubAllGlobals());

  const supported = {
    available: true,
    reason: "WebGPU is available on this device.",
    features: ["shader-f16"],
    maxStorageBufferBindingSize: 1024 * 1024 * 1024,
  };

  it("reports adapter features and buffer limits", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: async () => ({
          features: new Set(supported.features),
          limits: { maxStorageBufferBindingSize: supported.maxStorageBufferBindingSize },
        }),
      },
    });
    expect(await detectSupport()).toEqual(supported);
  });

  it("reports missing WebGPU, unavailable adapters, and adapter failures", async () => {
    for (const navigator of [
      undefined,
      {},
      { gpu: { requestAdapter: async () => null } },
      {
        gpu: {
          requestAdapter: async () => {
            throw new Error("Unavailable");
          },
        },
      },
    ]) {
      vi.stubGlobal("navigator", navigator);
      expect((await detectSupport()).available).toBe(false);
    }
  });

  it("allows all listed variants when their GPU requirements are met", () => {
    for (const model of WEBLLM_MODELS) {
      expect(modelSupportReason(model, supported)).toBeNull();
    }
  });

  it("allows community models without WebGPU and checks required browser capabilities", () => {
    const noGPU = { available: false, reason: "No WebGPU" };
    vi.stubGlobal("Worker", vi.fn());
    vi.stubGlobal("WebAssembly", { Suspending: vi.fn() });
    vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } });
    for (const model of GGUF_MODELS) {
      expect(modelSupportReason(model, noGPU)).toBeNull();
    }
    vi.stubGlobal("navigator", {});
    expect(modelSupportReason(GGUF_MODELS[0], noGPU)).toContain("private storage");
    vi.stubGlobal("WebAssembly", {});
    expect(modelSupportReason(GGUF_MODELS[0], noGPU)).toContain("JSPI");
    vi.stubGlobal("Worker", undefined);
    expect(modelSupportReason(GGUF_MODELS[0], noGPU)).toContain("Web Workers");
    vi.stubGlobal("WebAssembly", undefined);
    expect(modelSupportReason(GGUF_MODELS[0], noGPU)).toContain("WebAssembly");
  });

  it("blocks f16 variants without hiding f32 alternatives", () => {
    const device = { ...supported, features: [] };
    const f16 = modelById("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    const f32 = modelById("Llama-3.2-1B-Instruct-q4f32_1-MLC");
    expect(modelSupportReason(f16, device)).toContain("shader-f16");
    expect(modelSupportReason(f32, device)).toBeNull();
  });

  it("checks model-specific GPU buffer limits", () => {
    const model = modelById("gemma-2b-it-q4f32_1-MLC");
    expect(
      modelSupportReason(model, { ...supported, maxStorageBufferBindingSize: 128 * 1024 * 1024 }),
    ).toContain("larger GPU buffers");
    expect(
      modelSupportReason(model, {
        ...supported,
        maxStorageBufferBindingSize: model.bufferSizeBytes,
      }),
    ).toBeNull();
  });

  it("rejects unsupported models before fetching weights or creating workers", async () => {
    const fetch = vi.fn();
    const worker = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("Worker", worker);
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: async () => ({
          features: new Set(),
          limits: { maxStorageBufferBindingSize: supported.maxStorageBufferBindingSize },
        }),
      },
    });
    await expect(loadModel("Llama-3.2-1B-Instruct-q4f16_1-MLC")).rejects.toThrow("shader-f16");
    await expect(loadModel("unknown-model")).rejects.toThrow("available catalogue");
    expect(fetch).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });
});

describe("golden model cases", () => {
  it("has unique ids and a prompt and expectations for every case", () => {
    const ids = new Set();
    for (const testCase of cases) {
      expect(typeof testCase.id, "case id").toBe("string");
      expect(testCase.prompt.length).toBeGreaterThan(0);
      expect(testCase.expect, `${testCase.id} expectations`).toBeTruthy();
      expect(ids.has(testCase.id), `duplicate ${testCase.id}`).toBe(false);
      ids.add(testCase.id);
    }
  });
});

describe("evaluateCase", () => {
  it("passes a reply that meets every property", () => {
    const result = evaluateCase(baseCase, {
      replyText: "Hello there.",
      hasCodeBlock: false,
      ms: 12,
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.ms).toBe(12);
  });

  it("reports length, content and formatting failures", () => {
    const result = evaluateCase(
      { ...baseCase, expect: { ...baseCase.expect, maxChars: 4, notContains: ["hello"] } },
      { replyText: "Hello there goodbye" },
    );
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("too long");
    expect(result.failures.join(" ")).toContain("must not contain: hello");
  });

  it("requires a rendered code block when asked", () => {
    const result = evaluateCase(
      { id: "code", prompt: "code", expect: { codeBlock: true } },
      { replyText: "def f():\n    pass" },
    );
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("expected a fenced code block");
  });

  it("flags empty replies", () => {
    const result = evaluateCase({ id: "empty", prompt: "x", expect: {} }, { replyText: "   " });
    expect(result.failures).toContain("empty reply");
  });

  it("matches case-insensitively and reports invalid patterns", () => {
    expect(
      evaluateCase({ id: "ci", expect: { contains: ["HELLO"] } }, { replyText: "hello" }).passed,
    ).toBe(true);
    const invalid = evaluateCase({ id: "re", expect: { matches: "(" } }, { replyText: "hello" });
    expect(invalid.failures.join(" ")).toContain("invalid pattern");
  });
});

describe("language detection", () => {
  it("recognises Spanish and Polish text", () => {
    expect(
      detectLanguage(
        "La fotosíntesis es el proceso por el que las plantas producen energía.",
        "es",
      ),
    ).toBe(true);
    expect(
      detectLanguage(
        "Sztuczna inteligencja jest dziedziną informatyki, która zajmuje się uczeniem maszyn.",
        "pl",
      ),
    ).toBe(true);
  });

  it("rejects English text for Spanish", () => {
    expect(detectLanguage("The cat sat on the mat and looked outside.", "es")).toBe(false);
  });
});

describe("countSentences", () => {
  it("counts sentence groups and ignores empty input", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("")).toBe(0);
  });
});

describe("summarize", () => {
  it("aggregates pass rate, length and latency", () => {
    const metrics = summarize([
      { passed: true, chars: 10, ms: 100 },
      { passed: false, chars: 20, ms: 200 },
      { passed: true, chars: 30, ms: 300 },
    ]);
    expect(metrics.passRate).toBeCloseTo(2 / 3);
    expect(metrics.meanChars).toBe(20);
    expect(metrics.p95Ms).toBe(300);
  });
});

describe("compareRuns", () => {
  const baseline = {
    modelId: "model-a",
    passRate: 1,
    meanChars: 100,
    p95Ms: 1000,
    cases: { a: { passed: true }, b: { passed: true } },
  };
  const current = {
    modelId: "model-a",
    passRate: 1,
    meanChars: 100,
    p95Ms: 1000,
    cases: { a: { passed: true }, b: { passed: true } },
  };

  it("passes an unchanged run", () => {
    expect(compareRuns(baseline, current).regressions).toEqual([]);
  });

  it("fails a flipped case and a lower pass rate", () => {
    const result = compareRuns(baseline, {
      ...current,
      passRate: 0.5,
      cases: { a: { passed: true }, b: { passed: false, failures: ["too long"] } },
    });
    expect(result.regressions.join(" ")).toContain("case regressed: b");
    expect(result.regressions.join(" ")).toContain("pass rate dropped");
  });

  it("fails latency and verbosity regressions", () => {
    const result = compareRuns(baseline, { ...current, p95Ms: 2000, meanChars: 200 });
    expect(result.regressions.join(" ")).toContain("p95 latency regressed");
    expect(result.regressions.join(" ")).toContain("replies got longer");
  });

  it("requires a new baseline when the model changes", () => {
    const result = compareRuns(baseline, { ...current, modelId: "model-b" });
    expect(result.modelChanged).toBe(true);
    expect(result.regressions.join(" ")).toContain("model changed");
  });

  it("reports fixes and new cases as improvements", () => {
    const result = compareRuns(
      { ...baseline, passRate: 0.5, cases: { a: { passed: false } } },
      { ...current, cases: { a: { passed: true }, c: { passed: true } } },
    );
    expect(result.improvements.join(" ")).toContain("case fixed: a");
    expect(result.improvements.join(" ")).toContain("new case: c");
  });

  it("fails a missing case", () => {
    const result = compareRuns(baseline, { ...current, cases: { a: { passed: true } } });
    expect(result.regressions.join(" ")).toContain("case missing from run: b");
  });
});
