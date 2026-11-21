# Architecture

LocalMind is a static single-page app. All code runs in the browser tab; there is no backend, API, database server, or account system.

## Runtime at a glance

```
index.html
  -> src/main.ts        boot, service-worker registration, fatal-error screen
  -> src/app.ts         DOM events, app state, IndexedDB persistence
       |-- src/understand.ts      normalization and intent hints
       |-- src/memory.ts          explicit memory commands
       |-- src/guardrails.ts      local PII warning + injection/jailbreak refusal
       |-- src/context.ts         context-window compaction and recap
       |-- src/chat/replies.ts    conversational rules
       |-- src/coder/             language/task detection and code recipes
       |-- src/ui/render.ts       safe DOM rendering
       |-- src/markdown.ts        marked + DOMPurify
       |-- src/engine/manager.ts  generation lifecycle for both backends
       |     |-- src/engine/demo.ts    built-in reply engine (pure, testable)
       |     |-- src/engine/models.ts  model catalogue and cache config
       |     |-- src/engine/local.ts   WebGPU session, OPFS cache, streaming
       |     `-- src/engine/model-worker.ts  WebLLM engine in a Worker
       |-- src/rag/               chunking, Transformers.js embeddings, vectors, retrieval
       |     |-- src/rag/embed-worker.ts  MiniLM embeddings in a Worker
       |     |-- src/rag/pdf.ts      lazy pdf.js text extraction for PDF ingestion
       |     `-- src/rag/store.ts    IndexedDB documents and chunk vectors
       |-- src/diagnostics.ts      local error log (never uploaded)
       `-- src/storage/db.ts      IndexedDB conversations and settings
