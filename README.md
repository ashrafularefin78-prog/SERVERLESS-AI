# LocalMind

A private AI chat that runs entirely in your browser. It ships with a **built-in rule assistant** that answers instantly and offline, and can optionally run a **real neural model on your GPU** through WebGPU. There is no backend, no API key, and no account. Nothing is uploaded.

- **Built-in assistant:** natural small talk, on-device memory, language/task detection, and coding scaffolding. Replies come from local rules and templates. No download needed.
- **On-device models (optional):** one click downloads a quantised 0.3B-1B chat model, verifies and caches it in the browser's private storage (OPFS), and runs inference in a Web Worker on WebGPU. Weights are fetched once from Hugging Face and never leave the device. Delete them at any time in Settings.
- **UI:** vanilla JS + Vite, markdown and code rendering, streaming with stop/regenerate/copy, modes, dark/light theme, mobile layout.
- **Storage:** chats and settings in IndexedDB. Nothing is uploaded.
- **Memory:** notes you ask it to remember ("remember ...", "forget ..."), kept on-device and carried into every chat. Manage them in Settings.
- **Understanding:** cleans up messy input - smart quotes, zero-width characters, and chat shorthand ("pls", "doesnt", "idk") - while your chat history keeps the original wording and code blocks are left untouched. Vague messages ("it doesn't work") prompt one targeted clarifying question instead of a guess.
- **Offline:** installable PWA. The app shell is cached after the first online visit.

> Honest limit: the built-in assistant uses rules, not a neural network. It can chat, remember notes, and scaffold code, but it cannot reason or write arbitrary answers. That is what the optional on-device model is for; small local models are useful, not frontier-grade.

## What "serverless" means here

LocalMind is **serverless in the "no backend" sense**, not in the cloud-functions sense. It is a static client-side app: HTML, CSS, JavaScript, and a service worker. There is no AWS Lambda, Cloudflare Worker, database, or API to deploy. Any static file host can serve it.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL. It works immediately - there is nothing to download or configure.

```bash
npm run build
npm run preview
```

The production build is a static site in `dist/`. Serve it from any static host.

## On-device models (optional)

The built-in engine is model-free and answers immediately. If you want neural replies, open Settings, pick a model, and press **Download and load**:

| Model        | Size (about) | Notes                                       |
| ------------ | ------------ | ------------------------------------------- |
| SmolLM2 360M | 260 MB       | Fastest, fine for short chat                |
| Qwen2.5 0.5B | 340 MB       | Balanced default                            |
| Llama 3.2 1B | 690 MB       | Best quality here, needs a more capable GPU |

How the model path is built:

- **WebLLM** (`@mlc-ai/web-llm`) compiles the model with WebGPU. Model records, compatible binaries and integrity data come from its pinned `prebuiltAppConfig` rather than being hand-copied.
- **Integrity:** before an artifact is cached, WebLLM verifies it against the pinned SHA-256 SRI hash for that file. A hash mismatch aborts the load instead of running unexpected weights or code. Downloads are origin-locked to `huggingface.co`, its CDN subdomains and the model-library host in the CSP.
- **Web Worker:** the engine lives in `src/engine/model-worker.ts`, so tokenisation, shader compilation and decoding never block the UI. The page talks to it through `WebWorkerMLCEngine`.
- **OPFS storage:** weights are cached in the Origin Private File System (`cacheBackend: "opfs"`), not IndexedDB. `navigator.storage.persist()` is requested before a download so the browser is less likely to evict them.
- **No precache:** the service worker never touches model weights. They are fetched only after you press the button, and only from the pinned model hosts.
- **Deletion:** Settings can remove a model's weights, config and compiled library in one action, freeing GPU and disk.

Without a downloaded model everything still works offline; replies come from `generateDemo` in `src/engine/demo.ts`.

## How it works

```
index.html, src/main.ts
        |
        +-- src/app.ts              UI orchestration, state, persistence
        +-- src/understand.ts       input normalization, shorthand expansion, intent hints
        +-- src/memory.ts           on-device memory commands and prompt block
        +-- src/ui/render.ts        history, messages, welcome
        +-- src/markdown.ts         marked + DOMPurify + safe code blocks
        +-- src/storage/db.ts       IndexedDB conversations and settings
        +-- src/engine/demo.ts      built-in reply engine and streaming
        +-- src/engine/models.ts    on-device model catalogue and cache config
        +-- src/engine/local.ts     WebGPU session: cache, worker, streaming
        +-- src/engine/model-worker.ts  WebLLM engine inside a Worker
        +-- src/engine/manager.ts   generation lifecycle for both backends
```

The rule engine runs on the main thread; an on-device model runs in a Worker and streams tokens back over `postMessage`. Either way the UI receives the same chunk stream.

For a deeper tour, see [docs/architecture.md](docs/architecture.md), [docs/rule-engine.md](docs/rule-engine.md), and [docs/adding-languages.md](docs/adding-languages.md).

## Browsers and devices

The built-in assistant works in any modern browser with no download and no special hardware. On-device models need WebGPU (current Chrome, Edge, or Safari) and enough GPU memory for the model you pick; Settings explains when a device cannot run them and keeps the built-in engine available. Install it as a PWA for offline use.

