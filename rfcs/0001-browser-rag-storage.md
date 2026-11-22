# RFC 0001: A browser-local storage schema for retrieval over documents

- **Status:** Draft. §3-§6 and §8 describe what LocalMind 1.0.0 actually stores;
  anything marked **Proposal** is not implemented and is here for discussion.
- **Date:** 2026-11-22
- **Authors:** LocalMind maintainers
- **Implementation:** `src/rag/store.ts`, `src/rag/chunk.ts`, `src/rag/index.ts`,
  `src/storage/db.ts`

## Abstract

Applications that retrieve over a user's own documents inside a browser tab need
a storage layout that is portable across engines, upgradeable without losing data,
and honest about what it does and does not encrypt. This document specifies one:
an IndexedDB schema, a chunking contract, a vector encoding, and the invariants an
implementation must hold. It is written so another application can read the same
database, and so this one can read theirs.

## 1. Motivation

Existing options do not fit:

- **Server-side RAG** needs a server, an account, and an upload, which is the thing
  browser-local retrieval exists to avoid.
- **`localStorage`** is synchronous, string-only, and capped near 5 MB. It cannot
  hold vectors.
- **OPFS** is fast for large blobs but has no secondary indexes, no multi-directory
  transactions, and no query model. It is the right home for model weights, not for
  retrievable chunks.
- **In-memory indexes** (HNSW, FAISS-WASM) are lost on reload and multiply memory
  use on exactly the devices this matters most for.

IndexedDB is the only durable, transactional, indexable store that current
browsers ship without a permission prompt. This RFC fixes the shape of what goes
in it.

## 2. Terminology

- **Document** - one file the user added: a PDF or a plain-text file.
- **Chunk** - a contiguous slice of a document's text, one row per slice.
- **Embedding** - a fixed-length float vector for one chunk, produced on-device.
- **Record** - the stored representation. It may be encrypted; see §6.

## 3. Database

Name: `localmind`. Version: `2` (see §7 for upgrades). Four object stores exist at
v2; two of them belong to this schema.

| Store             | Key   | Index   | Purpose                             |
| ----------------- | ----- | ------- | ----------------------------------- |
| `knowledge`       | `id`  | -       | one row per document                |
| `knowledgeChunks` | `id`  | `docId` | one row per chunk, with its vector  |
| `conversations`   | `id`  | -       | chat history (not part of this RFC) |
| `settings`        | `key` | -       | app settings (not part of this RFC) |

`knowledgeChunks.docId` is indexed so deleting a document deletes its chunks in
the same transaction. IndexedDB has no cross-store foreign key; the writer enforces
that invariant (§5).

## 4. Records

### 4.1 Document (`knowledge`)

```jsonc
{
  "id": "9f2c1e4a-…", // UUID from crypto.randomUUID()
  "title": "invoice-2024-q3.pdf", // file name as given by the user
  "addedAt": 1731000000000, // epoch ms, UTC
  "chars": 48210, // extracted character count, for the budget
  "chunkCount": 37, // written after the chunk rows land
}
```

The extracted text itself is **not** stored twice: it lives only in the chunks.
That keeps the database at one copy of the corpus, at the cost of a document whose
text cannot be exported without concatenating its chunks.

### 4.2 Chunk (`knowledgeChunks`)

```jsonc
{
  "id": "9f2c1e4a-…:7",          // `${docId}:${index}`
  "docId": "9f2c1e4a-…",
  "title": "invoice-2024-q3.pdf", // denormalised for citations
  "text": "…chunk text…",
  "vector": Float32Array(384)     // structured-clone, not JSON
}
```

There is no `index` field: it is recoverable from the id suffix, and a second copy
could disagree with it. There is no cached `norm`: ranking computes similarity
explicitly, because a stale cached norm silently skews results and ranks are cheap
to derive for a few hundred chunks.

### 4.3 Vector encoding

Vectors are stored as `Float32Array`, which IndexedDB stores through its
structured clone algorithm.

- 384 floats cost 1,536 bytes here versus roughly 5 kB as a JSON array of
  decimals. For a 20-document corpus that difference is megabytes.
- Reading one back yields a `Float32Array` in every engine tested (Chromium,
  Firefox, WebKit); a reader that receives an `ArrayBuffer` must wrap it before
  use.
- **Proposal:** record `"encoding": "f32"` on the chunk and default absent to
  `"json"` for readers that prefer JSON. Not implemented; today the encoding is
  fixed by this document.

The embedding model is fixed by the application: `Xenova/all-MiniLM-L6-v2`, 384
dimensions, cosine similarity. **Proposal:** store it in a `meta` row
(`{ key: "embedding", value: { model, dims } }`) and refuse to query a database
whose recorded model differs. Today a model change would silently mix
incomparable vectors; the app pins the model, which avoids the case rather than
detecting it.

