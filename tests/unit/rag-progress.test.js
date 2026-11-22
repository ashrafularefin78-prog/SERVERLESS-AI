import { describe, expect, it } from "vitest";
import { describeIndexProgress } from "../../src/rag/progress.js";

const progress = (phase, loaded = 0, total = 1, file = "notes.pdf") => ({
  phase,
  file,
  loaded,
  total,
});

describe("describeIndexProgress", () => {
  it("names the stage instead of saying loading", () => {
    expect(describeIndexProgress(progress("chunk")).label).toBe("Reading notes.pdf...");
    expect(describeIndexProgress(progress("save")).label).toBe(
      "Saving notes.pdf to this device...",
    );
    expect(describeIndexProgress(progress("embed", 3, 12)).label).toContain("3/12 chunks");
  });

  it("moves forward through the stages and never goes backwards", () => {
    const stages = [
      describeIndexProgress(progress("chunk")).percent,
      describeIndexProgress(progress("download", 1, 4)).percent,
      describeIndexProgress(progress("embed", 1, 10)).percent,
      describeIndexProgress(progress("embed", 10, 10)).percent,
      describeIndexProgress(progress("save")).percent,
    ];
    for (let index = 1; index < stages.length; index += 1) {
      expect(stages[index]).toBeGreaterThanOrEqual(stages[index - 1]);
    }
    expect(stages.at(-1)).toBeLessThanOrEqual(100);
  });

  it("clamps a nonsensical total instead of dividing by zero", () => {
    const view = describeIndexProgress(progress("embed", 5, 0));
    expect(Number.isFinite(view.percent)).toBe(true);
    expect(view.percent).toBeGreaterThanOrEqual(40);
    expect(view.percent).toBeLessThanOrEqual(100);
  });

  it("stays inside 0-100 for out-of-range counts", () => {
    const low = describeIndexProgress(progress("download", -5, 10));
    const high = describeIndexProgress(progress("embed", 99, 10));
    expect(low.percent).toBeGreaterThanOrEqual(0);
    expect(high.percent).toBeLessThanOrEqual(100);
  });

  it("falls back to a readable label without a file name", () => {
    expect(describeIndexProgress(progress("chunk", 0, 1, "")).label).toBe("Reading document...");
  });

  it("reports the embedding-model download separately from embedding", () => {
    // The first document download is ~25 MB; the reader should know why it is slow.
    const view = describeIndexProgress(progress("download", 50, 100));
    expect(view.label).toContain("embedding model");
    expect(view.label).toContain("50%");
    expect(view.percent).toBeLessThan(describeIndexProgress(progress("embed", 0, 10)).percent + 40);
  });
});
