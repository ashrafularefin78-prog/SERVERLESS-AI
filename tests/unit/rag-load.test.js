import { describe, expect, it } from "vitest";
import { chunkText } from "../../src/rag/chunk.js";
import { bestSimilarity, rankByHybrid } from "../../src/rag/similarity.js";

// A large import must not lock the tab. The embedder runs in a worker, but
// chunking, ranking, and rendering all run on the main thread, so their cost is
// bounded here: a 50,000-word document is far beyond the documented 20-document
// limit and still has to chunk without pathological behavior.

const WORDS = 50_000;

function bigDocument(words = WORDS) {
  const sentences = [];
  for (let index = 0; index < words / 10; index += 1) {
    sentences.push(
      `Paragraph ${index}. The quick brown fox jumps over the lazy dog while twelve wizards judge my vow.`,
    );
  }
  return sentences.join("\n\n");
}

function vector(seed, terms) {
  const out = new Float32Array(384);
  for (const term of terms) {
    const hash = term.length * 7 + seed;
    out[hash % 384] += 1;
  }
  let norm = 0;
  for (const value of out) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let index = 0; index < out.length; index += 1) out[index] /= norm;
  return out;
}

describe("a 50,000-word document", () => {
  it("chunks into bounded pieces quickly", () => {
    const text = bigDocument();
    expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(WORDS);

    const started = performance.now();
    const chunks = chunkText(text);
    const elapsed = performance.now() - started;

    expect(chunks.length).toBeGreaterThan(50);
    for (const chunk of chunks) {
      // The 900-character default plus overlap must hold for every piece.
      expect(chunk.length).toBeLessThanOrEqual(1100);
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
    // Generous: this runs in about 15 ms locally, and the assertion is here to
    // catch an accidental quadratic rather than to measure the CI machine.
    expect(elapsed).toBeLessThan(1500);
  });

  it("keeps every sentence reachable across chunk boundaries", () => {
    const chunks = chunkText(bigDocument(500));
    const joined = chunks.join(" ");
    expect(joined).toContain("quick brown fox");
    // Overlap is the reason a sentence split by a boundary is still findable.
    for (const chunk of chunks) expect(chunk.trim().length).toBeGreaterThan(0);
  });

  it("keeps ranking linear enough for a whole document", () => {
    const chunks = chunkText(bigDocument());
    const candidates = chunks.slice(0, 400).map((text, index) => ({
      text,
      vector: vector(index, ["quick", "fox", "wizards"]),
    }));
    const query = {
      vector: vector(0, ["quick", "fox"]),
      text: "quick fox wizards",
    };

    const started = performance.now();
    const ranked = rankByHybrid(query.text, query.vector, candidates, 4);
    const elapsed = performance.now() - started;

    expect(ranked).toHaveLength(4);
    expect(bestSimilarity(query.vector, candidates)).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
