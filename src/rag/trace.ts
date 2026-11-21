// "Show your work" data for retrieval. Pure so the numbers behind a grounded
// answer can be unit-tested, and deliberately small: only a short preview of
// each passage is kept so a conversation does not grow with document text.
import type { RetrievalTrace } from "../types.js";
import { cosineSimilarity, queryTermCoverage } from "./similarity.js";

export type { RetrievalHitTrace, RetrievalTrace } from "../types.js";

export const PREVIEW_CHARS = 220;

export function previewText(text: string, limit = PREVIEW_CHARS): string {
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

export function buildRetrievalTrace({
  query,
  vector,
  hits,
  documents,
  chunks,
  grounded,
}: {
  query: string;
  vector: ArrayLike<number>;
  hits: { item: { title: string; text: string; vector: ArrayLike<number> }; score: number }[];
  documents: number;
  chunks: number;
  grounded: boolean;
}): RetrievalTrace {
  const traced = hits.map(({ item, score }) => {
    const semantic = cosineSimilarity(vector, item.vector);
    return {
      title: item.title,
      score: Number(score.toFixed(4)),
      semantic: Number(semantic.toFixed(4)),
      coverage: Number(queryTermCoverage(query, `${item.title} ${item.text}`).toFixed(3)),
      preview: previewText(item.text),
    };
  });

  return {
    query: previewText(query, 160),
    grounded,
    bestSemantic: traced.reduce((best, hit) => Math.max(best, hit.semantic), 0),
    bestCoverage: traced.reduce((best, hit) => Math.max(best, hit.coverage), 0),
    documents,
    chunks,
    hits: traced,
  };
}
