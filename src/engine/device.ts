import type { LocalModel } from "./models.js";

/**
 * What the browser will tell us about the machine. Everything is optional:
 * `deviceMemory` is Chromium-only and capped at 8 GB, and storage estimates
 * are not exposed everywhere.
 */
export interface DeviceProfile {
  webgpu: boolean;
  memoryGB: number | null;
  cores: number | null;
  freeStorageMB: number | null;
  wasmJspi: boolean;
  mobile: boolean;
  /** iOS/iPadOS, where a tab is killed long before the device runs out of RAM. */
  ios: boolean;
}

export type FitLevel = "ok" | "tight" | "too-large";

export interface ModelFit {
  level: FitLevel;
  downloadMB: number | null;
  requiredMemoryMB: number | null;
  requiredStorageMB: number | null;
  reasons: string[];
}

export interface DeviceRecommendation {
  kind: "builtin" | "cpu";
  modelId: string | null;
  title: string;
  reason: string;
  actionLabel: string;
}

type DeviceNavigator = Navigator & { deviceMemory?: number };

export interface NavigatorDeviceHints {
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
  maxTouchPoints?: number;
}

const MB = 1_000_000;
/**
 * Safari on iOS enforces a per-tab memory budget far below the device's RAM and
 * kills the tab instead of paging. Treat that as the usable amount so a model
 * that would crash the tab is flagged before it is downloaded.
 */
const IOS_TAB_MEMORY_MB = 1_024;
const MIB = 1_048_576;

export function formatSizeMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10_240 ? 0 : 1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Chrome reports 8 for "8 GB or more", so only smaller values are exact. */
function usableMemoryMB(profile: DeviceProfile): number | null {
  // iOS never reports `deviceMemory`, so the tab budget stands in for it and is
  // the stricter of the two when both are known.
  if (profile.ios) {
    if (profile.memoryGB === null || profile.memoryGB >= 8) return IOS_TAB_MEMORY_MB;
    return Math.min(Math.round(profile.memoryGB * 1024), IOS_TAB_MEMORY_MB);
  }
  if (profile.memoryGB === null || profile.memoryGB >= 8) return null;
  return Math.round(profile.memoryGB * 1024);
}

/**
 * Phone/tablet detection. A coarse pointer is not enough: touch laptops report
 * one too, so the browser's mobile flag and the user agent decide first and the
 * pointer is only a fallback for touch-only screens with no fine pointer.
 */
/** iPhone/iPad, including iPadOS, which reports a desktop "Macintosh" UA. */
export function isIOSDevice(nav: NavigatorDeviceHints): boolean {
  const ua = nav.userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

export function isMobileDevice(nav: NavigatorDeviceHints): boolean {
  const ua = nav.userAgent ?? "";

  // iPadOS reports a desktop "Macintosh" UA but exposes multi-touch.
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return true;

  const mobileFlag = nav.userAgentData?.mobile;
  if (typeof mobileFlag === "boolean") return mobileFlag;

  if (/Mobi|Android|iPhone|iPod|IEMobile|Windows Phone/i.test(ua)) return true;

  return (
    typeof matchMedia === "function" &&
    matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(any-pointer: fine)").matches
  );
}

export function readDeviceProfile(webgpu: boolean): DeviceProfile {
  const nav = navigator as DeviceNavigator;
  return {
    webgpu,
    memoryGB:
      typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 ? nav.deviceMemory : null,
    cores:
      typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0
        ? nav.hardwareConcurrency
        : null,
    freeStorageMB: null,
    wasmJspi: typeof WebAssembly !== "undefined" && "Suspending" in WebAssembly,
    mobile: isMobileDevice(nav),
    ios: isIOSDevice(nav),
  };
}

export async function detectDeviceProfile(webgpu: boolean): Promise<DeviceProfile> {
  const profile = readDeviceProfile(webgpu);
  let freeStorageMB: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota !== undefined) {
      freeStorageMB = Math.max(0, Math.round((estimate.quota - (estimate.usage ?? 0)) / MIB));
    }
  } catch {
    freeStorageMB = null;
  }
  return { ...profile, freeStorageMB };
}

// 0.1B stubs are not useful assistants, so never suggest them.
const MIN_RECOMMENDED_BYTES = 250_000_000;

/**
 * A neutral, accurate display name for a model. Community GGUF labels sometimes
 * borrow a famous name ("Claude Coder"), so recommendations use the actual base
 * model plus quantization instead.
 */
export function modelDisplayName(model: LocalModel): string {
  if (model.runtime !== "gguf") return model.label;

  const quant = model.url.match(/[.-]((?:IQ|Q)\d[A-Z0-9_]*)(?:\.gguf)?$/i)?.[1];
  const base = model.baseModel?.trim() || model.label;
  const suffix = quant && !base.toLowerCase().includes(quant.toLowerCase()) ? ` ${quant}` : "";
  return `${base}${suffix} (community)`;
}

/**
 * The lightest downloadable CPU model that is sensible to recommend. Uncensored
 * builds and tiny stubs are skipped: a weak device deserves a safe, usable
 * assistant rather than the smallest file in the catalogue.
 */
export function lightestCpuModel(models: LocalModel[]): LocalModel | null {
  let lightest: LocalModel | null = null;
  for (const model of models) {
    if (model.runtime !== "gguf") continue;
    if (model.uncensored || model.downloadBytes < MIN_RECOMMENDED_BYTES) continue;
    if (
      !lightest ||
      (lightest.runtime === "gguf" && model.downloadBytes < lightest.downloadBytes)
    ) {
      lightest = model;
    }
  }
  return lightest;
}

