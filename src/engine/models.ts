// Catalogue of the on-device models LocalMind can run through WebLLM.
//
// Model records (weights URL, model library, integrity data) come from
// WebLLM's `prebuiltAppConfig` so their hashes and compatible binaries stay
// pinned to the installed package. This file only carries the display
// metadata and the cache configuration shared by the page and the worker.
//
// Weights are cached in the Origin Private File System (OPFS), not IndexedDB:
// checkpoints are hundreds of megabytes, and OPFS is the storage the browser
// is designed to stream them through.

export interface LocalModel {
  id: string;
  label: string;
  params: string;
  /** Approximate download size in MB, for the settings UI. */
  sizeMB: number;
  note: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    label: "SmolLM2 360M",
    params: "360M",
    sizeMB: 260,
    note: "Smallest and fastest. Good for short everyday replies.",
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 0.5B",
    params: "0.5B",
    sizeMB: 340,
    note: "Balanced default: steadier answers, still quick on integrated GPUs.",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B",
    params: "1B",
    sizeMB: 690,
    note: "Best quality here. Needs a capable GPU and about 1 GB of download.",
  },
];

export const DEFAULT_MODEL_ID = LOCAL_MODELS[1]!.id;

export function modelById(id: string): LocalModel | null {
  return LOCAL_MODELS.find((model) => model.id === id) ?? null;
}

/** True when the stored choice names a model this build can run. */
export function isKnownModel(id: string): boolean {
  return modelById(id) !== null;
}

export const MODEL_CACHE = {
  backend: "opfs",
  accessMode: "auto",
} as const;
