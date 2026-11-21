# Roadmap

Status of the larger, "next-gen" ideas. The app is a static, privacy-first client, so each item is judged against three constraints: it must work with no backend, it must not weaken the CSP or the threat model, and it must fit the initial payload budget in `npm run check:size`.

Open an issue or a Discussion before starting anything from **Next** or **Later** so the design can be agreed first.

## Shipped

- **Hybrid retrieval** — cosine ranking plus BM25 term ranking, fused with reciprocal-rank fusion (`src/rag/similarity.ts`).
- **Prompt-injection defense** — excerpts inside an escaped `<context>` block, with explicit rules to ignore instructions inside it (`src/rag/prompt.ts`).
- **Abstain instead of hallucinate** — a confidence gate forces "I cannot find the answer in the provided documents." when retrieval is weak (`src/rag/confidence.ts`).
- **Show your work** — every grounded or abstained reply carries the per-passage semantic score, term coverage, fused rank, and a short preview, expandable under the answer.
- **Long-chat safety** — only the newest 60 messages are rendered; older turns load on request instead of building thousands of nodes.
- **Crash recovery** — a dead inference worker aborts the run, falls back to the built-in assistant, and reloads once after an out-of-memory kill while skipping the model that crashed.
- **Resumable downloads** — community GGUF weights continue with HTTP `Range` requests after an interrupted transfer.
- **Typed worker protocol** — page and worker share one discriminated-union module (`src/engine/worker-protocol.ts`).
- **Local diagnostics** — bounded, opt-in-detail error log with copy/clear, never uploaded.
- **Offline kill switch** — a service worker refuses every cross-origin request, whatever its method, while the switch is armed; state survives reloads and the sidebar shows a badge.
- **CodeQL** — `security-extended` static analysis on pushes, pull requests, and weekly.
- **Release automation** — Conventional Commits enforced by commitlint/husky, changesets version PRs, per-PR preview artifact, TypeDoc API docs, signed build provenance on deploy.
- **License gate before downloads** — every model download that lacks verified terms asks for explicit review and acceptance, remembered per license; the app never guesses a license from a model name (`src/engine/model-licenses.ts`).
- **Privacy policy and architecture whitepaper** — [PRIVACY.md](PRIVACY.md) maps data handling to GDPR obligations with the code that implements each one; [docs/whitepaper.md](docs/whitepaper.md) documents the crypto, storage, worker, and retrieval design and how to verify the claims.
- **Issue triage automation** — stale issue sweeping that exempts security and roadmap labels, plus a first-time contributor welcome pointing at the guides.

## Next

- **Bring your own model (BYOM).** Paste a Hugging Face URL or a GGUF link. Constraints: the CSP allows only Hugging Face hosts, so the UI must validate the host, pin or warn about the revision, probe the size, and reuse the resumable downloader. The license gate already handles models with no verified metadata, so the missing piece is size probing and revision pinning.
- **Verified license metadata at sync time.** The curated list in `src/engine/model-licenses.ts` intentionally covers only a few families, because the WebLLM catalogue ships no license fields. The fix is to read license metadata from upstream model cards during `npm run models:sync` and fail the check when a model has none, rather than inferring anything from a name.
- **Full SHA-256 model verification.** Today the app pins commit URLs, checks the catalogue size, and keeps the validator (ETag) for resumable transfers. A complete content hash needs a streaming digest: WebCrypto has no incremental API, and `crypto.subtle.digest` on a multi-GB blob would exhaust memory on the low-RAM devices this app targets. Tracked as blocked on either a streaming SHA-256 implementation in a Worker or upstream hashes in the catalogue.
- **Plugin SDK / tool calling.** WebLLM already exposes `tools` and `tool_choice`, so the model side exists. What is missing is the safety design: plugins cannot be remote JavaScript under the current CSP, so the first version should be a typed local tool registry executed in a Worker, with the model choosing a tool and its arguments. Start there; a marketplace needs hosting, review, and a CSP story.
- **Speculative decoding.** Not available in the installed WebLLM: there is no `draftModel` or speculative-decoding symbol in its API, and the runtime owns the KV cache and sampling loop. This needs an upstream feature or a fork, not app code.
- **Trusted Types.** The CSP currently forbids `unsafe-eval` and restricts scripts to the origin. `require-trusted-types-for 'script'` needs every `innerHTML` assignment routed through a policy, including DOMPurify and highlight.js output. Doable, but it must land with a browser test proving the sanitizer still runs.
- **WebNN backend.** Transformers.js can target the WebNN execution provider on some builds; WebLLM cannot today. Adding a backend selector means real hardware to test on (NPUs on Apple Silicon, Qualcomm, Intel), so it needs a contributor with that hardware first.
- **SharedArrayBuffer / COOP+COEP.** Multi-threaded WASM needs cross-origin isolation headers. GitHub Pages cannot set response headers, and isolation would also require every model host to serve compatible CORP/CORS headers. Provide opt-in `_headers` files for Netlify and Cloudflare Pages, documented as experimental, rather than enabling it by default.

## Ecosystem integration (out of scope for this repository)

Adding LocalMind as a LangChain.js vector store or LlamaIndex provider, an AI SDK `AIStream` adapter, or a Hugging Face Space means publishing packages under a name this project does not own and opening pull requests in third-party repositories. Those need maintainer accounts and an npm publish token, so they cannot be done from a fork. The browser-compatible building blocks exist and are documented in [docs/whitepaper.md](docs/whitepaper.md):

- `src/rag/store.ts` is already a small, framework-agnostic document store with `add`, `search`, and `delete` semantics that map onto a vector-store interface.
- `src/engine/local.ts` streams `StreamChunk` deltas, which is the shape an `AIStream` adapter needs.

A contributor with publishing access can wrap those without changing the app.

## Later / needs a design

- **Agentic tool calling.** The current CSP has no `unsafe-eval`, and removing that to run model-generated JavaScript would trade a real security property for a demo. A safe version is a whitelisted tool registry (statistics, unit conversion, date math) executed by our own code, with the model selecting a tool and its arguments. Start there, not with `eval`.
- **Vision input.** Requires a vision-capable model in the catalogue (WebLLM's multimodal builds) plus an image pipeline, a memory budget for the image encoder, and an accessible upload UI.
- **Speech input.** whisper.cpp or a Transformers.js Whisper build in a Worker: tens to hundreds of MB of extra download and a second model lifecycle.
- **`@localmind/core`, `@localmind/react`, `@localmind/vue`.** Publishing packages means splitting the app into a framework-agnostic engine plus bindings, renegotiating the size budget, and owning a release process for three artifacts. A monorepo move should happen first.
- **Message virtualization** beyond pagination. Page-based rendering caps DOM size without a virtual-scroller dependency; true windowing only pays off above a few thousand messages.

## Not planned

- Cloud inference, accounts, telemetry, or any server-side component.
- Analytics of any kind, including "anonymous" hardware stats sent off-device.
- Rendering raw HTML from model output.

## Tracking

The board is a GitHub Project with **Now / Next / Later** columns; this file is the source of truth for scope and constraints. To create it, open the repository's **Projects** tab, create a project, and add the items above. Issues labelled `good first issue` are the intended entry point for contributors.
