import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIAGNOSTICS_LIMIT,
  clearDiagnostics,
  formatDiagnostics,
  listDiagnostics,
  recordDiagnostic,
  subscribeDiagnostics,
} from "../../src/diagnostics.js";
import {
  isCacheRequest,
  isCacheResponse,
  isOutOfMemoryMessage,
  isWorkerCrashReport,
} from "../../src/engine/worker-protocol.js";

beforeEach(() => {
  clearDiagnostics();
});

describe("diagnostics log", () => {
  it("records entries in order with an id and timestamp", () => {
    const first = recordDiagnostic({ level: "warn", source: "rag", message: "Embedding failed" });
    const second = recordDiagnostic({ level: "error", source: "model-worker", message: "OOM" });

    expect(first.id).not.toBe(second.id);
    expect(first.at).toBeGreaterThan(0);
    expect(listDiagnostics().map((entry) => entry.message)).toEqual(["Embedding failed", "OOM"]);
  });

  it("keeps only the most recent entries", () => {
    for (let index = 0; index < DIAGNOSTICS_LIMIT + 5; index += 1) {
      recordDiagnostic({ level: "info", source: "test", message: `entry ${index}` });
    }
    const entries = listDiagnostics();
    expect(entries).toHaveLength(DIAGNOSTICS_LIMIT);
    expect(entries[entries.length - 1].message).toBe(`entry ${DIAGNOSTICS_LIMIT + 4}`);
    expect(entries[0].message).toBe("entry 5");
  });

  it("flattens newlines and caps very long fields", () => {
    const entry = recordDiagnostic({
      level: "error",
      source: "model-worker",
      message: `line one\nline two${"x".repeat(600)}`,
    });
    expect(entry.message).not.toContain("\n");
    expect(entry.message.startsWith("line one line two")).toBe(true);
    expect(entry.message.endsWith("...")).toBe(true);
    expect(entry.message.length).toBe(400);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDiagnostics(listener);
    recordDiagnostic({ level: "info", source: "test", message: "one" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    recordDiagnostic({ level: "info", source: "test", message: "two" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("formatDiagnostics", () => {
  it("explains an empty log", () => {
    expect(formatDiagnostics([], { app: "LocalMind 1.0.0" })).toContain(
      "No local errors recorded.",
    );
  });

  it("includes context and one line per entry", () => {
    recordDiagnostic({
      level: "error",
      source: "model-worker (oom)",
      message: "out of memory",
      detail: "model: qwen",
    });
    const text = formatDiagnostics(listDiagnostics(), { app: "LocalMind 1.0.0" });

    expect(text).toContain("app: LocalMind 1.0.0");
    expect(text).toContain("ERROR model-worker (oom): out of memory");
    expect(text).toContain("model: qwen");
    expect(text.startsWith("LocalMind diagnostics")).toBe(true);
  });
});

describe("worker protocol", () => {
  it("accepts a well-formed cache request and rejects malformed ones", () => {
    expect(isCacheRequest({ kind: "localmind:cache", id: 1, op: "has", modelId: "m" })).toBe(true);
    expect(isCacheRequest({ kind: "localmind:cache", id: 1, op: "wipe", modelId: "m" })).toBe(
      false,
    );
    expect(isCacheRequest({ kind: "localmind:cache", id: "1", op: "has", modelId: "m" })).toBe(
      false,
    );
    expect(isCacheRequest(null)).toBe(false);
    expect(isCacheRequest("cache")).toBe(false);
  });

  it("distinguishes successful and failed cache responses", () => {
    expect(isCacheResponse({ kind: "localmind:cache-result", id: 1, ok: true, value: 3 })).toBe(
      true,
    );
    expect(isCacheResponse({ kind: "localmind:cache-result", id: 1, ok: false, error: "no" })).toBe(
      true,
    );
    expect(isCacheResponse({ kind: "localmind:cache-result", id: 1, ok: false })).toBe(false);
    expect(isCacheResponse({ kind: "localmind:cache-result", id: 1 })).toBe(false);
  });

  it("validates crash reports", () => {
    expect(
      isWorkerCrashReport({
        kind: "localmind:worker-crash",
        reason: "oom",
        message: "out of memory",
        modelId: null,
      }),
    ).toBe(true);
    expect(
      isWorkerCrashReport({ kind: "localmind:worker-crash", reason: "boom", message: "x" }),
    ).toBe(false);
  });

  it("classifies out-of-memory errors without matching ordinary failures", () => {
    expect(isOutOfMemoryMessage("RuntimeError: out of memory")).toBe(true);
    expect(isOutOfMemoryMessage("WebGPU device lost")).toBe(true);
    expect(isOutOfMemoryMessage("RangeError: Array buffer allocation failed")).toBe(true);
    expect(isOutOfMemoryMessage("Failed to fetch model weights: HTTP 404")).toBe(false);
    expect(isOutOfMemoryMessage("")).toBe(false);
  });
});
