import { describe, expect, it } from "vitest";
import { PREVIEW_CHARS, buildRetrievalTrace, previewText } from "../../src/rag/trace.js";

const hits = [
  {
    item: { title: "handbook.md", text: "Refunds take five business days.", vector: [1, 0] },
    score: 0.0328,
  },
  {
    item: { title: "faq.md", text: "Support answers within one day.", vector: [0.6, 0.8] },
    score: 0.0161,
  },
];

describe("previewText", () => {
  it("collapses whitespace and trims", () => {
    expect(previewText("  one\n\ntwo\tthree  ")).toBe("one two three");
  });

  it("truncates to the limit with an ellipsis", () => {
    const preview = previewText("x".repeat(400));
    expect(preview.length).toBe(PREVIEW_CHARS);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("handles empty input", () => {
    expect(previewText("")).toBe("");
    expect(previewText(undefined)).toBe("");
  });
});

describe("buildRetrievalTrace", () => {
  it("records per-passage scores and a bounded preview", () => {
    const trace = buildRetrievalTrace({
      query: "refund window",
      vector: [1, 0],
      hits,
      documents: 2,
      chunks: 11,
      grounded: true,
    });

    expect(trace.grounded).toBe(true);
    expect(trace.documents).toBe(2);
    expect(trace.chunks).toBe(11);
    expect(trace.bestSemantic).toBeCloseTo(1, 3);
    // "refund" does not match "Refunds": coverage is exact-term, not stemmed.
    expect(trace.bestCoverage).toBe(0);
    expect(trace.hits.map((hit) => hit.title)).toEqual(["handbook.md", "faq.md"]);
    expect(trace.hits[0].preview).toBe("Refunds take five business days.");
    expect(trace.hits[1].semantic).toBeCloseTo(0.6, 3);
  });

  it("reports exact term coverage for a matching query", () => {
    const trace = buildRetrievalTrace({
      query: "refunds take five",
      vector: [1, 0],
      hits,
      documents: 1,
      chunks: 1,
      grounded: true,
    });
    expect(trace.bestCoverage).toBe(1);
    expect(trace.hits[0].coverage).toBe(1);
  });

  it("stores no document text beyond the preview", () => {
    const long = {
      item: { title: "big.md", text: "secret ".repeat(500), vector: [1, 0] },
      score: 1,
    };
    const trace = buildRetrievalTrace({
      query: "secret",
      vector: [1, 0],
      hits: [long],
      documents: 1,
      chunks: 1,
      grounded: true,
    });
    expect(trace.hits[0].preview.length).toBe(PREVIEW_CHARS);
    expect(JSON.stringify(trace).length).toBeLessThan(1200);
  });

  it("rounds scores so stored conversations stay compact", () => {
    const trace = buildRetrievalTrace({
      query: "refunds",
      vector: [1, 0],
      hits,
      documents: 2,
      chunks: 2,
      grounded: false,
    });
    expect(trace.grounded).toBe(false);
    expect(trace.hits[0].score).toBe(0.0328);
    expect(trace.hits[0].semantic).toBe(1);
  });

  it("reports an empty trace when nothing was retrieved", () => {
    const trace = buildRetrievalTrace({
      query: "unrelated",
      vector: [0, 1],
      hits: [],
      documents: 0,
      chunks: 0,
      grounded: false,
    });
    expect(trace.hits).toEqual([]);
    expect(trace.bestSemantic).toBe(0);
    expect(trace.bestCoverage).toBe(0);
  });
});
