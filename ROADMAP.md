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
- **Trusted Types** — `require-trusted-types-for 'script'` is enforced, every HTML sink goes through one sanitizing policy (`src/trusted-types.ts`), and a browser test fails if rendering or chatting raises a violation.
- **Read-position-aware auto-scroll** — the view follows a reply only while the reader is at the end, pauses the moment they scroll away, marks new text with a "scroll to bottom" cue, and never yanks them back when the reply finishes (`tests/e2e/scroll.spec.js`).
- **Frame-coalesced streaming** — deltas are painted once per animation frame instead of once per chunk (`queueStreamPaint` in `src/app.ts`).
- **GPU memory hand-back** — the model is unloaded after ten idle minutes, on `pagehide` when the page is not going into the back/forward cache, and before any model switch; the next message reloads the cached weights (`src/engine/memory.ts`).
- **iOS tab budget** — iOS reports no `deviceMemory`, so model fit is judged against Safari's roughly 1 GB per-tab limit instead (`assessModelFit` in `src/engine/device.ts`).
- **Cloud dev environment** — [.devcontainer](.devcontainer/README.md) gives a Codespace with Node 22 and Chromium, so onboarding needs no local install.
- **RAG load guard** — a 50,000-word document is chunked and ranked in bounded time, asserted by `tests/unit/rag-load.test.js`.
- **Quantized KV cache** — community GGUF models load with an `q8_0` key/value cache and flash attention, roughly halving the working memory of a long conversation, with an automatic retry on the runtime's defaults if the build rejects them (`src/engine/gguf-cache.ts`).
- **Vulnerability response policy** — reporting channel, severity-based targets, and an embargo policy in `SECURITY.md`; OpenSSF badge evidence collected in [docs/openssf-badge.md](docs/openssf-badge.md).

## Next

