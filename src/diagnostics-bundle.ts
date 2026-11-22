// The exportable half of local diagnostics. Everything here is built from values
// the browser already exposes to the page; callers must never pass prompt, chat,
// or document text. The bundle exists so a user can attach a file to an issue
// without uploading anything from the app.
import type { DiagnosticEntry } from "./diagnostics.js";

export const BUNDLE_SCHEMA_VERSION = 1;

export interface GpuAdapterInfo {
  /** True when an adapter was obtained; false covers "no WebGPU" and a failed request. */
  available: boolean;
  vendor: string | null;
  architecture: string | null;
  device: string | null;
  description: string | null;
  /** The limits a model would actually be constrained by. */
  limits: Record<string, number> | null;
  /** Always the value of `navigator.gpu` being present, so a reader can tell them apart. */
  webgpuExposed: boolean;
}

export interface StorageUsage {
  quotaMB: number | null;
  usageMB: number | null;
  /** Per-directory totals inside OPFS, when the browser lets the page walk it. */
  opfs: { name: string; entries: number; megabytes: number } | null;
  opfsError: string | null;
}

export interface DiagnosticsBundle {
  schemaVersion: number;
  generatedAt: string;
  app: Record<string, string>;
  environment: {
    userAgent: string;
    platform: string;
    language: string;
    hardwareConcurrency: number | null;
    deviceMemoryGB: number | null;
    screen: string | null;
    crossOriginIsolated: boolean;
    serviceWorker: "controlling" | "registered" | "unsupported";
  };
  gpu: GpuAdapterInfo;
  storage: StorageUsage;
  diagnostics: DiagnosticEntry[];
}

const MB = 1_000_000;
const LIMIT_KEYS = [
  "maxTextureDimension2D",
  "maxStorageBufferBindingSize",
  "maxBufferSize",
  "maxComputeWorkgroupStorageSize",
  "maxComputeInvocationsPerWorkgroup",
] as const;

/** Adapter identity and limits, or an explicit "not available". */
export async function readGpuAdapterInfo(): Promise<GpuAdapterInfo> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  const empty: GpuAdapterInfo = {
    available: false,
    vendor: null,
    architecture: null,
    device: null,
    description: null,
    limits: null,
    webgpuExposed: Boolean(gpu),
  };
  if (!gpu) return empty;

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return empty;
    // `info` is the current API; older builds exposed the same fields directly.
    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
    const limits = adapter.limits;
    const picked: Record<string, number> = {};
    for (const key of LIMIT_KEYS) {
      const value = limits?.[key];
      if (typeof value === "number") picked[key] = value;
    }
    return {
      available: true,
      vendor: info?.vendor ?? null,
      architecture: info?.architecture ?? null,
      device: info?.device ?? null,
      description: info?.description ?? null,
      limits: Object.keys(picked).length ? picked : null,
      webgpuExposed: true,
    };
  } catch {
    return empty;
  }
}

/** Quota, usage, and what LocalMind itself keeps in OPFS. */
export async function readStorageUsage(): Promise<StorageUsage> {
  const result: StorageUsage = {
    quotaMB: null,
    usageMB: null,
    opfs: null,
    opfsError: null,
  };

  try {
    const estimate = await navigator.storage?.estimate?.();
    if (typeof estimate?.quota === "number") result.quotaMB = Math.round(estimate.quota / MB);
    if (typeof estimate?.usage === "number") result.usageMB = Math.round(estimate.usage / MB);
  } catch {
    // Leave the fields empty rather than failing the whole bundle.
  }

  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return result;
    let entries = 0;
    let bytes = 0;
    // One level deep is enough: LocalMind keeps a model-cache directory and small
    // marker files. Walking hashes would be slow and tells a reader nothing.
    for await (const [name, handle] of root.entries()) {
      entries += 1;
      if (handle.kind !== "file") continue;
      try {
        bytes += (await handle.getFile()).size;
      } catch {
        // A locked or partially written file still counts as an entry.
      }
      void name;
    }
    result.opfs = { name: "/", entries, megabytes: Math.round(bytes / MB) };
  } catch (error) {
    result.opfsError = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export function serviceWorkerState(): DiagnosticsBundle["environment"]["serviceWorker"] {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  return navigator.serviceWorker.controller ? "controlling" : "registered";
}

/**
 * Assemble the bundle. `app` carries only values the caller is willing to
 * publish (version, engine mode); it is not merged with settings or chat state.
 */
export function buildDiagnosticsBundle(input: {
  app: Record<string, string>;
  diagnostics: DiagnosticEntry[];
  gpu: GpuAdapterInfo;
  storage: StorageUsage;
  now?: Date;
}): DiagnosticsBundle {
  // Guarded so this can run (and be tested) without a DOM.
  const nav =
    typeof navigator === "undefined"
      ? ({} as Navigator & { deviceMemory?: number })
      : (navigator as Navigator & { deviceMemory?: number });
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    app: input.app,
    environment: {
      userAgent: nav.userAgent ?? "",
      platform: nav.platform ?? "",
      language: nav.language ?? "",
      hardwareConcurrency:
        typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
      deviceMemoryGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      screen:
        typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : null,
      crossOriginIsolated:
        typeof self !== "undefined"
          ? Boolean((self as { crossOriginIsolated?: boolean }).crossOriginIsolated)
          : false,
      serviceWorker: serviceWorkerState(),
    },
    gpu: input.gpu,
    storage: input.storage,
    diagnostics: input.diagnostics,
  };
}

/** A stable, sortable file name for the downloaded bundle. */
export function bundleFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `localmind-diagnostics-${stamp}.json`;
}

export function bundleToJson(bundle: DiagnosticsBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