```

Dependencies point downward: UI code may import engine and storage modules, but the demo engine must not import DOM or app state. Keeping `src/engine/demo.ts` independent is what makes Node unit tests straightforward. `local.ts` is the only module that touches WebLLM, and it does so through a dynamic import so the built-in engine boots without it.

## Boot sequence

1. `main.ts` calls `boot()` from `app.ts`.
2. `app.ts` caches DOM nodes, binds events, applies the theme, and loads settings and conversation summaries from IndexedDB.
3. The model panel renders from the static catalogue and probes WebGPU (`navigator.gpu.requestAdapter()`); this does not download anything.
4. `engine.init({ modelId })` marks the built-in engine ready immediately. If a model was chosen previously and its weights are already cached, it loads in the background and the UI switches over when ready.
5. The welcome screen or the most recent conversation is rendered.

If boot fails, `main.ts` shows a self-contained error overlay with a reload action.

## Message lifecycle

1. The composer calls `handleSend()` and then `sendUserMessage(text)`.
2. `parseMemoryCommand(text)` inspects explicit commands. If one is present, `applyMemoryCommand()` updates the in-memory list and persisted settings, and the outcome is stored for the reply.
3. The user message and a placeholder assistant message are appended to the conversation and saved to IndexedDB.
4. `runGeneration()` passes eligible turns through `compactHistory()` before `engine.generate()`. `contextLimitsFor()` budgets the selected WebLLM model's declared context window for system instructions, output tokens, and a safety margin. The built-in engine has no tokenizer/window metadata, so it uses a conservative 16-message / 8,000-character cap. When earlier turns are dropped, an extractive digest is included as a system note.
5. If the knowledge base has documents, `retrieveKnowledge()` embeds the latest user message, scores stored chunks (flat cosine), and returns a grounding block plus the document titles used. Retrieval errors are logged and the reply continues without context.
6. `engine.generate()` routes to the active backend: `generateDemo()` for the rule engine, or `streamModel()` in `local.ts` for a loaded model. Both yield the same `StreamChunk` shape and honour the abort signal. Model generation calls `interruptGenerate()` on the worker when the signal aborts.
7. On completion the assistant message records `sources`, which the UI renders as "From your documents: ...".
8. `app.ts` appends chunks through `streamText()` using `textContent` while streaming. When the stream finishes, the final content is saved and rendered as sanitized markdown.

Only the newest 60 messages are rendered. `renderConversation()` prepends a "show earlier" control when older turns exist, and appending a page preserves the reader's scroll position by measuring the first message's offset. This bounds DOM work for long conversations without a virtual-scroller dependency; the model prompt is bounded separately by `contextLimitsFor()`.

Stop and regenerate are handled with the run identifier and abort signal. A late chunk from an old run is ignored. Editing a user message loads it into the composer with a banner; sending truncates the conversation at that message and regenerates from the new text. Edit actions are hidden while a reply is generating.

## Data model

IndexedDB database `localmind`, version 2:

| Store             | Key   | Contents                                                                        |
| ----------------- | ----- | ------------------------------------------------------------------------------- |
| `conversations`   | `id`  | Title, timestamps, mode, messages, and grounding sources                        |
| `settings`        | `key` | One row per setting key (theme, memory or encrypted vault, custom instructions) |
| `knowledge`       | `id`  | Document title, size, timestamp, and chunk count                                |
| `knowledgeChunks` | `id`  | Chunk text, owning document id, and a 384-dimension `Float32Array`              |

The v1 to v2 upgrade is additive: existing conversations and settings are read unchanged, and the two knowledge stores are created on demand. `openDb()` also verifies every required store after opening and, if one is missing (an older profile, an interrupted upgrade), reopens at version + 1 to run the same idempotent creation path. It always opens the existing version first, so a profile that already moved past the configured version does not throw `VersionError`. This is the migration pattern to extend for future stores; never renumber or reuse a version.

`settings` rows are merged over `DEFAULT_SETTINGS`, so missing keys get safe defaults. Conversations are sorted by `updatedAt` for the sidebar. "Clear all data" closes and deletes the database, clears caches and web storage, unregisters service workers, and reloads.

### Encrypted vault

Encryption is optional and applies to conversations and memory notes. `crypto.ts` derives a non-extractable AES-256-GCM key from the passphrase with PBKDF2-SHA-256 (310,000 iterations) and a random salt; a verifier blob lets the app reject a wrong passphrase without storing it. `storage/db.ts` holds the key in a module-level variable for the tab's lifetime (`setVaultKey`), never in IndexedDB.

- When a key is set, `saveConversation()` writes `{ id, updatedAt, encrypted: { iv, data } }`; the encrypted payload is the whole conversation. `listConversations()` and `getConversation()` decrypt on read and return nothing while locked.
- Enabling encryption rewrites existing plaintext conversations. Removing it decrypts them and clears the vault key. Both paths encrypt/decrypt before opening the write transaction, because an IndexedDB transaction auto-commits if it has no pending requests while WebCrypto is awaited.
- Memory notes are encrypted into the `memoryVault` settings row (`{ salt, verifier, notes }`), with the plaintext `memory` row emptied. Unlock decrypts notes into app state; lock drops the key, empties memory and chats from the UI, and leaves the ciphertext in place.
- On boot with a vault present, the unlock dialog opens before any chat is loaded, and sending is blocked until the vault is unlocked.

## Reply engine

`src/engine/demo.ts` contains the model-free backend. It has two seams:

- `buildDemoReply()` is a pure function that resolves the text for one turn. Unit tests target this directly.
- `generateDemo()` is an async generator that streams the resolved text and handles cancellation.

`src/engine/manager.ts` owns the state machine (`idle`, `loading`, `ready`, `generating`), exposes `subscribe()` for the UI, and streams replies from whichever backend is active. It also owns model lifecycle: `useModel()` downloads/loads and reports progress, `unloadModel()` frees GPU memory, `deleteModel()` removes cached artifacts.

## On-device model path

- `src/engine/models.ts` holds the display catalogue and the cache configuration (`opfs`, `auto` access mode). Model records themselves come from WebLLM's pinned `prebuiltAppConfig`, so binaries, URLs and SHA-256 integrity data stay tied to the installed package.
- `src/engine/model-worker.ts` hosts `WebWorkerMLCEngineHandler`. It also answers cache queries (`hasModelInCache`, `deleteModelAllInfoInCache`) so the page never imports the inference library just to check storage.
- `src/engine/local.ts` creates the worker, wires `initProgressCallback` to the UI, requests persistent storage, and streams tokens. `isModelCached()`/`deleteCachedModel()` post a small RPC to a dedicated cache worker.
- The inference library is loaded with `import("@mlc-ai/web-llm")` only when a model is loaded, so the entry bundle stays small (`npm run check:size` measures the initial payload, not the lazy chunk).

See [rule-engine.md](rule-engine.md) for the rule order and extension points.

## Retrieval

`src/rag/` is a self-contained pipeline with pure, tested cores:

- `chunk.ts` splits normalized text into deterministic ~900-character chunks with 120-character overlap. Paragraphs and sentences are preferred over hard cuts.
- `embeddings.ts` owns a dedicated Worker (`embed-worker.ts`) that lazily loads `onnx-community/all-MiniLM-L6-v2-ONNX` through Transformers.js and pools to normalized 384-dimension vectors. No embeddings are computed unless the user adds or asks about documents.
- `store.ts` persists documents and chunk vectors in IndexedDB. Vectors are stored as `Float32Array`; removal deletes via the `docId` index.
- `similarity.ts` combines an exact flat cosine ranking with a small BM25-style keyword ranking using reciprocal-rank fusion. This keeps semantic matches while recovering exact names, error codes, and identifiers; it avoids an approximate index and adds no model or runtime download.
- `confidence.ts` decides whether a result may be answered from. A passage must either clear the cosine floor or, for multi-word queries, cover most query terms exactly. Single shared words never count, because they prove nothing.
- `prompt.ts` formats the grounding block and enforces the character budget. Excerpts sit inside `<context> ... </context>`; the rules say the block is untrusted data and repeat the exact abstain sentence. Document text is escaped first: anything resembling a closing delimiter or a `<|...|>` control token is replaced, so a file cannot break out of the block.
- When retrieval is too weak, `buildAbstainBlock()` is used instead of excerpts. It tells the model to reply "I cannot find the answer in the provided documents." for document questions, and to answer normally (without claiming document coverage) for ordinary conversation. Abstained replies record no sources.
- `trace.ts` records what the model was given: the query, a preview of each passage, its cosine score, term coverage, fused rank, and whether the reply was grounded. The trace is stored on the message so "show your work" survives a reload. Previews are capped at 220 characters: the trace explains a decision without copying the document into the chat record.

Embedding runs on the CPU (ONNX Runtime Web, asyncify build) and is independent of WebGPU, so retrieval works even when the chat model cannot run.

## Model worker lifecycle

`src/engine/worker-protocol.ts` holds the only message shapes that cross the worker boundary: cache requests/responses and crash reports. Both sides import the same discriminated unions and guards, so a stale handler fails to compile rather than silently ignoring a request.

`local.ts` attaches `error` and `messageerror` listeners to the inference worker. A dead worker is reported once, the engine is released, and `manager.ts` aborts the in-flight generation, drops back to the built-in assistant, and marks the state with `crash: "oom" | "crash"`. Out-of-memory detection matches explicit messages (`out of memory`, `device lost`, `allocation failed`, `memory access out of bounds`) so ordinary bugs are not mislabelled. The app explains the fallback and, for an OOM during model loading, reloads once with a session flag that skips restoring the same model.

Downloading is separate from running. `resumable-download.ts` owns the HTTP side for community GGUF weights: a `HEAD` probe supplies the validator and size, partial bytes live in OPFS, and a resume sends `Range` plus `If-Range`. A changed ETag, a partial larger than the expected size, or a server that ignores ranges all restart cleanly rather than splicing two file versions. Completed weights are checked against the catalogue size and loaded from the stored blob. WebLLM's artifact cache has no partial-download interface, so WebGPU models restart if interrupted.

The app never type-checks model bytes cryptographically on this path; the catalogue pins URLs to a commit and the size is verified. WebLLM models keep their SRI verification.

## Offline mode

`src/offline.ts` owns the policy and the marker; `public/sw.js` enforces it. The marker is a Cache Storage entry (`localmind-offline-mode`), chosen because the page and the service worker share it and it survives reloads without a message round-trip that a terminated worker could miss.

The worker reads the marker per request, so arming the switch takes effect immediately. Cross-origin requests are routed through an explicit check for every method before the cache logic runs; previously non-GET requests were ignored entirely, which would have left POST beacons unguarded. `activate` preserves the marker cache so a version upgrade cannot silently disarm the switch, and `reconcileOfflineMode()` on boot rewrites the marker from the stored setting so a stale marker cannot block a user who turned it off.

The app also fails fast with a readable message when offline mode is on and a model or embedding download would be required, instead of surfacing a bare network error.

## Diagnostics

`src/diagnostics.ts` is a bounded, local ring buffer (60 entries) persisted in `sessionStorage` with an in-memory fallback. Entries record a level, a source, a short message, and an optional detail. Callers must not record prompts, documents, or chat text; the module truncates and flattens fields but cannot know what a caller passes.

Settings shows the log with copy and clear actions. Copying includes the app version and engine mode; a coarse device summary and the user agent are added only when the opt-in "include device details" setting is on. Nothing is transmitted by the app: the copied text goes wherever the user pastes it.

## Rendering and security boundary

- Streaming text is inserted as plain text.
- Completed replies are parsed by marked, sanitized by DOMPurify with a restrictive allowlist, then inserted through the Trusted Types policy in `src/trusted-types.ts`. Nothing assigns to `innerHTML` directly, so the policy — which sanitizes — is unavoidable.
- Links are restricted to `https:`, `http:`, and `mailto:` and open with `rel="noopener noreferrer"`.
- Images and raw HTML are not rendered.
- The production build injects a CSP meta tag. It allows `wasm-unsafe-eval` for the inference runtime and network access only to the pinned model hosts. Hosts that can set headers should serve the same policy as a header and add `frame-ancestors 'none'`.
- `require-trusted-types-for 'script'` is enforced, with `trusted-types localmind dompurify` allowed: `localmind` is the app policy, and `dompurify` is created by the sanitizer itself. Keep both names when editing the policy, and do not add a second copy of DOMPurify — the second policy creation is refused and sanitizing would return empty output.

The full threat model is in [SECURITY.md](../SECURITY.md).

## Streaming and scroll ownership

The chat view has exactly one rule: follow the reply while the reader is at the
end, and stop the instant they scroll away.

- Deltas are queued and painted once per animation frame (`queueStreamPaint`), so
  a fast stream cannot set text, force layout, and re-read the scroll position
  dozens of times per frame.
- `streamText()` decides whether to stay pinned from the _measured_ scroll
  position rather than a flag, because a scroll event lands a frame later and a
  chunk that arrives in between would otherwise drag the reader back down.
- The scroll listener treats a movement toward the bottom as intent to resume
  and anything else as intent to pause; direction is more reliable than a time
  window, which cannot distinguish a manual scroll that happens right after a
  programmatic jump.
- Finishing a reply does not scroll. If the reader was at the end they are still
  there; if they were not, they stay where they are and the cue shows that new
  text arrived.

## Memory lifecycle

The model is the only large allocation in the app, and it is released three ways:

| Trigger          | Code                                            | Note                                                                   |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Switching models | `engine.useModel()` → `unload()`                | The old worker is terminated before the new one starts.                |
| Ten idle minutes | `createIdleRelease()` in `src/engine/memory.ts` | The countdown is suspended while a reply streams; weights stay cached. |
| Page hide        | `pagehide` handler in `src/app.ts`              | Skipped for the back/forward cache, where the model must survive.      |

`unload()` interrupts generation, calls `MLCEngine.unload()` (which drops the KV
cache and the weights), then terminates the worker, which tears down the
`GPUDevice` and every buffer allocated on it. App code never calls
`GPUBuffer.destroy()`: those objects belong to WebLLM, and reaching into them
would corrupt the runtime rather than free it.

Clearing a chat deliberately does **not** unload the model. Deleting history is
not a memory action, and forcing a one-gigabyte reload afterwards would be a
worse outcome than the memory it saved.

## Offline and PWA

`public/sw.js` caches the app shell during install, precaches hashed entry assets by reading `index.html`, and uses:

- network-first for navigation requests, with a cached shell fallback,
- stale-while-revalidate for same-origin assets.

The worker ignores non-GET requests and cross-origin URLs. The Vite build rewrites the cache version on each build, and activation deletes older caches.

## Performance notes

The built-in engine is small and runs on the main thread. That is a deliberate tradeoff: no Worker startup, no message serialization, and no duplicated state. Keep individual rule checks cheap and avoid scanning large inputs repeatedly.

An on-device model always runs in a Worker. WebGPU decoding on the main thread would jank the chat UI, and the Worker boundary keeps GPU memory reclaimable: `unload()` terminates it. Weight downloads and compiled artifacts are cached in OPFS, never in IndexedDB and never in the service worker cache.

The initial production payload has a **260 kB gzip budget**, enforced by `npm run check:size` in CI. The check measures the entry JavaScript, stylesheet, and HTML referenced by `dist/index.html`. The app is model-free, so everything it needs ships in this payload; the entry bundle should not grow without a deliberate decision.

If reply rules grow substantially, `src/engine/demo.ts` can move behind a Worker without touching UI code, because it has no DOM dependencies. The app already imports the engine through a small API (`init`, `generate`, `stop`, `subscribe`).

## TypeScript

The app is written in strict TypeScript (`tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `noEmit`). Vite and Vitest resolve `./x.js` import specifiers to `x.ts`, so import paths keep the `.js` suffix even though the sources are `.ts`. Shared shapes live in `src/types.ts`. `npm run typecheck` runs `tsc --noEmit` and is enforced in CI; ESLint uses `typescript-eslint` for `.ts` files.