## 5. Writer invariants

1. **One transaction per document.** `saveKnowledgeDoc` opens a single
   `readwrite` transaction over both stores and writes the document row and every
   chunk row inside it. The transaction is the commit boundary: a crash leaves
   either the whole document or none of it, because IndexedDB rolls back.
2. **Delete by index.** `deleteKnowledgeDoc` deletes the document row and walks the
   `docId` index with a cursor, deleting each chunk in the same transaction.
   Orphan chunks are a bug, not a cleanup task.
3. **No partial documents.** A document whose extraction or embedding failed is
   never written.
4. **Replace requires delete first.** Re-adding a document with the same content
   creates a new id and leaves the old rows behind; the UI deletes explicitly.
   **Proposal:** derive ids from a content hash so re-ingesting is idempotent.

## 6. Encryption

Documents and vectors are **not** encrypted by LocalMind's vault, and this schema
does not pretend otherwise. `PRIVACY.md` states it as a known limit.

An implementation that does encrypt them must:

- encrypt `text` and `vector` per record, with the record id as associated data;
- leave `id`, `docId`, and `title` in the clear, because the index and the citation
  path need them;
- set `"encrypted": true` on the row and refuse to query a store that mixes
  encrypted and plaintext rows rather than silently skipping half the corpus.

This gap is the main reason the RFC exists: the shape should be settled before
three incompatible variants ship.

## 7. Upgrades

IndexedDB upgrades run inside `onupgradeneeded`, which cannot await anything:

- The upgrade only creates stores and indexes. Data migration runs after open, in
  a normal transaction, and must be idempotent.
- A v1 database (conversations and settings) opens at v2 with empty knowledge
  stores; nothing is renamed or rewritten.
- An implementation must tolerate extra stores it does not recognise and must not
  delete them.

## 8. Chunking contract

Chunking determines retrieval quality, and a reader that re-chunks must produce
the same ids, so it is part of the schema.

- Normalise line endings and collapse runs of spaces and tabs.
- Split on blank lines into paragraphs. A paragraph that fits stays whole; a
  longer one is split on sentence boundaries (`[.!?]` followed by whitespace), and
  a single over-long sentence is split on word boundaries, never mid-word unless
  there is no space in the second half of the window.
- Pack the units greedily, in order, up to the target size.
- Prepend a word-aligned tail of the previous chunk to every chunk after the
  first, so a sentence split across a boundary is still retrievable.
- Target 900 characters with 120 characters of overlap; the overlap is clamped to
  a third of the target. (Implemented in `src/rag/chunk.ts`.)
- Ids are `${docId}:${index}`, 0-based, assigned in document order.

## 9. Retrieval contract

The schema does not prescribe ranking, but it fixes what ranking may assume:

- `vector` is comparable only with vectors from the same model (§4.3).
- `text` and `title` are enough for a citation; nothing else is needed.
- A reader must be able to answer "which document did this come from" from the
  chunk row alone (`docId` + `title`).

LocalMind ranks with cosine similarity over every chunk plus a BM25-style term
score, merged by reciprocal-rank fusion, and abstains when term coverage is too
low. That is policy; another implementation may differ.

## 10. Limits

LocalMind enforces 20 documents, 200,000 characters per document, 25 MB per PDF,
and injects at most 4 hits (2600 characters) into the prompt. These are policy,
not schema. What an implementation must not do is exceed what it can afford to
re-embed on the device it runs on.

## 11. Alternatives considered

- **A single store with nested chunks.** Rejected: deleting one chunk rewrites the
  whole document row and the `docId` index disappears.
- **OPFS plus a manifest file.** Rejected: no transactions and no index; concurrent
  tabs corrupt the manifest without a lock protocol.
- **SQLite-WASM over the OPFS VFS.** Genuinely viable and the obvious alternative.
  It costs roughly 1 MB of WASM plus a locking protocol, and puts the vectors
  behind a query engine a 20-document corpus does not need. If the document limit
  moves into the hundreds, this RFC should be revised in its favour.

## 12. Open questions

1. Should the embedding model be recorded in the database (see §4.3) so a mismatch
   fails loudly instead of silently comparing incomparable vectors?
2. Can the vault encrypt chunk text while keeping delete-by-index? Per §6, yes -
   but no implementation of it has been reviewed.
3. Is `${docId}:${index}` right when a document is re-chunked with different
   settings? A content hash would make re-ingestion idempotent at the cost of a
   digest over every chunk.

Feedback is welcome as an issue on
[the repository](https://github.com/ashrafularefin78-prog/SERVERLESS-AI/issues).
