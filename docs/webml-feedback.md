# Feedback for the W3C Web Machine Learning Working Group

Observations from shipping a browser-local inference app (LocalMind 1.0.0) to
real users on Chromium, Firefox, and WebKit. Everything below was hit while
building it; nothing is hypothetical, and every item says what the app does today
instead of what it would like to do.

This is offered as input, not as a complaint: the platform made an offline,
private assistant possible at all. Written to be quotable in a working-group
discussion, with reproduction details.

## 1. There is no way to ask "will this model fit" before downloading it

`navigator.deviceMemory` is quantised and capped: it reports `8` for every machine
with 8 GB or more, so a laptop with 8 GB and a workstation with 64 GB are
indistinguishable. `GPUAdapter.limits` describes buffers and workgroups, not
available VRAM: `maxBufferSize` bounds one allocation, not the sum that a model
needs. `navigator.storage.estimate()` reports quota, which is disk, not memory.

Consequence: the app guesses. It refuses models whose estimated requirement is
above a conservative ceiling derived from the quantised memory number, and on iOS
it applies a ~1 GB per-tab budget because Safari kills tabs that exceed it
(`src/engine/device.ts`). A user with a large machine is told a model is "tight"
when it is not.

What would help: an estimate of available memory for GPU-backed work
(`GPUAdapter` memory heaps, or an adapter `memoryBudget` hint), and per-tab memory
pressure signals on all engines, not just Chromium's `performance.measureUserAgentSpecificMemory`.

## 2. Adapter capability is discoverable late and incompletely

`requestAdapter()` can return a useful adapter whose `info` is empty, and the same
device reports different `maxStorageBufferBindingSize` across driver updates. The
app must therefore treat limits as advisory: it reports them in diagnostics
(`src/diagnostics-bundle.ts`) and never derives a hard rule from them.

What would help: a stable, documented subset of `GPUAdapterInfo` fields with
guaranteed non-empty values, or at least a way to distinguish "not exposed" from
"empty string".

## 3. Memory release is the hardest part of the lifecycle

A model that is loaded and idle holds hundreds of megabytes. There is no portable
"release this GPU allocation" call: buffers owned by a runtime cannot be destroyed
by the host page without corrupting the runtime's own state, and
`GPUBuffer.destroy()` on someone else's buffer is exactly that mistake. The app
releases memory by tearing down the worker that owns the engine
(`MLCEngine.unload()` plus worker termination) and treats a page hide as a reason
to unload unless the page is entering the back/forward cache
(`src/engine/memory.ts`).

Consequence: an app must choose between keeping the model warm (memory pressure,
tab kills) and reloading it (seconds of latency, plus re-reading several hundred
megabytes from disk). There is no cheap "hibernate" state.

What would help: a documented lifecycle for model memory that is not "destroy the
worker", and guidance for bfcache interaction.

## 4. Cross-origin isolation is required and unavailable on static hosting

Multi-threaded WASM needs `SharedArrayBuffer`, which needs COOP/COEP headers.
GitHub Pages cannot set response headers, so an app deployed there ships
single-threaded and cannot use `navigator.gpu` in a worker with shared memory
tricks. The app documents this rather than pretending otherwise
(`docs/whitepaper.md`, `docs/ci.md`).

What would help: a per-document opt-in for cross-origin isolation that works
without response headers (`<meta>` cannot express COOP/COEP today), or a
permission-mediated `SharedArrayBuffer` for same-origin workers only.

## 5. CSP and WebGPU/WASM compilation are in tension

Shipping a strict policy (`default-src 'self'; script-src 'self'
'wasm-unsafe-eval'`) is what makes a client-side AI app defensible, and
`wasm-unsafe-eval` is the concession that makes WebGPU-backed WASM possible. That
single keyword also unlocks every WASM compilation path, including ones the app
never uses, so the policy is broader than the capability it grants. Trusted Types
enforcement (`require-trusted-types-for 'script'`) works well and should be
recommended for any app that renders model output; the app's one policy is in
`src/trusted-types.ts`.

What would help: guidance on the minimum CSP for WebGPU compute, and a narrower
mechanism than `wasm-unsafe-eval` (for example, a hash or a designated partition)
so the permission matches the use.