- **WebKit/Safari pass on the browser suite.** `PLAYWRIGHT_BROWSERS=firefox,webkit npm run test:e2e` runs the suite outside Chromium. Firefox is green (105 passed, 3 skipped because wllama's worker download cannot be intercepted there). WebKit still fails two specs, both unconfirmed as product bugs: `.model-option` never becomes "stable" for Playwright's click, and `#scroll-bottom` stays hidden after a scripted `scrollTop` change. Re-measure on a macOS WebKit build with a real trackpad before changing either behaviour, and note that one WebKit accessibility audit reported `#status-label` at `--text` on a light `--sidebar` background although the same light theme passes in Chromium.
- **Bring your own model (BYOM).** Paste a Hugging Face URL or a GGUF link. Constraints: the CSP allows only Hugging Face hosts, so the UI must validate the host, pin or warn about the revision, probe the size, and reuse the resumable downloader. The license gate already handles models with no verified metadata, so the missing piece is size probing and revision pinning.
- **Verified license metadata at sync time.** The curated list in `src/engine/model-licenses.ts` intentionally covers only a few families, because the WebLLM catalogue ships no license fields. The fix is to read license metadata from upstream model cards during `npm run models:sync` and fail the check when a model has none, rather than inferring anything from a name.
- **Full SHA-256 model verification.** Today the app pins commit URLs, checks the catalogue size, and keeps the validator (ETag) for resumable transfers. A complete content hash needs a streaming digest: WebCrypto has no incremental API, and `crypto.subtle.digest` on a multi-GB blob would exhaust memory on the low-RAM devices this app targets. Tracked as blocked on either a streaming SHA-256 implementation in a Worker or upstream hashes in the catalogue.
- **Plugin SDK / tool calling.** WebLLM already exposes `tools` and `tool_choice`, so the model side exists. What is missing is the safety design: plugins cannot be remote JavaScript under the current CSP, so the first version should be a typed local tool registry executed in a Worker, with the model choosing a tool and its arguments. Start there; a marketplace needs hosting, review, and a CSP story.
- **Speculative decoding.** Not available in the installed WebLLM: there is no `draftModel` or speculative-decoding symbol in its API, and the runtime owns the KV cache and sampling loop. This needs an upstream feature or a fork, not app code.
- **WebNN backend.** Transformers.js can target the WebNN execution provider on some builds; WebLLM cannot today. Adding a backend selector means real hardware to test on (NPUs on Apple Silicon, Qualcomm, Intel), so it needs a contributor with that hardware first.
- **SharedArrayBuffer / COOP+COEP.** Multi-threaded WASM needs cross-origin isolation headers. GitHub Pages cannot set response headers, and isolation would also require every model host to serve compatible CORP/CORS headers. Provide opt-in `_headers` files for Netlify and Cloudflare Pages, documented as experimental, rather than enabling it by default.

## Declined with reasons

Each of these was considered for a "1.0 endgame" pass and rejected. They are not
backlog items; they are decisions, with the constraint that decides them named.

- **Speculative decoding.** Needs a draft model and a verification loop inside the
  runtime. The installed WebLLM exposes no `draftModel` or speculative-decoding
  API, and wllama runs llama.cpp's single-model decode loop. Implementing it in app
  code would mean forking the runtime, not calling it.
- **Mixture-of-Experts routing by classifier.** Routing a prompt to one of four
  _separate_ models is not MoE, and it increases memory: four experts resident
  means four weight sets and four KV caches. Real MoE needs a model whose
  architecture has sparse experts, where the runtime loads the union of weights
  once. Nothing in the current catalogue is such a model, and low-RAM devices are
  the target.
- **Post-quantum cryptography (ML-KEM).** There is nothing to replace. The vault
  derives an AES-256-GCM key from the user's passphrase with PBKDF2; there is no
  RSA, no key exchange, and no long-term key that a quantum computer could break.
  Grover's algorithm halves symmetric security, which leaves AES-256 as strong as
  AES-128 — not a reason to add a WebAssembly dependency. A lattice KEM would only
  matter for a future feature that transmits or shares keys between devices.
- **Sandboxed tool execution (`<iframe sandbox>`).** There are no tools to sandbox.
  Agentic tools are already deferred above because model-selected tool calls are a
  prompt-injection amplifier; building the sandbox before the tools would be code
  with no caller. When tools do arrive, the iframe plus `postMessage` bridge is the
  design to build, not `eval`.
- **MCP client.** Model Context Protocol servers are local processes reached over
  stdio or a local socket. A static page cannot spawn a process, the CSP allows no
  such origin, and every MCP server is by definition an untrusted tool surface —
  the same reason tool execution is deferred. The honest version of this feature is
  a desktop wrapper with a permission UI, which is a different product.
- **OpenAI-compatible endpoint.** A service worker can intercept same-origin
  requests, so `POST /v1/chat/completions` on the app's own origin is technically
  reachable. It is declined for three reasons: any page that can reach the origin
  could drive the user's GPU (cross-origin requires CORS plus a per-session bearer
  token, and a drive-by page can still burn the device's battery), a browser tab's
  endpoint disappears when the tab sleeps or navigates, so "local API" clients would
  fail unpredictably, and infinite-context abuse of an endpoint with no rate limit
  is a denial-of-service on the user's own machine. A real implementation needs a
  desktop shell, not a static site.
- **OpenSSF badge registration.** Applying needs an account and a project entry on
  bestpractices.dev, which cannot be created from a repository. The evidence is
  [collected](docs/openssf-badge.md) so applying is mechanical.
- **Foundation transition (SFC, Apache).** A governance decision for whoever holds
  the trademark and the repository, not a code change. It also needs sustained
  contribution volume that this project does not have yet.

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
- **KaTeX / MathJax.** Self-hosted KaTeX is roughly 280 kB of script plus ~1 MB of fonts, which is more than the entire current initial payload budget (`npm run check:size`). It needs its own lazy chunk and a font-subsetting story before it can ship; until then formulas render as code spans.
- **Storybook.** The chat surface depends on a live conversation, engine state, and IndexedDB, so isolating components means building fixtures for all three. The browser suite covers the same ground end to end (`tests/e2e/`), including axe accessibility checks, so the cost is not justified yet.
- **Pixel screenshot baselines.** Playwright snapshots compare against images rendered on the CI runner's font stack; committing baselines generated on another OS yields constant false failures. Layout regressions are instead covered by explicit assertions on computed sizes and contrast (`tests/e2e/design.spec.js`).
- **Publishing to npm on tag.** Changesets already automate `CHANGELOG.md` and version PRs; publishing needs an npm token and an owned package name, which this repository does not have.
- **`buffer.destroy()` for WebGPU objects.** WebLLM owns its `GPUBuffer` and `GPUTexture` instances; destroying them from app code would corrupt the runtime. The supported release paths are `MLCEngine.unload()` and terminating the worker, both of which `src/engine/local.ts` performs.
- **Message virtualization** beyond pagination. Page-based rendering caps DOM size without a virtual-scroller dependency; true windowing only pays off above a few thousand messages.

## Not planned

- Cloud inference, accounts, telemetry, or any server-side component.
- Analytics of any kind, including "anonymous" hardware stats sent off-device.
- Rendering raw HTML from model output.

## Tracking

The board is a GitHub Project with **Now / Next / Later** columns; this file is the source of truth for scope and constraints. To create it, open the repository's **Projects** tab, create a project, and add the items above. Issues labelled `good first issue` are the intended entry point for contributors.
