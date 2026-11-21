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

## Assets

Regenerate the screenshots any time the UI changes:

```bash
npm run screenshots   # builds, captures docs/screenshots/, writes network-log.txt
```

That produces:

| File                                 | Use                                          |
| ------------------------------------ | -------------------------------------------- |
| `docs/screenshots/welcome-dark.png`  | Product Hunt thumbnail, README hero          |
| `docs/screenshots/welcome-light.png` | second gallery slot                          |
| `docs/screenshots/chat-dark.png`     | the main "it renders markdown and code" shot |
| `docs/screenshots/chat-light.png`    | light-theme gallery slot                     |
| `docs/screenshots/settings.png`      | the device check and model panel             |
| `docs/screenshots/mobile.png`        | mobile gallery slot                          |
| `docs/screenshots/network-log.txt`   | the proof: three requests, all same-origin   |

The script is also the network proof: it prints every request the app made while
capturing, and fails if any of them is cross-origin. Quote the file when someone
in the comments asks "how do I know it doesn't phone home".

**GIF for Product Hunt.** `ffmpeg` is not installed here, so the animated demo is
the one thing not generated. Record it with any screen recorder: two seconds of
the welcome screen, the FizzBuzz reply streaming, then the DevTools Network tab
with a single document request. Or build one from frames:

```bash
# requires ffmpeg
ffmpeg -framerate 2 -pattern_type glob -i 'docs/screenshots/*.png' -vf scale=1200:-1 demo.gif
```

## Likely questions, and short answers

Answer these honestly and quickly; hedging is what turns an HN thread.

- **"It's not local, it downloads the model."** Correct. The app downloads weights
  from Hugging Face once, then runs offline. The claim is about your prompts and
  documents, not about installation. Offline mode makes the service worker refuse
  every cross-origin request.
- **"Why not use the OpenAI API?"** Because the point is that the text and the
  documents never leave the machine. A frontier model is better at most things;
  this is a different trade.
- **"A 360M model is useless."** For open-ended generation, mostly. For questions
  about a document you just handed it, the retrieval does the heavy lifting, and
  when retrieval is weak it says so.
- **"How is this different from a local Llama GUI?"** It runs in a tab with no
  install, and the interesting part is the retrieval and the encryption, not the
  inference.
- **"What happens if the tab crashes?"** The model is unloaded and the app falls
  back to the rule engine with an explanation; chats are saved continuously to
  IndexedDB.
- **"Is the encryption audited?"** No. It is WebCrypto with documented parameters,
  there is no third-party audit, and documents are not covered yet.
- **"WebGPU in Safari?"** Partially, and iOS caps a tab at roughly 1 GB, so model
  fit is judged against that budget and large models are flagged before download.
- **"Why no sync?"** No backend is the product. Export is a JSON file.
- **"Reranking?"** Deliberately not: a cross-encoder means a second model download
  and per-query latency. Cosine plus BM25 with reciprocal-rank fusion is the
  trade.
- **"Can I use it with VS Code / Ollama?"** Not today. An OpenAI-compatible
  endpoint is documented as declined in `ROADMAP.md`, with the reasons.

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
- [ ] Create the `good first issue` label and file 5–10 of the drafts in
      [docs/good-first-issues.md](good-first-issues.md), so the first contributors
      have somewhere to start.
- [ ] Decide the funding story. `.github/FUNDING.yml` is in place but inert until
      the account is enrolled at github.com/sponsors. The README says plainly that
      there is no funding programme yet; update it in the same change that
      enrols.
- [ ] Check the demo on a phone before posting, including the on-screen keyboard and
      the scroll cue, because that is where a launch thread sends traffic first.

## What not to claim

- Not a replacement for a frontier model.
- Not end-to-end encrypted: the vault protects data at rest, and documents are not
  covered yet.
- Not serverless in the cloud sense; there is no backend at all.
- Not audited. No third-party penetration test has been done.
- Not private against a compromised device or a hostile browser extension.