## 6. Cache control for model artifacts is left to each runtime

Model files are multi-gigabyte. Two runtimes, two behaviours, both surprising:

- The WebGPU runtime caches artifacts in OPFS and has no resume: an interrupted
  download restarts from zero.
- The CPU runtime's cache manager deletes partial files on abort.

The app therefore implements its own resumable downloader (HEAD, `Range`,
`If-Range`, ETag, OPFS) and hands the completed blob to the runtime
(`src/engine/resumable-download.ts`). This works, and it exists only because the
platform offers no shared primitive.

What would help: a standard, resumable artifact cache for ML models, or explicit
guidance that implementations must expose one. Content-addressed URLs (CIDs or
digests) in model metadata would let a cache verify bytes, which brings us to:

## 7. There is no standard model manifest with licence and integrity metadata

Model catalogues are JSON in each runtime's own format. They carry no licence
field, no content digest, and no size, so an app that wants to gate downloads on
licence review cannot: LocalMind keeps a curated table
(`src/engine/model-license-table.json`), reports every unverified model as
unknown with a link to the model card, and refuses to infer a licence from a name
(`src/engine/model-licenses.ts`). Of 169 catalogue entries, 38 are verifiable and
131 are not.

Streaming SHA-256 is the other half: WebCrypto has no incremental digest, and
`crypto.subtle.digest` on a multi-gigabyte blob exhausts memory on the low-RAM
devices this app targets. A model that arrives over the network today is verified
by size and pinned commit path, not by content.

What would help: a manifest schema including `license`, `licenseUrl`, `bytes`,
`sha256`, and `contextWindow`; and a streaming digest in WebCrypto.

## 8. Tokenizer and context metadata are not standardised

The app must guess a context window per model and approximate tokens at three
characters each (`contextLimitsFor` in `src/config.ts`) because the runtime does
not expose the model's context size or a tokenizer to count with. Truncation that
is a little too aggressive is invisible; truncation that is too generous becomes
a runtime error mid-reply.

What would help: part of the model manifest (§7) - context size and tokenizer
identity - and a tokenizer API in the platform, or at least a documented
expectation that runtimes expose `contextWindow`.

## 9. Backend selection is opaque to the page

There is no portable way to ask "is this model running on the GPU, the NPU, or the
CPU", or to prefer one. WebNN exists in some engines for some backends; WebGPU
exists in others; a browser may silently fall back. The app reports what it
detects and does not claim a backend it cannot verify.

What would help: a capability query that answers "which backends are available for
this model class", so an app can recommend a model that will actually be
accelerated instead of one that will crawl.

## 10. Testing without hardware is the adoption barrier

Continuous integration runners have no GPU, and headless Chromium's WebGPU support
is not representative. The project cannot run a model-quality evaluation in CI, so
the gate is "armed but inactive" and the recording is committed from a real
machine (`tests/evals/model/`). Contributors without a GPU cannot verify the
feature they changed.

What would help: a software WebGPU adapter with documented determinism (even at
low speed) suitable for CI, or a conformance profile that runtimes can be tested
against headlessly.

## Summary of asks

| #   | Ask                                                     | Blocks today                        |
| --- | ------------------------------------------------------- | ----------------------------------- |
| 1   | Memory-fit signal before download                       | model recommendations               |
| 2   | Non-empty, stable adapter info                          | diagnostics, capability rules       |
| 3   | Documented model-memory lifecycle                       | warmth vs tab-kill trade-off        |
| 4   | Cross-origin isolation without headers                  | multi-threaded WASM on static hosts |
| 5   | Narrower alternative to `wasm-unsafe-eval`              | stricter CSP                        |
| 6   | Resumable artifact cache                                | multi-GB downloads                  |
| 7   | Model manifest with licence + digest; streaming SHA-256 | licence gating, integrity           |
| 8   | Context/tokenizer metadata                              | prompt budgeting                    |
| 9   | Backend availability query                              | acceleration-aware recommendations  |
| 10  | CI-suitable WebGPU adapter                              | testing model features              |

Maintainers of similar projects are welcome to reuse this list; it is written to
be quoted.
