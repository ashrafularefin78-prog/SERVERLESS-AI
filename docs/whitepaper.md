# LocalMind architecture whitepaper

How a chat assistant can run with no server, what the privacy claim actually rests on, and where the boundaries are. This is a technical document, not marketing: every claim names the code that implements it, and the last section explains how to verify the claims yourself.

## 1. Problem

A conventional AI chat needs a server to run inference, which means prompts, documents, and replies leave the user's device. LocalMind tests a narrower hypothesis: for the tasks a small model can do — summarising, explaining, drafting, answering questions about a handful of documents — the whole pipeline can run in a browser tab, and the privacy property that follows is stronger than a policy promise, because there is no endpoint to send data to.

Two things make that possible today: WebGPU gives browsers a compute path fast enough for quantised transformer inference, and the browser storage APIs (IndexedDB, OPFS, Cache Storage, WebCrypto) are complete enough to replace the server's database, filesystem, and key management.

## 2. Design constraints

1. **No backend.** Static files on any host. No API keys, no accounts, no functions.
2. **Never block the UI.** Inference, embedding, and PDF parsing each run outside the main thread where they can be long-running.
3. **Fail down, not out.** Every optional capability (WebGPU model, CPU model, retrieval) degrades to the rule engine rather than an error screen.
4. **Small initial payload.** The shell must load on a phone; model code is lazy-loaded. Enforced by `npm run check:size` (260 kB gzip budget for entry JS, CSS, and HTML).
5. **Treat all model and document output as untrusted.** Sanitize before it reaches the DOM; no `eval`, and the CSP has no `unsafe-eval`.

## 3. Component topology

```
main thread                         worker(s)                     storage
-----------                         ---------                     -------
app.ts (state, DOM, events)
  |-- understand.ts, memory.ts, guardrails.ts, context.ts
  |-- chat/replies.ts, coder/          (pure rules, no DOM)
  |-- ui/render.ts, markdown.ts        (DOMPurify + highlight.js)
  |-- engine/manager.ts  ---- typed postMessage ----> model-worker.ts ---> WebGPU
  |     |-- demo.ts (rule engine, main thread)                              |
  |     `-- gguf.ts (wllama, WASM)                                     OPFS weights
  |-- rag/index.ts -------- typed postMessage ----> embed-worker.ts
  |     |-- chunk.ts, similarity.ts, confidence.ts, prompt.ts, trace.ts
  |     `-- store.ts ----------------------------------------------> IndexedDB
  `-- storage/db.ts ------------------------------------------------> IndexedDB
