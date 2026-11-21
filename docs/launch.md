# Launch notes

Copy for the v1.0.0 release, plus the things only a maintainer can do. Every claim
below is checkable in this repository; if a statement stops being true, fix the
statement before posting.

## Show HN

**Title**

> Show HN: Local-first AI with encrypted RAG, running 100% in the browser

**Body**

> I wanted an AI assistant for my own notes and PDFs without uploading them
> anywhere, so I built one that runs entirely in the browser tab: no server, no
> account, no API key, no telemetry.
>
> You can use it without downloading anything. A built-in rule engine handles
> explanations, comparisons, code snippets, and rewrites instantly and offline.
> If you want real model output, it can load a small model on your own GPU through
> WebGPU (Qwen 0.5B by default) or on the CPU through WebAssembly for community
> GGUF builds, with resumable downloads.
>
> The part I care about most is retrieval. Drop in a document and it chunks,
> embeds, and stores it on-device, then ranks passages with both cosine similarity
> and a BM25-style term score, so identifiers and error codes are found as
> reliably as paraphrases. If retrieval is weak, it answers "I cannot find the
> answer in the provided documents" instead of inventing something, and every
> grounded reply has a "how this answer was grounded" panel showing the passages,
> their scores, and a preview. Retrieved text is treated as untrusted: it is
> escaped into a delimited block with explicit instructions to ignore anything
> inside it, because "my document told the model to ignore its instructions" is a
> real attack.
>
> Chats and memory notes can be encrypted with a passphrase: PBKDF2-SHA-256 at
> 600k iterations, AES-256-GCM keys that JavaScript cannot extract, and per-record
> associated data so a record cannot be moved somewhere else. The passphrase is
> never stored and cannot be recovered.
>
> Some deliberate choices you may disagree with:
>
> - No backend at all, which means no sync, no sharing, and no multi-device
>   history. Export is a JSON file.
> - Documents and their vectors are not covered by the vault yet. That is stated
>   in PRIVACY.md rather than implied away.
> - The app cannot resume WebLLM's own artifact downloads, only the GGUF ones,
>   because the runtime owns that cache.
> - No reranking model: it would mean a second download and more per-query
>   latency, so ranking is cosine plus BM25 fused by reciprocal rank.
> - Small models are small. It is useful for focused questions about your
>   documents, not a replacement for a frontier model.
>
> Stack: TypeScript, no framework, WebGPU/WebLLM, wllama, Transformers.js for
> embeddings, IndexedDB and OPFS for storage, WebCrypto for the vault. It ships as
> a static site, and the initial payload is 256 kB gzipped. Trusted Types are
> enforced and the CSP has no `unsafe-eval`.
>
> Things I would like help with: running the model comparison on real WebGPU
> hardware (I only have a CPU here), a streaming SHA-256 check for multi-gigabyte
> GGUF files, and the Safari/iOS path in general.
>
> Live demo: <link>. Source: <link>. Privacy policy and threat model are in the
> repo, and the architecture whitepaper explains the crypto, storage, and
> retrieval design with steps to verify each claim.

Post it as a text post, not a link post: the description is the interesting part,
and a link post gets one line of context. Answer the first two hours of comments.

## Product Hunt

**Tagline (60 chars)**

> A private AI assistant that runs entirely in your browser

**Description**

> Chat with your documents without uploading them. LocalMind runs in a browser
> tab: a built-in assistant that needs no download, optional on-device models on
> your GPU or CPU, and retrieval over your own files. Encrypted chats, no account,
> no server, no telemetry. Works offline.

**Topics:** Productivity, Artificial Intelligence, Privacy, Developer Tools.

**First comment**

> Maker here. I built this because every "chat with your documents" tool asks you
> to upload the documents. LocalMind does the opposite: the embedding model, the
> index, and the chat history all live in your browser, and an offline switch makes
> the service worker refuse every cross-origin request so you can watch it hold.
>
> Two honest limitations: it is a static site, so there is no sync between devices,
> and the smallest useful models are small. It is good at questions about your own
> files and bad at being GPT.

## Hugging Face community post

**Title**

> LocalMind: a static, no-backend chat app that runs WebLLM and GGUF models in the tab

**Body**

> Sharing a project that may be useful to people here: a privacy-first chat app
> that runs models entirely client-side.
>
> - WebGPU models via `@mlc-ai/web-llm` in a worker, with the weights cached in
>   the browser's private origin storage.
> - CPU models via `@wllama/wllama` for community GGUF builds, including resumable
>   downloads through OPFS. KV cache is requested at `q8_0` with flash attention,
>   with an automatic fallback if the build rejects it.
> - Embeddings via `@huggingface/transformers` (`all-MiniLM-L6-v2`, q8) in a
>   dedicated worker.
> - Per-model license gating: the app does not guess a license from a model name,
>   and asks for explicit acceptance when terms are unverified or restricted.
>
> It would help to hear which small models work well in this setting, and whether
> anyone has measured decode speed for GGUF on mobile Safari. The model comparison
> harness in `scripts/model-eval.mjs` needs WebGPU hardware I do not have.
>
> Links: demo, source, whitepaper.

## Before posting

Only a maintainer can do these; each is a repository setting or an external
account.

- [ ] Confirm the deployment URL loads, the service worker installs, and the
      browser suite passes against the deployed build.
- [ ] Enable **GitHub Discussions** (Settings → Features) if the post invites
      questions; otherwise point people at Issues.
- [ ] Turn on branch protection on `main`: required review, required checks
      (`CI`, `CodeQL`, `commitlint`).
- [ ] Enable **Private vulnerability reporting** so `SECURITY.md` is actionable.
- [ ] Register the project on [bestpractices.dev](https://www.bestpractices.dev/)
      using [docs/openssf-badge.md](openssf-badge.md), and answer the gaps honestly.
- [ ] Tag `v1.0.0` and publish the GitHub release with `CHANGELOG.md` as the body.
- [ ] Add a `good first issue` label and 5–10 small tasks, so the first
      contributors have somewhere to start.
- [ ] Decide the funding story. Right now the README says plainly that there is no
      funding account; do not add a Sponsors button until one exists.
- [ ] Check the demo on a phone before posting, including the on-screen keyboard and
      the scroll cue, because that is where a launch thread sends traffic first.

## What not to claim

- Not a replacement for a frontier model.
- Not end-to-end encrypted: the vault protects data at rest, and documents are not
  covered yet.
- Not serverless in the cloud sense; there is no backend at all.
- Not audited. No third-party penetration test has been done.
- Not private against a compromised device or a hostile browser extension.