/**
 * Judge a model against the device. GGUF downloads are known exactly, so both
 * free storage and RAM are checked. WebLLM reports GPU memory rather than a
 * download size, so only its memory estimate is compared.
 */
export function assessModelFit(model: LocalModel, profile: DeviceProfile): ModelFit {
  const downloadMB = model.runtime === "gguf" ? Math.ceil(model.downloadBytes / MB) : null;
  const requiredStorageMB = downloadMB === null ? null : Math.ceil(downloadMB * 1.15);
  const requiredMemoryMB =
    model.runtime === "gguf"
      ? (downloadMB ?? 0) + 384
      : model.vramMB === null
        ? null
        : Math.ceil(model.vramMB * 1.1);

  const reasons: string[] = [];
  let level: FitLevel = "ok";
  const add = (next: FitLevel, reason: string) => {
    reasons.push(reason);
    if (level === "ok" || next === "too-large") level = next;
  };

  const memoryMB = usableMemoryMB(profile);
  if (memoryMB !== null && requiredMemoryMB !== null) {
    if (requiredMemoryMB > memoryMB * 0.8) {
      add(
        "too-large",
        profile.ios
          ? `It needs about ${formatSizeMB(requiredMemoryMB)} of memory, and Safari on iOS gives a tab roughly ${formatSizeMB(IOS_TAB_MEMORY_MB)} before it closes the tab.`
          : `It needs about ${formatSizeMB(requiredMemoryMB)} of free memory and this device reports about ${formatSizeMB(memoryMB)} of RAM.`,
      );
    } else if (requiredMemoryMB > memoryMB * 0.55) {
      add(
        "tight",
        profile.ios
          ? `It needs about ${formatSizeMB(requiredMemoryMB)} of memory against roughly ${formatSizeMB(memoryMB)} for a Safari tab, so replies may be slow or the tab may be reloaded.`
          : `It needs about ${formatSizeMB(requiredMemoryMB)} of free memory on a ${formatSizeMB(memoryMB)} device, so replies may be slow.`,
      );
    }
  }

  if (requiredStorageMB !== null && profile.freeStorageMB !== null) {
    if (requiredStorageMB > profile.freeStorageMB) {
      add(
        "too-large",
        `The download needs about ${formatSizeMB(requiredStorageMB)} of free space and this browser has about ${formatSizeMB(profile.freeStorageMB)} free.`,
      );
    } else if (requiredStorageMB > profile.freeStorageMB * 0.8) {
      add(
        "tight",
        `The download would use about ${formatSizeMB(requiredStorageMB)} of the ${formatSizeMB(profile.freeStorageMB)} free in this browser.`,
      );
    }
  }

  if (model.runtime === "gguf" && profile.cores !== null && profile.cores <= 2) {
    add(
      "tight",
      `Only ${profile.cores} CPU ${profile.cores === 1 ? "core is" : "cores are"} available, so CPU replies will be slow.`,
    );
  }

  return { level, downloadMB, requiredMemoryMB, requiredStorageMB, reasons };
}

/**
 * Weak devices get an explicit suggestion: phones stay on the built-in
 * assistant, while constrained desktops are pointed at the lightest CPU model
 * when it actually fits. Capable devices get no advice.
 */
export function recommendDeviceModel(
  models: LocalModel[],
  profile: DeviceProfile,
): DeviceRecommendation | null {
  const lowMemory = profile.memoryGB !== null && profile.memoryGB <= 4;
  if (profile.webgpu && !lowMemory) return null;

  const lightest = lightestCpuModel(models);
  const fits =
    lightest !== null &&
    profile.wasmJspi &&
    assessModelFit(lightest, profile).level !== "too-large";
  const lightestMB =
    lightest && lightest.runtime === "gguf" ? Math.ceil(lightest.downloadBytes / MB) : null;
  const lightestName = lightest ? modelDisplayName(lightest) : "";

  if (profile.mobile) {
    const alternative =
      lightest && fits && lightestMB !== null
        ? ` If you want real neural replies anyway, the lightest CPU model is ${lightestName} (about ${formatSizeMB(lightestMB)} download).`
        : "";
    return {
      kind: "builtin",
      modelId: null,
      title: "The built-in assistant is the best fit here",
      reason: `Phones without a supported GPU should stay on the built-in assistant: replies are instant, need no download and use almost no memory.${alternative}`,
      actionLabel: "Use the built-in assistant",
    };
  }

  if (lightest && fits && lightestMB !== null) {
    return {
      kind: "cpu",
      modelId: lightest.id,
      title: "A small CPU model fits this device",
      reason: `This device has no supported GPU. ${lightestName} runs on the CPU, downloads about ${formatSizeMB(lightestMB)} and is the lightest real model available. The built-in assistant still works with no download.`,
      actionLabel: "Select the lightest CPU model",
    };
  }

  return {
    kind: "builtin",
    modelId: null,
    title: "The built-in assistant suits this device",
    reason:
      "A neural model would likely run out of memory or be too slow here. Built-in replies are instant and need no download.",
    actionLabel: "Use the built-in assistant",
  };
}

export function deviceSummary(profile: DeviceProfile): string {
  const parts = [profile.webgpu ? "WebGPU available" : "No WebGPU"];
  if (profile.memoryGB !== null) {
    parts.push(profile.memoryGB >= 8 ? "8 GB+ RAM" : `${profile.memoryGB} GB RAM`);
  }
  if (profile.cores !== null) parts.push(`${profile.cores} cores`);
  if (profile.mobile) parts.push(profile.ios ? "iOS" : "phone/tablet");
  if (profile.freeStorageMB !== null) parts.push(`${formatSizeMB(profile.freeStorageMB)} free`);
  return parts.join(" · ");
}
