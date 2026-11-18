import catalogue from "./model-catalogue.json" with { type: "json" };
import { COMMUNITY_MODELS } from "./community-models.js";

interface ModelDisplay {
  id: string;
  label: string;
  memoryLabel: string;
  contextWindow: number | null;
  note: string;
}

export interface WebLLMModel extends ModelDisplay {
  runtime: "webllm";
  vramMB: number | null;
  requiredFeatures: string[];
  bufferSizeBytes: number;
}

export interface GGUFModel extends ModelDisplay {
  runtime: "gguf";
  url: string;
  downloadBytes: number;
}

export type LocalModel = WebLLMModel | GGUFModel;

// Keep the catalogue lightweight so the inference runtime stays lazy-loaded.
export const WEBLLM_MODELS: WebLLMModel[] = catalogue
  .map((model): WebLLMModel => {
    const requiredFeatures = [
      ...new Set([...model.requiredFeatures, ...(model.id.includes("f16") ? ["shader-f16"] : [])]),
    ];
    const memoryLabel =
      model.vramMB === null
        ? "GPU memory estimate unavailable"
        : model.vramMB >= 1000
          ? `about ${(model.vramMB / 1000).toFixed(1)} GB GPU memory`
          : `about ${Math.ceil(model.vramMB)} MB GPU memory`;
    return {
      runtime: "webllm",
      id: model.id,
      label: model.id.replace("-MLC", "").replaceAll("-", " "),
      vramMB: model.vramMB,
      memoryLabel,
      requiredFeatures,
      bufferSizeBytes: model.bufferSizeBytes,
      contextWindow: model.contextWindow,
      note: [
        `WebLLM estimates ${memoryLabel}. This is not the download size.`,
        requiredFeatures.length ? `Requires ${requiredFeatures.join(", ")}.` : "",
        model.contextWindow ? `${model.contextWindow}-token context.` : "",
        model.contextWindow && model.contextWindow <= 1024
          ? "Short context: long prompts or chats may not fit, and replies may be cut short."
          : "",
        model.vision ? "Used for text-only chat in this app." : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  })
  .sort(
    (a, b) => (a.vramMB ?? Infinity) - (b.vramMB ?? Infinity) || a.label.localeCompare(b.label),
  );

export const GGUF_MODELS: GGUFModel[] = COMMUNITY_MODELS.map((model) => ({
  ...model,
  runtime: "gguf",
  memoryLabel: `about ${Math.ceil(model.downloadBytes / 1_000_000)} MB download - CPU/WASM`,
  contextWindow: 4096,
  note:
    `Community derivative of ${model.baseModel}, not an official Anthropic Claude model. ` +
    "Runs locally on your CPU with WebAssembly, without an API key or WebGPU. " +
    "Requires a current Chrome or Edge with WebAssembly JSPI support. " +
    "CPU generation can be slow and needs free RAM beyond the download size. 4096-token context.",
}));

export const LOCAL_MODELS: LocalModel[] = [...GGUF_MODELS, ...WEBLLM_MODELS];

export const DEFAULT_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";

export function modelById(id: string): LocalModel | null {
  return LOCAL_MODELS.find((model) => model.id === id) ?? null;
}

export function isKnownModel(id: string): boolean {
  return modelById(id) !== null;
}

export const MODEL_CACHE = {
  backend: "opfs",
  accessMode: "auto",
} as const;
