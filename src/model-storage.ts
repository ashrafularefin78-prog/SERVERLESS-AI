// What model weights are actually on this device, and what they cost. Settings
// used to offer a delete button for the *selected* model only, which meant a
// user juggling three downloads could only see one of them.
//
// Everything here reads storage the browser already exposes to the page. No
// request is made, and nothing about the user's chats is touched.
import type { LocalModel } from "./engine/models.js";
import { readGpuAdapterInfo, type GpuAdapterInfo } from "./diagnostics-bundle.js";

/** OPFS directory the resumable GGUF downloader writes into. */
const MODEL_DIRECTORY = "localmind-models";
const MB = 1_000_000;
const GB = 1_000_000_000;

export interface StoredModel {
  id: string;
  label: string;
  runtime: LocalModel["runtime"];
  /** Bytes on disk when the browser exposes them, otherwise null. */
  bytes: number | null;
  /** Where it was found, so "why does this show up" has an answer. */
  source: "opfs" | "cache";
}

export interface ModelStorageReport {
  models: StoredModel[];
  /** Sum of the sizes we could measure, which is a floor, not the whole story. */
  knownBytes: number;
  usageMB: number | null;
  quotaMB: number | null;
  gpu: GpuAdapterInfo | null;
}

/**
 * Which catalogue entry a stored URL or file name belongs to.
 *
 * Matching is deliberately literal: the MLC id appears in the Hugging Face URL,
 * and a GGUF file name carries the id fragment the catalogue was generated from.
 * Guessing from model names would mislabel a download, and this list is what
 * someone deletes from.
 */
export function identifyModel(needle: string, models: readonly LocalModel[]): LocalModel | null {
  if (!needle) return null;
  const haystack = needle.toLowerCase();
  let best: LocalModel | null = null;
  for (const model of models) {
    const candidates =
      model.runtime === "webllm"
        ? [model.id]
        : [model.url.replace(/^https?:\/\//, ""), model.id.replace(/^gguf:/, "")];
    for (const candidate of candidates) {
      const term = candidate.toLowerCase();
      if (term.length < 6) continue;
      if (!haystack.includes(term)) continue;
      // Prefer the longest match: "Qwen2.5-Coder-3B-abliterated" is a substring of
      // nothing else, but shorter ids can collide with longer ones.
      if (!best || term.length > best.id.length) best = model;
    }
  }
  return best;
}

/** Human-readable size. Null means "the browser would not say". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${bytes} B`;
}

/** One sentence for the top of the section. */
export function summarizeModelStorage(report: Omit<ModelStorageReport, "gpu">): string {
  const count = report.models.length;
  if (count === 0) {
    return "No model weights are stored on this device. Downloads appear here when you add one.";
  }
  const size = report.knownBytes > 0 ? `, ${formatBytes(report.knownBytes)}` : "";
  const plural = count === 1 ? "model" : "models";
  const usage =
    report.usageMB === null
      ? ""
      : ` This app is using ${report.usageMB} MB${
          report.quotaMB === null ? "" : ` of the ${report.quotaMB} MB this site may store`
        }.`;
  return `${count} ${plural} stored${size}.${usage}`;
}

async function opfsModels(): Promise<Array<{ needle: string; bytes: number | null }>> {
  const found: Array<{ needle: string; bytes: number | null }> = [];
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return found;
    const directory = await root.getDirectoryHandle(MODEL_DIRECTORY);

    // The weights file is named after a hash of its URL, so the URL has to come
    // from the metadata file the downloader writes next to it.
    const urls = new Map<string, string>();
    const weights: Array<{ name: string; bytes: number | null }> = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file") continue;
      if (name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(await (await handle.getFile()).text()) as { url?: unknown };
          if (typeof parsed.url === "string") urls.set(name.replace(/\.json$/, ""), parsed.url);
        } catch {
          // A half-written metadata file tells us nothing; skip it.
        }
        continue;
      }
      if (name.endsWith(".part")) continue;
      let bytes: number | null = null;
      try {
        bytes = (await handle.getFile()).size;
      } catch {
        // A file that cannot be read still exists; report it with no size.
      }
      weights.push({ name, bytes });
    }
    for (const weight of weights) {
      const key = weight.name.replace(/\.[a-z0-9]+$/i, "");
      found.push({ needle: urls.get(key) ?? weight.name, bytes: weight.bytes });
    }
  } catch {
    // No OPFS, or no LocalMind directory yet: nothing to list.
  }
  return found;
}

