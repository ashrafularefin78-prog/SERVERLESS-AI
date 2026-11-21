# Changelog

## 1.0.0

The first release. LocalMind is a private chat assistant that runs in a browser
tab: a built-in rule engine that needs no download, optional on-device models,
and retrieval over your own documents. There is no server, no account, and no
telemetry. This entry describes the release as a whole, because everything below
shipped before it.

### Chat

- Built-in rule engine that answers common questions instantly, offline, with no
  model download: explanations, comparisons, code help, summaries, and rewrites.
- Optional on-device models: WebGPU models through WebLLM, and community GGUF
  models on the CPU through WebAssembly with resumable downloads.
- Streaming replies with a stop button, regenerate, edit-and-resend, conversation
  history, search, export, and delete.
- Long conversations render a page at a time, so a chat with thousands of messages
  does not build thousands of DOM nodes.
- The view follows a reply only while you are at the end of the conversation. Scroll
  away and it stays put, with a "scroll to bottom" cue that marks new text, and
  finishing a reply never yanks you back down.

### Privacy and security

- No backend, no analytics, no accounts, no cookies. `PRIVACY.md` maps every claim
  to the code that implements it, including erasure and export.
- Optional encrypted vault for chats and memory notes: PBKDF2-SHA-256 at 600,000
  iterations, non-extractable AES-256-GCM keys, per-record associated data, and
  automatic locking. Vaults created by earlier builds are migrated on unlock and
  keep working.
- Strict Content Security Policy without `unsafe-eval`, Trusted Types enforcement
  with a single sanitizing policy behind every HTML sink, and DOMPurify with a
  restrictive allowlist.
- Offline kill switch: the service worker refuses every cross-origin request while
  it is armed, and the state survives a reload.
- Model downloads are gated on license review. The app never infers a license from
  a model name: verified families show their terms, everything else is labelled
  unverified and links to the model card.
- Threat model, residual risks, and a vulnerability-response policy with
  acknowledgement, assessment, and fix targets in `SECURITY.md`.

### Retrieval

- Drop in a document and ask about it. Text is chunked, embedded on-device with
  MiniLM in a worker, and stored in IndexedDB.
- Hybrid ranking: exact cosine over every chunk plus a BM25-style term ranking,
  merged by reciprocal-rank fusion, so names, error codes, and identifiers are
  found as reliably as paraphrases.
- A confidence gate makes weak retrieval answer "I cannot find the answer in the
  provided documents." instead of guessing.
- Retrieved passages are untrusted data: they are escaped inside a delimited
  block with explicit instructions to ignore anything inside it.
- Grounded replies show their work: the passage, its semantic score, term
  coverage, fused rank, and a short preview.

### Performance and reliability

- Community GGUF models request an 8-bit key/value cache with flash attention,
  roughly halving a long conversation's working set, with a fallback to the
  runtime's defaults when a build rejects it.
- The model is released after ten idle minutes, on page hide when the tab is not
  going into the back/forward cache, and before a model switch; the next message
  reloads cached weights instead of downloading again.
- Streamed text is painted once per animation frame, and worker crashes or
  out-of-memory kills fall back to the built-in assistant with an explanation.
- Model fit is checked against free memory, free storage, and, on iOS, Safari's
  roughly 1 GB per-tab limit.
- Installable PWA with an offline app shell, and a local diagnostics log you can
  copy into a bug report.

### Engineering

- 1,600+ unit and evaluation tests, plus a browser suite covering the production
  CSP, service worker, accessibility (axe), rendering, and scroll behavior.
- CodeQL `security-extended`, Dependabot, `npm audit`, SLSA build provenance on
  deploy, commitlint with Conventional Commits, changesets for versioning, and a
  TypeDoc API reference.
- A dev container and a Codespace-ready setup, so a contributor can run the whole
  suite without installing anything locally.
