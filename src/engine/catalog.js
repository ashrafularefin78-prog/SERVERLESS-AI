// Curated WebLLM models. IDs are validated against prebuiltAppConfig at load time,
// because the library's catalog changes between releases.
export const GPU_MODELS = [
  {
    key: "feather",
    name: "Feather",
    family: "SmolLM2 360M",
    tagline: "Fastest start",
    description: "Quick drafts and simple questions on almost any laptop or phone.",
    downloadMB: 300,
    vramMB: 580,
    ids: {
      f16: "SmolLM2-360M-Instruct-q4f16_1-MLC",
      f32: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    },
    requiresF16: false,
    bestFor: "Low-RAM devices",
  },
  {
    key: "balanced",
    name: "Balanced",
    family: "Qwen2.5 1.5B",
    tagline: "Best default",
    description: "A strong balance of quality and speed for everyday writing and study.",
    downloadMB: 1000,
    vramMB: 1890,
    ids: {
      f16: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      f32: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
    },
    requiresF16: false,
    bestFor: "8 GB+ laptops",
    default: true,
  },
  {
    key: "quality",
    name: "Quality",
    family: "Qwen2.5 3B",
    tagline: "Deeper answers",
    description: "Better reasoning and longer answers, if your GPU has headroom.",
    downloadMB: 1900,
    vramMB: 2505,
    ids: {
      f16: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
      f32: "Qwen2.5-3B-Instruct-q4f32_1-MLC",
    },
    requiresF16: false,
    bestFor: "16 GB+ laptops",
  },
  {
    key: "studio",
    name: "Studio",
    family: "Qwen3 8B",
    tagline: "Largest option",
    description: "Noticeably stronger reasoning. Needs a fast GPU and patience on first load.",
    downloadMB: 4900,
    vramMB: 5696,
    ids: {
      f16: "Qwen3-8B-q4f16_1-MLC",
    },
    requiresF16: true,
    bestFor: "Desktop GPUs",
  },
];

export const CPU_MODEL = {
  key: "cpu",
  name: "CPU fallback",
  family: "Qwen2.5 0.5B",
  tagline: "No GPU needed",
  description: "Runs in WebAssembly on any modern device. Correct but slow, often 2-8 tokens/sec.",
  downloadMB: 400,
  vramMB: null,
  requiresF16: false,
  bestFor: "No WebGPU",
  backend: "wasm",
  hf: {
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
  },
};

export function allModels() {
  return [...GPU_MODELS, CPU_MODEL];
}

export function modelByKey(key) {
  return allModels().find((model) => model.key === key) ?? null;
}

export function gpuModelByKey(key) {
  return GPU_MODELS.find((model) => model.key === key) ?? null;
}

export function resolveGpuModel(key, device) {
  const model = gpuModelByKey(key);
  if (!model) return null;
  const supportsF16 = Boolean(device?.shaderF16);
  if (model.requiresF16 && !supportsF16) return null;
  const modelId = supportsF16 ? model.ids.f16 ?? model.ids.f32 : model.ids.f32 ?? model.ids.f16;
  return modelId ? { ...model, modelId, precision: supportsF16 ? "f16" : "f32" } : null;
}

export function isCpuModel(key) {
  return key === CPU_MODEL.key;
}

export function recommendedModelKey(device) {
  if (!device?.webgpu) return CPU_MODEL.key;
  const memory = Number(device.deviceMemory) || 0;
  const cores = Number(device.cores) || 0;
  if (memory && memory <= 4) return "feather";
  if (!device.shaderF16) return "feather";
  if (memory >= 16 && cores >= 8 && !device.mobile) return "quality";
  return "balanced";
}

export function modelSizeLabel(megabytes) {
  if (!megabytes) return "unknown";
  if (megabytes < 1000) return `~${megabytes} MB`;
  return `~${(megabytes / 1000).toFixed(1)} GB`;
}

export function modelVramLabel(megabytes) {
  if (!megabytes) return null;
  return `${(megabytes / 1024).toFixed(1)} GB GPU`;
}
