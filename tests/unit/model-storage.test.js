import { describe, expect, it } from "vitest";

import {
  describeGpuLimits,
  formatBytes,
  identifyModel,
  summarizeModelStorage,
} from "../../src/model-storage.js";

const webllm = {
  runtime: "webllm",
  id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
  label: "Llama 3.2 1B Instruct q4f32 1",
  memoryLabel: "about 1.1 GB GPU memory",
  contextWindow: 4096,
  note: "",
  vramMB: 1128,
  requiredFeatures: [],
  bufferSizeBytes: 0,
};

const shortId = {
  ...webllm,
  id: "Llama-3.2-1B-Instruct-q4f32_1-MLC-short",
  label: "Shorter neighbour",
};

const gguf = {
  runtime: "gguf",
  id: "gguf:qwen2.5-coder-1.5b-abliterated-q4km",
  label: "Qwen2.5 Coder 1.5B Abliterated",
  memoryLabel: "",
  contextWindow: 8192,
  note: "",
  url: "https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-abliterated-GGUF/resolve/abc/Qwen2.5-Coder-1.5B-Instruct-abliterated-Q4_K_M.gguf",
  downloadBytes: 986_000_000,
  baseModel: "bartowski/Qwen2.5-Coder-1.5B-Instruct-abliterated",
  uncensored: true,
};

const models = [shortId, webllm, gguf];

describe("identifyModel", () => {
  it("matches a WebLLM cache URL to its catalogue entry", () => {
    const url =
      "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f32_1-MLC/resolve/main/params_shard_0.bin";
    expect(identifyModel(url, models)?.id).toBe(webllm.id);
  });

  it("prefers the longest id when one is a prefix of another", () => {
    const url = "https://example.test/Llama-3.2-1B-Instruct-q4f32_1-MLC-short/weights.bin";
    expect(identifyModel(url, models)?.id).toBe(shortId.id);
  });

  it("matches a GGUF URL including the host", () => {
    expect(identifyModel(gguf.url, models)?.id).toBe(gguf.id);
  });

  it("matches the id fragment in a GGUF file name", () => {
    expect(identifyModel("qwen2.5-coder-1.5b-abliterated-q4km.gguf", models)?.id).toBe(gguf.id);
  });

  it("returns null for something no model owns", () => {
    expect(identifyModel("https://example.test/some-other-model/resolve/main/x.bin", models)).toBe(
      null,
    );
    expect(identifyModel("", models)).toBeNull();
  });
});

describe("formatBytes", () => {
  it("scales to the unit a person reads", () => {
    expect(formatBytes(986_000_000)).toBe("986 MB");
    expect(formatBytes(2_500_000_000)).toBe("2.5 GB");
    expect(formatBytes(4_200)).toBe("4 kB");
    expect(formatBytes(12)).toBe("12 B");
  });

  it("says unknown rather than showing NaN", () => {
    expect(formatBytes(null)).toBe("unknown size");
    expect(formatBytes(Number.NaN)).toBe("unknown size");
    expect(formatBytes(-1)).toBe("unknown size");
  });
});

describe("summarizeModelStorage", () => {
  const stored = (bytes) => ({
    id: "x",
    label: "x",
    runtime: "gguf",
    bytes,
    source: "opfs",
  });

  it("says nothing is stored when the list is empty", () => {
    expect(
      summarizeModelStorage({ models: [], knownBytes: 0, usageMB: null, quotaMB: null }),
    ).toContain("No model weights");
  });

  it("counts models, sums size, and names the quota", () => {
    const text = summarizeModelStorage({
      models: [stored(1_000_000), stored(2_000_000)],
      knownBytes: 3_000_000,
      usageMB: 12,
      quotaMB: 60_000,
    });
    expect(text).toContain("2 models stored");
    expect(text).toContain("3 MB");
    expect(text).toContain("12 MB of the 60000 MB");
  });

  it("uses the singular for one model and omits usage when unknown", () => {
    const text = summarizeModelStorage({
      models: [stored(null)],
      knownBytes: 0,
      usageMB: null,
      quotaMB: null,
    });
    expect(text).toContain("1 model stored");
    expect(text).not.toContain("This app is using");
  });
});