async function cacheModels(): Promise<Array<{ needle: string; bytes: number | null }>> {
  const found: Array<{ needle: string; bytes: number | null }> = [];
  if (typeof caches === "undefined") return found;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        // `content-length` is present on the responses Hugging Face serves, and
        // reading a header costs far less than reading a 1 GB body.
        let bytes: number | null = null;
        try {
          const response = await cache.match(request);
          const header = response?.headers.get("content-length");
          const parsed = header === null || header === undefined ? NaN : Number(header);
          if (Number.isFinite(parsed) && parsed > 0) bytes = parsed;
        } catch {
          // Fall back to "unknown size" rather than dropping the entry.
        }
        found.push({ needle: request.url, bytes });
      }
    }
  } catch {
    // Cache Storage can be denied; the summary then shows OPFS only.
  }
  return found;
}

/**
 * Read the storage picture: which catalogue models are on disk, how big they are
 * (where the browser will say), and the quota around them.
 */
export async function readModelStorage(
  models: readonly LocalModel[],
  options: { includeGpu?: boolean } = {},
): Promise<ModelStorageReport> {
  const [opfs, cache, gpu] = await Promise.all([
    opfsModels(),
    cacheModels(),
    options.includeGpu ? readGpuAdapterInfo() : Promise.resolve(null),
  ]);

  const byId = new Map<string, StoredModel>();
  for (const [source, entries] of [
    ["opfs", opfs],
    ["cache", cache],
  ] as const) {
    for (const entry of entries) {
      // `.part` files are in-flight downloads; they belong in the progress UI, not
      // in a list of what is stored.
      if (entry.needle.endsWith(".part")) continue;
      const model = identifyModel(entry.needle, models);
      if (!model) continue;
      const existing = byId.get(model.id);
      const bytes = entry.bytes ?? existing?.bytes ?? null;
      if (existing) {
        // A model can appear in both stores (our OPFS copy and wllama's cache).
        // Keep the larger measurement rather than adding them: they are the same
        // weights, and counting both would double the reported total.
        existing.bytes = Math.max(existing.bytes ?? 0, bytes ?? 0) || null;
        continue;
      }
      byId.set(model.id, {
        id: model.id,
        label: model.label,
        runtime: model.runtime,
        bytes,
        source,
      });
    }
  }

  const stored = [...byId.values()].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
  const knownBytes = stored.reduce((total, model) => total + (model.bytes ?? 0), 0);

  let usageMB: number | null = null;
  let quotaMB: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (typeof estimate?.usage === "number") usageMB = Math.round(estimate.usage / MB);
    if (typeof estimate?.quota === "number") quotaMB = Math.round(estimate.quota / MB);
  } catch {
    // Keep the nulls: the UI says "unknown" rather than inventing numbers.
  }

  return { models: stored, knownBytes, usageMB, quotaMB, gpu };
}

/** Two lines of adapter identity and limits for the Settings readout. */
export function describeGpuLimits(gpu: GpuAdapterInfo | null): string {
  if (!gpu) return "Not checked.";
  if (!gpu.available) {
    return gpu.webgpuExposed
      ? "WebGPU is exposed but no adapter was granted (a blocklist, a remote desktop, or headless mode)."
      : "This browser does not expose WebGPU.";
  }
  const identity = [gpu.vendor, gpu.architecture, gpu.device].filter(Boolean).join(" / ");
  const limits = gpu.limits ?? {};
  const parts = [
    typeof limits.maxBufferSize === "number"
      ? `max buffer ${formatBytes(limits.maxBufferSize)}`
      : "",
    typeof limits.maxStorageBufferBindingSize === "number"
      ? `max binding ${formatBytes(limits.maxStorageBufferBindingSize)}`
      : "",
    typeof limits.maxComputeWorkgroupStorageSize === "number"
      ? `workgroup ${formatBytes(limits.maxComputeWorkgroupStorageSize)}`
      : "",
  ].filter(Boolean);
  return [identity || "Adapter without a reported name", ...parts].join(" · ");
}
