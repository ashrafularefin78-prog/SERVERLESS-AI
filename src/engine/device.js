export async function detectDevice() {
  const device = {
    webgpu: false,
    reason: null,
    vendor: null,
    architecture: null,
    shaderF16: false,
    features: [],
    maxBufferSize: 0,
    maxStorageBufferBindingSize: 0,
    deviceMemory: Number(navigator.deviceMemory) || null,
    cores: Number(navigator.hardwareConcurrency) || null,
    mobile: window.matchMedia("(pointer: coarse)").matches,
    storage: null,
  };

  if (!("gpu" in navigator)) {
    device.reason = "This browser does not expose WebGPU.";
    return device;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      device.reason = "WebGPU is present, but no compatible GPU adapter was found.";
      return device;
    }

    device.webgpu = true;
    device.features = Array.from(adapter.features ?? []);
    device.shaderF16 = device.features.includes("shader-f16");
    device.maxBufferSize = Number(adapter.limits?.maxBufferSize) || 0;
    device.maxStorageBufferBindingSize = Number(adapter.limits?.maxStorageBufferBindingSize) || 0;

    if (adapter.info) {
      device.vendor = adapter.info.vendor || adapter.info.description || null;
      device.architecture = adapter.info.architecture || null;
    }
  } catch (error) {
    device.reason = error?.message || "WebGPU initialization failed.";
  }

  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      device.storage = {
        usage: Number(estimate.usage) || 0,
        quota: Number(estimate.quota) || 0,
      };
    }
  } catch {
    // Storage estimates are optional.
  }

  return device;
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Best effort only.
  }
  return false;
}

export function deviceSummary(device) {
  if (device.webgpu) {
    const gpu = [device.vendor, device.architecture].filter(Boolean).join(" ");
    return gpu ? `WebGPU ready - ${gpu}` : "WebGPU ready";
  }
  return device.reason || "Running in CPU mode";
}

export function deviceTags(device) {
  const tags = [];
  if (device.webgpu) {
    tags.push({ label: "WebGPU", good: true });
    if (device.shaderF16) tags.push({ label: "shader-f16", good: true });
    if (device.maxBufferSize) tags.push({ label: `max buffer ${formatMemory(device.maxBufferSize)}` });
  } else {
    tags.push({ label: "CPU / WASM", good: false });
  }
  if (device.deviceMemory) tags.push({ label: `${device.deviceMemory} GB RAM` });
  if (device.cores) tags.push({ label: `${device.cores} cores` });
  if (device.mobile) tags.push({ label: "mobile" });
  return tags;
}

export function formatMemory(bytes) {
  if (!bytes) return "0";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
}

export function formatCount(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 ** 2;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