describe("describeGpuLimits", () => {
  it("explains a browser without WebGPU", () => {
    const text = describeGpuLimits({
      available: false,
      vendor: null,
      architecture: null,
      device: null,
      description: null,
      limits: null,
      webgpuExposed: false,
    });
    expect(text).toContain("does not expose WebGPU");
  });

  it("distinguishes an exposed API from a granted adapter", () => {
    const text = describeGpuLimits({
      available: false,
      vendor: null,
      architecture: null,
      device: null,
      description: null,
      limits: null,
      webgpuExposed: true,
    });
    expect(text).toContain("no adapter was granted");
  });

  it("reports identity and the limits that decide whether a model fits", () => {
    const text = describeGpuLimits({
      available: true,
      vendor: "apple",
      architecture: "metal-3",
      device: "m2",
      description: null,
      limits: { maxBufferSize: 256_000_000, maxStorageBufferBindingSize: 128_000_000 },
      webgpuExposed: true,
    });
    expect(text).toContain("apple / metal-3 / m2");
    expect(text).toContain("max buffer 256 MB");
    expect(text).toContain("max binding 128 MB");
  });

  it("says so when nothing has been read yet", () => {
    expect(describeGpuLimits(null)).toBe("Not checked.");
  });
});

/** A directory handle good enough for the OPFS walk in `readModelStorage`. */
function fakeDirectory(files) {
  return {
    async *entries() {
      for (const [name, size, meta] of files) {
        if (meta === undefined) {
          yield [name, { kind: "file", getFile: async () => ({ size }) }];
        } else {
          yield [
            name,
            { kind: "file", getFile: async () => ({ size: 0, text: async () => meta }) },
          ];
        }
      }
    },
  };
}

function installStorage({ files = [], caches: cacheSpec = {}, estimate } = {}) {
  const previous = {
    storage: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    caches: Object.getOwnPropertyDescriptor(globalThis, "caches"),
  };
  const root = { getDirectoryHandle: async () => fakeDirectory(files) };
  Object.defineProperty(globalThis, "navigator", {
    value: { storage: { getDirectory: async () => root, estimate: async () => estimate } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "caches", {
    value: {
      keys: async () => Object.keys(cacheSpec),
      open: async (name) => ({
        keys: async () => cacheSpec[name].map((entry) => ({ url: entry.url })),
        match: async (request) => ({
          headers: {
            get: () => cacheSpec[name].find((e) => e.url === request.url)?.length ?? null,
          },
        }),
      }),
    },
    configurable: true,
  });
  return () => {
    for (const [key, descriptor] of [
      ["navigator", previous.storage],
      ["caches", previous.caches],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

describe("readModelStorage", () => {
  it("identifies models from the OPFS sidecar first", async () => {
    const { readModelStorage } = await import("../../src/model-storage.js");
    const restore = installStorage({
      files: [
        ["deadbeef.gguf", 986_000_000],
        ["deadbeef.json", 0, JSON.stringify({ url: gguf.url })],
        ["incomplete.gguf.part", 5],
      ],
      estimate: { usage: 987_000_000, quota: 60_000_000_000 },
    });
    try {
      const report = await readModelStorage(models);
      expect(report.models).toHaveLength(1);
      expect(report.models[0].id).toBe(gguf.id);
      expect(report.models[0].source).toBe("opfs");
      expect(report.models[0].bytes).toBe(986_000_000);
      expect(report.knownBytes).toBe(986_000_000);
      expect(report.usageMB).toBe(987);
      expect(report.quotaMB).toBe(60_000);
    } finally {
      restore();
    }
  });

  it("falls back to cache storage and counts a dual-store model once", async () => {
    const { readModelStorage } = await import("../../src/model-storage.js");
    const url = "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f32_1-MLC/resolve/main/x";
    const restore = installStorage({
      files: [
        ["deadbeef.gguf", 986_000_000],
        ["deadbeef.json", 0, JSON.stringify({ url: gguf.url })],
      ],
      caches: {
        "webllm/model": [{ url, length: "700000000" }],
        // A tokenizer is not a model: it must not become a row.
        other: [{ url: "https://example.test/tokenizer.json", length: "1000" }],
      },
      estimate: { usage: 1_000, quota: 2_000 },
    });
    try {
      const report = await readModelStorage(models);
      const ids = report.models.map((model) => model.id);
      expect(ids).toContain(gguf.id);
      expect(ids).toContain(webllm.id);
      expect(ids).not.toContain("https://example.test/tokenizer.json");
      expect(report.models.find((model) => model.id === webllm.id).bytes).toBe(700_000_000);
      // Largest first, so the thing costing the most is at the top of the list.
      expect(report.models[0].id).toBe(gguf.id);
    } finally {
      restore();
    }
  });

  it("survives a browser that exposes neither store", async () => {
    const { readModelStorage } = await import("../../src/model-storage.js");
    const restore = installStorage();
    try {
      const report = await readModelStorage(models);
      expect(report.models).toEqual([]);
      expect(report.usageMB).toBeNull();
      expect(report.quotaMB).toBeNull();
    } finally {
      restore();
    }
  });
});
