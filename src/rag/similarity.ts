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

function terms(text: string): string[] {
  return (
    String(text ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Number of distinct searchable terms in a query. */
export function distinctTermCount(query: string): number {
  return new Set(terms(query)).size;
}

/** Fraction of distinct query terms that appear anywhere in `text`. */
export function queryTermCoverage(query: string, text: string): number {
  const queryTerms = [...new Set(terms(query))];
  if (!queryTerms.length) return 0;
  const documentTerms = new Set(terms(text));
  return queryTerms.filter((term) => documentTerms.has(term)).length / queryTerms.length;
}

/** Highest cosine score in a candidate list, or 0 when there is nothing to score. */
export function bestSimilarity(
  query: ArrayLike<number>,
  items: { vector: ArrayLike<number> }[],
): number {
  let best = 0;
  for (const item of items) {
    const score = cosineSimilarity(query, item.vector);
    if (score > best) best = score;
  }
  return best;
}

/** BM25-style lexical ranking for exact names, identifiers, and rare terms. */
export function rankByKeyword<T extends { text: string; title?: string }>(
  query: string,
  items: T[],
  limit: number,
): Scored<T>[] {
  const queryTerms = [...new Set(terms(query))];
  if (!queryTerms.length || !items.length || limit <= 0) return [];

  const documents = items.map((item) => {
    const counts = new Map<string, number>();
    for (const term of terms(`${item.title ?? ""} ${item.text}`))
      counts.set(term, (counts.get(term) ?? 0) + 1);
    return { item, counts, length: [...counts.values()].reduce((sum, count) => sum + count, 0) };
  });
  const averageLength =
    documents.reduce((sum, document) => sum + document.length, 0) / items.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      documents.reduce((count, document) => count + Number(document.counts.has(term)), 0),
    );
  }

  const scored = documents.map((document) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = document.counts.get(term) ?? 0;
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (items.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * (document.length / averageLength));
      score += idf * ((frequency * 2.2) / denominator);
    }
    return { item: document.item, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Reciprocal-rank fusion combines semantic and exact-term search fairly. */
export function rankByHybrid<T extends { vector: ArrayLike<number>; text: string; title?: string }>(
  query: string,
  vector: ArrayLike<number>,
  items: T[],
  limit: number,
  semanticCandidates = Math.max(10, limit * 3),
  minSemanticScore = 0.28,
): Scored<T>[] {
  if (limit <= 0 || !items.length) return [];
  const semantic = rankBySimilarity(vector, items, semanticCandidates, minSemanticScore);
  const lexical = rankByKeyword(query, items, semanticCandidates);
  const ranks = new Map<T, number>();
  const rankConstant = 60;

  for (const [list, weight] of [
    [semantic, 1],
    [lexical, 1],
  ] as const) {
    list.forEach(({ item }, index) => {
      ranks.set(item, (ranks.get(item) ?? 0) + weight / (rankConstant + index + 1));
    });
  }

  return [...ranks.entries()]
    .map(([item, score]) => ({ item, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