Migration is phased. The application surface — boot, state, DOM rendering, markdown, storage, engine, chat rules, memory, understanding, and coder detection (`config`, `understand`, `memory`, `storage/db`, `engine/*`, `chat/replies`, `coder/languages`, `coder/programs`, `coder/highlight`, `coder/grammars`, `markdown`, `ui/render`, `app`, `main`) — is fully typed.

The code-generation cluster under `src/coder/` (`ir.js`, `emit/*`, `recipes/*`, `spec/*`) is still JavaScript, compiled under `allowJs` with `checkJs: false`. It builds a language-neutral node tree (`{ k: ... }`) and renders it through dynamic dispatch (`this[\`s_${node.k}\`]`), so typing it well means a discriminated-union IR with narrowing across every emitter — a deliberate follow-up refactor, not part of this phase. It is covered by unit and browser tests, and its public entry points (`coder/languages.ts`, `coder/programs.ts`) are typed, so the rest of the app interacts with it through a checked boundary.

## Tests and CI

- Vitest covers pure logic: normalization, memory, reply rules, language detection, the demo engine, and retrieval internals (chunking, overlap, cosine ranking, grounding-block budget).
- A golden eval suite (`tests/evals/cases.json` + `evals.test.js`) asserts reply properties, deterministic repeatability (fixed clock), and a per-case latency budget. Run it with `npm run evals`; it also runs inside `npm test`.
- A model eval harness (`tests/evals/model/cases.json` + `scripts/model-eval.mjs`) scores recorded WebGPU replies against property checks and gates on drift from `baseline.json` (pass rate, per-case flip, p95 latency, verbosity, model id). `npm run evals:model:record` captures a real run through Playwright; `npm run evals:model` replays it without a GPU. CI replays; it skips with an explicit message until a recording is committed.
- Playwright covers the browser flows and asserts that a chat makes no cross-origin requests.
- GitHub Actions runs typecheck, lint, formatting, unit tests, evals, build, and Playwright on pushes and pull requests.