```

The rule engine runs on the main thread deliberately: it is pure, fast, and avoids worker round-trips for the default experience. Everything that can block for more than a frame — inference, ONNX embedding, pdf.js parsing — is isolated.

Message shapes that cross the worker boundary live in one module (`src/engine/worker-protocol.ts`) as discriminated unions with runtime guards, so a sender and a handler cannot drift apart silently.

## 4. The inference path

Two backends produce the same `StreamChunk` sequence, which is what lets the UI ignore which one is running:

- **Rule engine** (`src/engine/demo.ts`): a layered resolver over the normalised prompt. No download, instant, deterministic.
- **Neural path** (`src/engine/local.ts`): WebLLM via `WebWorkerMLCEngine`, or wllama for GGUF on the CPU. Weights are cached in OPFS; the compiled WebGPU artifacts live in the same private storage. Nothing is precached by the service worker, because a 1 GB download installed in the background would be hostile.

Context is budgeted before every request. `contextLimitsFor()` (`src/config.ts`) converts the model's declared window into a message count and character budget after reserving space for the system prompt, the requested completion, and a safety margin; `generationOutputBudget()` then caps `max_tokens` against the actual prompt so the runtime is never asked for more tokens than remain. Character-based estimates are used because the app has no tokenizer for every catalogue entry — a deliberate approximation, documented as such.

A dead worker is treated as a first-class state, not an exception: `error`/`messageerror` handlers report the crash once, release the engine, abort the in-flight generation, and fall back to the rule engine with an explanation. Out-of-memory detection matches explicit messages (`out of memory`, `device lost`, `allocation failed`, `memory access out of bounds`). An OOM while _loading_ triggers one reload with a session flag that skips the model that crashed, so the loop cannot repeat.

## 5. Storage, and why each API

| Need                               | API              | Reason                                                        |
| ---------------------------------- | ---------------- | ------------------------------------------------------------- |
| Structured records, queries by key | IndexedDB        | Transactional, indexed, works everywhere                      |
| Large binary files (weights)       | OPFS             | Streaming reads and writes; no blob-in-database memory spikes |
| App shell and assets               | Cache Storage    | Service worker control, offline                               |
| Ephemeral per-tab log              | `sessionStorage` | Dies with the tab, survives a reload                          |
| Keys, encryption, digests          | WebCrypto        | Non-extractable keys, constant-time primitives                |

The database is opened at its existing version first and then upgraded if required, so a profile that has already migrated does not throw `VersionError`; a missing-store check reopens at `version + 1` to run the same idempotent creation path. This is the pattern every future store extends.

Downloads are resumable where the app owns the HTTP layer: `HEAD` supplies the validator and size, partial bytes live in OPFS, and a resume sends `Range` with `If-Range`. A changed ETag, an oversized partial, or a server that ignores ranges restarts cleanly rather than splicing two file versions. WebLLM's artifact cache exposes no partial-download API, so WebGPU models restart if interrupted.

## 6. Cryptography

Optional vault, opt-in per device:

- **Key derivation:** PBKDF2-HMAC-SHA-256, 600,000 iterations, random 16-byte salt, NFKC-normalised passphrase with a 12-character minimum. Keys are derived as non-extractable AES-256-GCM keys, so JavaScript cannot read them back.
- **Encryption:** AES-GCM with a fresh 96-bit IV per record. The AAD binds a ciphertext to its record (`conversations:<id>`, `settings:vault-notes`), so a record cannot be moved to another key position without failing authentication.
- **Verifier:** a known string encrypted under the derived key lets the app reject a wrong passphrase without storing the passphrase or a hash of it.
- **Lifecycle:** the key lives in a module variable for the tab's lifetime, never in storage. Locking clears it, empties the UI, and leaves ciphertext in place. Idle timeout and tab-hide lock automatically.
- **Migration:** v1 vaults (310,000 iterations, no AAD) are readable with their original parameters and are re-wrapped to v2 on unlock, transactionally, so no conversation is left half-migrated.

Honest limits: knowledge documents and their vectors are not vault-encrypted yet; the vault protects data at rest, not a compromised browser; and the passphrase cannot be recovered.

## 7. Retrieval

1. **Chunk** deterministically, ~900 characters with 120-character overlap, preferring paragraph and sentence boundaries.
2. **Embed** with `all-MiniLM-L6-v2` (384 dimensions, q8) in a dedicated worker via Transformers.js. The model downloads once; inference is CPU-only, so retrieval works without WebGPU.
3. **Rank twice.** Exact cosine over every stored chunk (correct top-k, no approximate index needed at browser scale) plus a BM25-style term ranking for names, error codes, and identifiers that embeddings score poorly. The two lists are merged by reciprocal-rank fusion, which is rank-based and therefore does not require calibrating two incomparable score scales.
4. **Decide whether to answer at all.** `assessRetrieval()` grounds a passage that clears the cosine floor, or a multi-word query whose terms are mostly present. A single shared word proves nothing. Weak results produce an explicit abstain instruction — reply exactly _"I cannot find the answer in the provided documents."_ — instead of leaving a small model to invent an answer.
5. **Frame the prompt.** Excerpts go inside `<context> … </context>` with rules that the block is data, never instructions, and that an override attempt is itself an injection. Document text is escaped first so it cannot close the delimiter or forge a chat-template token.
6. **Record the trace** (query, per-passage cosine, term coverage, fused rank, 220-character preview) so a user can open "How this answer was grounded" and see what the model was given.

## 8. Threat model summary

| Threat                          | Mitigation                                                                                                    | Residual                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| XSS via model output            | DOMPurify with a restrictive allowlist, `textContent` while streaming, no raw HTML, CSP without `unsafe-eval` | Sanitizer 0-day; Trusted Types not enabled yet                                  |
| Prompt injection from documents | Delimited, escaped context block plus explicit ignore instructions                                            | A small model can still be persuaded; no tools exist for it to misuse           |
| Hallucination on documents      | Confidence gate with an explicit abstain path                                                                 | Weak retrieval can still pass the floor                                         |
| Malicious model file            | Pinned commit URL, exact size check, validator-pinned resume, WebLLM SRI for WebGPU models                    | No full SHA-256 of multi-GB GGUF (no streaming digest in WebCrypto)             |
| Silent exfiltration             | Offline mode blocks all cross-origin requests; CSP allowlist; no analytics                                    | WebSockets, cross-origin navigation, and a compromised browser are out of scope |
| Local device compromise         | Optional AES-256-GCM vault                                                                                    | Unlocked vault is readable by anything in the tab                               |

## 9. Verification

The privacy and security claims are designed to be checked, not trusted:

```bash
npm ci
npm test                 # rules, retrieval, crypto, licenses, diagnostics, offline policy
npm run test:e2e:preview # browser flows, CSP, service worker, accessibility
npm run check:size       # initial payload budget
npm run docs:api         # TypeDoc for the engine, retrieval, crypto modules
```

To check the network claim by hand: open DevTools → Network, use the app normally, and confirm there are no requests beyond the asset load and any model download you start. Then enable **Offline mode** and confirm the app keeps working with cross-origin traffic refused. `tests/e2e/app.spec.js` asserts the same two properties: no cross-origin request during a chat, and a blocked cross-origin request while the switch is armed.

## 10. What this architecture is not

- **Not a replacement for a frontier model.** Small quantised models are useful for focused tasks; the rule engine is not a language model at all.
- **Not a multi-user system.** One browser profile, one user, no sync. Sharing means exporting a file.
- **Not fully encrypted.** Chats and notes can be; knowledge documents cannot yet.
- **Not serverless in the cloud-functions sense.** It is a static site with no backend at all.

Those limits are the price of the property this design does deliver: with the vault unlocked and the network idle, the data exists in exactly one place, and the user can erase it without asking anyone.

## References

- [Architecture](architecture.md) — implementation-level tour
- [Security](../SECURITY.md) — threat model and residual risks
- [Privacy](../PRIVACY.md) — data handling and GDPR mapping
- [Rule engine](rule-engine.md) — resolver order and extension points
- [Roadmap](../ROADMAP.md) — deferred work and why
