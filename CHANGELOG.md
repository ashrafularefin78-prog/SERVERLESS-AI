# Changelog

## 1.1.0

### Minor Changes

- b0473c5: Spanish and German interface, a stated content-safety position, and a community page

  The interface was English-only while the app offered coding help for 66 languages.
  Navigation, controls, headings, dialog titles, buttons, placeholders, and
  `aria-label`s now follow the browser in **English, Spanish, or German**, and can be
  pinned in Settings. English stays in the markup and is its own key, so a missing
  translation renders English rather than a blank button, and a locale the app does
  not ship falls back instead of showing a half-translated mix. Locales are separate
  chunks: a reader who stays on English downloads nothing extra.

  `docs/content-safety.md` states what the app does and does not filter for the 504
  uncensored community models it lists - and why it does not ship a classifier. An
  uncensored model now keeps a bordered warning in Settings for as long as it is
  selected, instead of only a chip in the picker.

  The README gains a Community section covering Discussions (now enabled), the Code of
  Conduct, CODEOWNERS routing, and the protected branch.

- 3dcd076: Every model download in one list, and a stricter accessibility audit

  Settings now has a Model storage section: each catalogue model whose weights are
  actually on this device, with its real size, whether it sits in OPFS or cache
  storage, and a delete button that works on that model rather than only on the one
  you have selected. Sizes come from the files themselves, not from an estimate, and
  a model that appears in both stores is counted once. The same panel reports what
  the site is using against its quota and adds the WebGPU adapter limits that decide
  whether a model can fit.

  The axe audit now also runs with the mobile drawer open, and it immediately failed:
  the scroll-to-bottom cue was 23 px tall and the Thinking-effort select was a
  text-sized touch target. Both now meet the 24x24 minimum, and the drawer is clean.

- d8293f6: Optional prompt redaction, a benchmark, and the design docs to argue with

  Settings has a new opt-in: mask structured identifiers before the text reaches a
  model. Emails, phone numbers, card numbers (Luhn-checked), IBANs (mod 97), US
  social security numbers, API tokens, JWTs, and IPv4 addresses become stable
  placeholders such as `[EMAIL_1]`, in retrieved document passages as well as the
  prompt. The chat keeps exactly what you typed, the log records counts and never
  values, and the module is imported only when the setting is on. Names and postal
  addresses are not detected, and the UI says so.

  `npm run bench` reports time to first token and tokens per second for the current
  device, from the app's own stored statistics, with the median of several runs and
  an explicit `estimatedTokens` flag when the runtime reports no usage. Replies now
  record their time to first token.

  Also: `rfcs/0001-browser-rag-storage.md` specifies the IndexedDB document and
  chunk schema as implemented, with unimplemented ideas marked as proposals;
  `rfcs/README.md` describes the (light) process; `docs/webml-feedback.md` collects
  ten platform gaps found while shipping, each naming the code that worked around
  it; and an offline-mode assertion no longer depends on which toast won a race.

- d1514b2: A first-run introduction, honest indexing progress, and the enterprise paperwork

  A fresh profile now opens with a short introduction instead of an empty chat: it
  names what this device can actually run, recommends the built-in assistant as the
  zero-download path, and offers the model picker only when a model would work. It
  appears once, and a full data reset brings it back because that is a first run
  again.

  Indexing a document now shows where the time goes, with a progress bar and a
  sentence per stage - reading, preparing the embedding model, generating
  embeddings (n of m chunks), saving - instead of one "loading" line.

  Also: a 375x667 viewport test suite (no sideways overflow, drawer off-screen until
  asked, `dvh` height, settings reachable), CODEOWNERS routing for the security and
  supply-chain paths, grouped Dependabot security updates, `npm run deps:licenses`
  (69 shipped dependencies, all permissive; Node-only binaries excluded with a
  reason), Mermaid module and sequence diagrams in `docs/architecture.md`, and a
  tag-triggered CI job that attaches the built archive and SBOM to the GitHub
  Release.

### Patch Changes

- 1681edd: Local observability you can hand over, and the maintenance docs to go with it

  Settings now reads the environment instead of guessing: the WebGPU adapter and
  the limits that constrain a model, the device memory budget, and storage usage
  broken down by OPFS files. `?debug=true` opens that panel directly, which is the
  link to put in a bug report.

  An "Export bundle" button writes a JSON file with that environment, the user
  agent, and the local error log, and nothing else: there is no field in the
  schema that could carry chat, document, or settings content, and an end-to-end
  test sends a marked message and asserts the marker never appears in the file.

  Also: clearing all data now frees the embedding worker that holds the MiniLM
  weights, the retrieval numbers live in one module (`src/rag/config.ts`) instead
  of being repeated as default arguments, lint fails on `any` and on any warning,
  `MAINTAINERS.md` covers releases, model updates, and the load-bearing decisions,
  `docs/ci.md` explains every workflow and the SBOM, a throttled-CPU browser test
  holds the stop button to a response budget, and `docs/release-notes-v1.0.0.md`
  is the 1.0.0 release body.

- 0ae49f0: Fix workers blocked by the app's own Trusted Types policy

  `require-trusted-types-for 'script'` applies to the Worker constructor, and Vite emits
  worker URLs that the policy refuses, so PDF ingestion hung on "Reading …" and model
  loading failed silently in the production build. Workers are now same-origin files
  created through the app's policy, pdf.js is handed a port instead of a worker URL, and
  an end-to-end test ingests a real PDF so the regression cannot come back unseen.

  `npm run demo` runs the launch flow against the production build and writes the
  evidence - screenshots, a full network log, and a report that fails if anything was
  requested between the question and the answer.

- 27953fb: Close the auto-lock plaintext leak, and make CI tell the truth

  The vault now finishes or cancels the streaming reply and writes one last
  encrypted save before the key is dropped, and a tab-hide locks after a 60 second
  grace period instead of instantly. Storage fails closed: with a vault present and
  no key, a conversation save throws instead of writing readable messages, and
  migrating a vault re-encrypts leftover plaintext rows rather than blocking the
  unlock.

  CI's OSV job now grants the `actions: read` permission its reusable workflow
  declares, which was failing every run at startup. Workflows are pinned to commit
  SHAs with version comments and checked by `npm run check:workflows`.

  Also in this release: `npm run test:coverage` measures the real tree again after
  two memory test files collided, the model-upgrade action is offered at the end of
  the rule chain instead of only for listed topics, capable devices get a GPU
  recommendation instead of silence, the reasoning-tag filter applies to every
  model and explains an empty reply, the service worker keeps content-hashed assets
  across updates, `npm run models:licenses` reads the same curated table as the app,
  and Firefox runs the browser suite green.

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
