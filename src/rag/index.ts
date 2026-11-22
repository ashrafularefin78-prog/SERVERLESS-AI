// Retrieval-augmented generation for the user's own documents.
//
// Everything stays on the device: text is chunked in the page, embedded by
// all-MiniLM-L6-v2 in a Worker, and stored as vectors in IndexedDB. Only the
// top matches are injected into the prompt; the model never sees a document it
// was not asked about.
import { newId } from "../storage/db.js";
import type { KnowledgeDoc, KnowledgeProgress, StoredChunk } from "../types.js";
import { recordDiagnostic } from "../diagnostics.js";
import { chunkText } from "./chunk.js";
import { assessRetrieval } from "./confidence.js";
import { RAG } from "./config.js";
import { disposeEmbeddings, embedTexts, setEmbeddingProgressListener } from "./embeddings.js";
import { isPdfFile } from "./pdf-text.js";
import { buildAbstainBlock, buildKnowledgeBlock, type KnowledgeBlock } from "./prompt.js";
import { rankByHybrid } from "./similarity.js";
import { buildRetrievalTrace, type RetrievalTrace } from "./trace.js";
import { deleteKnowledgeDoc, listKnowledgeDocs, loadAllChunks, saveKnowledgeDoc } from "./store.js";

export { RAG, disposeEmbeddings, setEmbeddingProgressListener };
export type { KnowledgeBlock, RetrievalTrace };

/** Grounding for the prompt plus the numbers shown by "show your work". */
export interface RetrievalResult {
  sources: string[];
  block: string;
  trace: RetrievalTrace;
}

export async function listDocuments(): Promise<KnowledgeDoc[]> {
  return listKnowledgeDocs();
}

export async function addDocument(
  title: string,
  text: string,
  onProgress?: (progress: KnowledgeProgress) => void,
): Promise<KnowledgeDoc> {
  const content = String(text ?? "").trim();
  const cleanTitle = String(title ?? "").trim() || "Untitled document";

  if (!content) throw new Error("That document is empty.");
  if (content.length > RAG.maxCharsPerDocument) {
    throw new Error(
      `Documents are limited to ${Math.round(RAG.maxCharsPerDocument / 1000)}k characters.`,
    );
  }

  const existing = await listKnowledgeDocs();
  if (existing.length >= RAG.maxDocuments) {
    throw new Error(`The knowledge base holds at most ${RAG.maxDocuments} documents.`);
  }

  onProgress?.({ phase: "chunk", file: cleanTitle, loaded: 0, total: 1 });
  const pieces = chunkText(content, {
    maxChars: RAG.chunkChars,
    overlapChars: RAG.overlapChars,
  });
  if (!pieces.length) throw new Error("That document has no readable text.");

  const vectors: number[][] = [];
  for (let start = 0; start < pieces.length; start += RAG.embedBatch) {
    const batch = pieces.slice(start, start + RAG.embedBatch);
    vectors.push(...(await embedTexts(batch)));
    onProgress?.({
      phase: "embed",
      file: cleanTitle,
      loaded: Math.min(start + batch.length, pieces.length),
      total: pieces.length,
    });
  }

  const docId = newId();
  const doc: KnowledgeDoc = {
    id: docId,
    title: cleanTitle,
    addedAt: Date.now(),
    chars: content.length,
    chunkCount: pieces.length,
  };

  const chunks: StoredChunk[] = pieces.map((chunk, index) => ({
    id: `${docId}:${index}`,
    docId,
    title: cleanTitle,
    text: chunk,
    vector: Float32Array.from(vectors[index] ?? []),
  }));

  onProgress?.({ phase: "save", file: cleanTitle, loaded: pieces.length, total: pieces.length });
  await saveKnowledgeDoc(doc, chunks);
  return doc;
}

export async function addDocumentFile(
  file: File,
  onProgress?: (progress: KnowledgeProgress) => void,
): Promise<KnowledgeDoc> {
  const pdf = isPdfFile(file);
  const maxBytes = pdf ? RAG.maxBytesPerPdf : RAG.maxCharsPerDocument * 4;
  if (file.size > maxBytes) {
    throw new Error("That file is too large to index in this browser.");
  }

  let text: string;
  if (pdf) {
    // pdf.js is large, so it is loaded only for the files that need it.
    const { extractPdfText } = await import("./pdf.js");
    try {
      text = await extractPdfText(file);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "PasswordException") {
        throw new Error("That PDF is password-protected. Remove the password and try again.");
      }
      if (name === "InvalidPDFException") {
        throw new Error("That file is not a readable PDF.");
      }
      throw error;
    }
    if (!text.trim()) {
      throw new Error("That PDF has no selectable text. Scanned pages need OCR first.");
    }
  } else {
    text = await file.text();
  }

  return addDocument(file.name, text, onProgress);
}

export async function removeDocument(id: string): Promise<void> {
  await deleteKnowledgeDoc(id);
}

/**
 * Find the document passages most relevant to a query and format them for the
 * prompt. Returns null when there is no knowledge base or nothing matches.
 */
export async function retrieveKnowledge(query: string): Promise<RetrievalResult | null> {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return null;

  const docs = await listKnowledgeDocs();
  if (!docs.length) return null;

  const chunks = await loadAllChunks();
  if (!chunks.length) return null;

  const [vector] = await embedTexts([trimmed]);
  if (!vector?.length) return null;

  const hits = rankByHybrid(trimmed, vector, chunks, RAG.topK, RAG.candidateK);
  const counts = { documents: docs.length, chunks: chunks.length };

  const abstain = (grounded: boolean): RetrievalResult => {
    const block = buildAbstainBlock();
    return {
      sources: block.sources,
      block: block.block,
      trace: buildRetrievalTrace({ query: trimmed, vector, hits, ...counts, grounded }),
    };
  };

  if (!hits.length) return abstain(false);

  const top = hits[0]!;
  const assessment = assessRetrieval({
    query: trimmed,
    vector,
    items: chunks,
    topText: `${top.item.title} ${top.item.text}`,
    minCoverage: RAG.minTermCoverage,
  });
  if (!assessment.grounded) {
    recordDiagnostic({
      level: "info",
      source: "rag",
      message: "Knowledge search was too weak to answer from; asking the model to abstain.",
      detail: `semantic ${assessment.semantic.toFixed(2)}, term coverage ${assessment.coverage.toFixed(2)}`,
    });
    return abstain(false);
  }

  const block = buildKnowledgeBlock(
    hits.map(({ item, score }) => ({
      title: item.title,
      text: item.text,
      score,
    })),
    RAG.promptChars,
  );

  // Nothing fit the budget, so there is no context to ground on.
  if (!block) return abstain(false);

  return {
    sources: block.sources,
    block: block.block,
    trace: buildRetrievalTrace({ query: trimmed, vector, hits, ...counts, grounded: true }),
  };
}