## Deploy

The build uses relative URLs (`base: "./"`), so it works from a subdirectory such as a GitHub Pages project site.

### GitHub Pages

1. Push the repository to GitHub.
2. In **Settings > Pages**, set the source to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` builds and deploys `dist/`.

If the deploy fails with `Get Pages site failed ... Error: Not Found`, Pages has not been enabled for the repository yet. Complete step 2 and re-run the workflow. The `enablement: true` option on `actions/configure-pages` cannot use the default `GITHUB_TOKEN`; it requires a PAT or GitHub App token. Forks need the same one-time setting.

### Other static hosts

Upload `dist/` to Cloudflare Pages, Netlify, Vercel static hosting, S3, or any web server. No server-side code is required. For the strongest CSP, serve the policy as a response header; the app ships a meta-tag CSP for hosts that cannot set headers.

## Security and privacy

Read [SECURITY.md](SECURITY.md) for the threat model and residual risks.

In short:

- Prompt text never leaves the tab. There is no analytics, telemetry, or remote API.
- Model output is sanitized with DOMPurify before insertion; links are restricted to `http(s)` and `mailto`.
- Dependencies are bundled locally and pinned. There are no third-party scripts at runtime.
- The production build injects a strict Content-Security-Policy. Its network allowlist covers only the model hosts (Hugging Face and the model-library host), and those requests happen only when you download a model.
- "Clear all data" removes chats, settings, caches, service workers, and local storage.

Do not enter passwords, private keys, or other secrets. Built-in replies can repeat text from your context, and any browser profile can be compromised by malware or a malicious extension.

## Scripts

| Command                    | Purpose                            |
| -------------------------- | ---------------------------------- |
| `npm run dev`              | Vite dev server with HMR           |
| `npm run build`            | Production build in `dist/`        |
| `npm run preview`          | Serve the production build locally |
| `npm test`                 | Run unit tests once (Vitest)       |
| `npm run test:watch`       | Run unit tests in watch mode       |
| `npm run test:coverage`    | Unit tests with a coverage report  |
| `npm run test:e2e`         | Playwright browser tests           |
| `npm run test:e2e:preview` | Playwright tests against `dist/`   |
| `npm run check:size`       | Check the initial gzip budget      |
| `npm run lint`             | ESLint checks                      |
| `npm run format:check`     | Verify Prettier formatting         |
| `npm run format`           | Apply Prettier formatting          |

## Testing and quality

The rule engine is the product, so it is covered by unit tests in `tests/unit/`:

- input normalization, shorthand expansion, and intent detection (`understand.js`)
- memory command parsing, limits, and prompt building (`memory.js`)
- reply rules, safety replies, math, and code scaffolding (`chat/replies.js`)
- language and task detection (`coder/languages.js`)
- the demo engine, including streaming and cancellation (`engine/demo.js`)

Playwright tests in `tests/e2e/` cover the critical browser flows: sending a message, receiving a streamed reply, memory commands, clearing local data, and making no cross-origin requests. They run against both the dev server and the production build (`npm run build && npm run test:e2e:preview`). CI runs lint, formatting, unit tests with coverage thresholds, `npm audit --omit=dev`, the production build, a bundle-size budget, and both browser test modes on every push and pull request.

### Model quality evals

Rule-engine evals (`tests/evals/cases.json`) assert exact properties of deterministic code. Model output is different: it varies run to run, so the model path uses **property-based golden cases** (`tests/evals/model/cases.json`) instead of string equality. Each case checks lengths, language, formatting, arithmetic, and refusal behaviour that should survive a prompt, model, or quantisation change.

- `npm run evals:model:record` drives the real WebGPU engine through Playwright, sends every golden prompt in a fresh chat, and writes `tests/evals/model/recorded.json` plus a baseline (model id, pass rate, mean/p95 latency, mean reply length, per-case results). It downloads the model once into a persistent profile under `.cache/`.
- `npm run evals:model` replays the recording with no GPU and no network. It fails on a property failure, a case that flipped from pass to fail, a lower pass rate, a p95 latency regression beyond 1.5x, replies longer than 1.4x, or a model id that changed without re-recording.
- CI runs the replay. Until a recording exists it prints that the gate is armed but inactive and exits 0, so the pipeline stays honest instead of pretending to test a model it never ran.

The harness itself is covered by unit tests (`tests/unit/model-eval.test.js`), including the regression gate.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and run `npm run lint`, `npm test`, and `npm run build` before opening a pull request. Security issues should follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Known limits

- The built-in assistant uses rules and templates: it can chat, remember notes, and scaffold code, but it cannot genuinely reason or write arbitrary answers.
- On-device models change that, but a 0.3B-1B quantised model is still small: expect uneven factual accuracy, weaker reasoning, and short context. It is a private local assistant, not a frontier model.
- WebGPU support and GPU memory determine which models run. Settings reports the reason when a device cannot run them.
- There is no internet access at reply time, no tools, and no retrieval.
- Conversational prompts and local memory shape tone and continuity; they do not add reasoning ability.

## License

MIT. See [LICENSE](LICENSE). No model weights are bundled with the app; optional weights are downloaded from Hugging Face only when you ask for a model.
