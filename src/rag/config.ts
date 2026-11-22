// Every retrieval knob in one place. These numbers decide how much of a document
// reaches the model and how many candidates are ranked, so they are declared once
// here and referenced elsewhere instead of being repeated as default arguments.
import { MIN_TERM_COVERAGE } from "./confidence.js";

export const RAG = {
  /** Documents kept in the knowledge base at once. */
  maxDocuments: 20,
  /** Characters accepted per document (roughly 60k tokens). */
  maxCharsPerDocument: 200_000,
  /** Bytes accepted for one PDF, before extraction. */
  maxBytesPerPdf: 25_000_000,
  /** Soft ceiling for one chunk, in characters. */
  chunkChars: 900,
  /** Characters of the previous chunk repeated in the next one. */
  overlapChars: 120,
  /** Hits injected into the prompt. */
  topK: 4,
  /** Candidates ranked before the top hits are chosen. */
  candidateK: 10,
  minTermCoverage: MIN_TERM_COVERAGE,
  /** Character budget for the whole `<context>` block. */
  promptChars: 2600,
  /** Texts embedded per Worker call. */
  embedBatch: 8,
} as const;
