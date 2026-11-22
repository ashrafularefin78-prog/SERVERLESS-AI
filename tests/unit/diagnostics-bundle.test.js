import { describe, expect, it } from "vitest";
import {
  BUNDLE_SCHEMA_VERSION,
  bundleFileName,
  bundleToJson,
  buildDiagnosticsBundle,
} from "../../src/diagnostics-bundle.js";

const gpu = {
  available: true,
  vendor: "nvidia",
  architecture: "ampere",
  device: "",
  description: "",
  limits: { maxStorageBufferBindingSize: 2_147_483_648 },
  webgpuExposed: true,
};

const storage = { quotaMB: 4096, usageMB: 512, opfs: null, opfsError: null };

const entry = {
  id: "abc-1",
  at: 1_700_000_000_000,
  level: "error", // DiagnosticLevel
  source: "model-worker",
  message: "Worker crashed",
};

describe("diagnostics bundle", () => {
  it("records what a maintainer needs and nothing else", () => {
    const bundle = buildDiagnosticsBundle({
      app: { app: "LocalMind 1.0.0", engine: "built-in" },
      diagnostics: [entry],
      gpu,
      storage,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });

    expect(bundle.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    expect(bundle.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(bundle.app.app).toBe("LocalMind 1.0.0");
    expect(bundle.gpu).toMatchObject({ available: true, vendor: "nvidia" });
    expect(bundle.storage.quotaMB).toBe(4096);
    expect(bundle.diagnostics).toEqual([entry]);
    // The bundle is an allowlist: there is no field that could carry chat text.
    expect(Object.keys(bundle).sort()).toEqual([
      "app",
      "diagnostics",
      "environment",
      "generatedAt",
      "gpu",
      "schemaVersion",
      "storage",
    ]);
  });

  it("keeps the environment summary coarse", () => {
    const bundle = buildDiagnosticsBundle({
      app: {},
      diagnostics: [],
      gpu,
      storage,
    });
    // No screen coordinates per element, no storage keys, no settings values.
    const keys = Object.keys(bundle.environment).sort();
    expect(keys).toEqual([
      "crossOriginIsolated",
      "deviceMemoryGB",
      "hardwareConcurrency",
      "language",
      "platform",
      "screen",
      "serviceWorker",
      "userAgent",
    ]);
  });

  it("serializes to a JSON file ending in a newline", () => {
    const json = bundleToJson(buildDiagnosticsBundle({ app: {}, diagnostics: [], gpu, storage }));
    expect(json.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("names the file by UTC time, sortable and without spaces", () => {
    const name = bundleFileName(new Date("2026-01-02T03:04:05.678Z"));
    expect(name).toBe("localmind-diagnostics-2026-01-02T03-04-05.json");
    expect(name).not.toMatch(/\s/);
  });
});
