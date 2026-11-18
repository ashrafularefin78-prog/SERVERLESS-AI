// Vector scoring for the local retrieval index. Tables are small (browser
// documents, not a corpus), so a flat cosine scan is the right data structure:
// no graph to build, no recall approximations, and it always returns the true
// top-k.

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (!a.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

export interface Scored<T> {
  item: T;
  score: number;
}

/** Rank items by cosine similarity, dropping anything below `minScore`. */
export function rankBySimilarity<T extends { vector: ArrayLike<number> }>(
  query: ArrayLike<number>,
  items: T[],
  limit: number,
  minScore = 0,
): Scored<T>[] {
  const scored: Scored<T>[] = [];

  for (const item of items) {
    const score = cosineSimilarity(query, item.vector);
    if (score >= minScore) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, limit));
}
