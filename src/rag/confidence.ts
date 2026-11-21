// Decides whether a retrieval result is strong enough to answer from. Weak
// matches are turned into an explicit "I cannot find the answer" instruction so
// a small model has a safe path instead of inventing an answer.
import { bestSimilarity, distinctTermCount, queryTermCoverage } from "./similarity.js";

export interface RetrievalAssessment {
  /** True when the best passage is relevant enough to ground an answer. */
  grounded: boolean;
  /** Best cosine score across all stored chunks. */
  semantic: number;
  /** Share of query terms present in the top passage. */
  coverage: number;
}

/** Below this cosine score a passage is treated as unrelated. */
export const MIN_SEMANTIC_SCORE = 0.28;

/**
 * Multi-word queries can also be grounded by exact terms alone (identifiers,
 * error codes, names) because embeddings score those poorly. Single-word
 * queries must clear the semantic floor: a lone common word proves nothing.
 */
export const MIN_TERM_COVERAGE = 0.6;

export const MIN_TERMS_FOR_LEXICAL = 2;

export function assessRetrieval({
  query,
  vector,
  items,
  topText,
  minSemantic = MIN_SEMANTIC_SCORE,
  minCoverage = MIN_TERM_COVERAGE,
}: {
  query: string;
  vector: ArrayLike<number>;
  items: { vector: ArrayLike<number> }[];
  topText: string;
  minSemantic?: number;
  minCoverage?: number;
}): RetrievalAssessment {
  const semantic = bestSimilarity(vector, items);
  const coverage = queryTermCoverage(query, topText);
  const lexical = distinctTermCount(query) >= MIN_TERMS_FOR_LEXICAL && coverage >= minCoverage;
  return { grounded: semantic >= minSemantic || lexical, semantic, coverage };
}
