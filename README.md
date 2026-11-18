# LocalMind

A private AI chat that runs entirely in your browser on a **built-in, rule-based assistant**. There is no backend, no API key, no account, and **no model download** - it works the moment the page loads. Nothing is uploaded.

- **Built-in assistant:** natural small talk, on-device memory, language/task detection, and coding scaffolding. Replies come from local rules and templates.
- **UI:** vanilla JS + Vite, markdown and code rendering, streaming with stop/regenerate/copy, modes, dark/light theme, mobile layout.
- **Storage:** chats and settings in IndexedDB. Nothing is uploaded.
- **Memory:** notes you ask it to remember ("remember ...", "forget ..."), kept on-device and carried into every chat. Manage them in Settings.
- **Understanding:** cleans up messy input - smart quotes, zero-width characters, and chat shorthand ("pls", "doesnt", "idk") - while your chat history keeps the original wording and code blocks are left untouched. Vague messages ("it doesn't work") prompt one targeted clarifying question instead of a guess.
- **Offline:** installable PWA. The app shell is cached after the first online visit.

> Honest limit: the built-in assistant uses rules, not a neural network. It can chat, remember notes, and scaffold code, but it cannot reason or write arbitrary answers. That is the tradeoff of running with no model at all.

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

## No model downloads

This build is intentionally model-free. There is no model picker, no download step, and no remote API. Replies are produced by the built-in rule engine (`generateDemo` in `src/engine/demo.js`) with language/task detection from `src/coder/languages.js`. The WebLLM and wllama loaders remain in the source but are not reachable from the UI.

## How it works

```
index.html, src/main.js
        |
        +-- src/app.js              UI orchestration, state, persistence
        +-- src/understand.js       input normalization, shorthand expansion, intent hints
        +-- src/memory.js           on-device memory commands and prompt block
        +-- src/ui/render.js        history, messages, welcome
        +-- src/markdown.js         marked + DOMPurify + safe code blocks
        +-- src/storage/db.js       IndexedDB conversations and settings
        +-- src/engine/device.js    device summary for the status panel
        +-- src/engine/catalog.js   model catalog metadata (dormant)
        +-- src/engine/demo.js      built-in reply engine and streaming
        +-- src/engine/manager.js   generation lifecycle and backend selection
```

The built-in assistant runs on the main thread: no worker, no model, no network. The main thread streams tokens into the chat and handles input.

For a deeper tour, see [docs/architecture.md](docs/architecture.md), [docs/rule-engine.md](docs/rule-engine.md), and [docs/adding-languages.md](docs/adding-languages.md).

## Browsers and devices

The built-in assistant works in any modern browser with no download and no special hardware. It needs no WebGPU, no GPU memory, and no network to reply. Install it as a PWA for offline use.

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
- The production build injects a strict Content-Security-Policy.
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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and run `npm run lint`, `npm test`, and `npm run build` before opening a pull request. Security issues should follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Known limits

- The built-in assistant uses rules and templates: it can chat, remember notes, and scaffold code, but it cannot genuinely reason or write arbitrary answers.
- It has no internet access, no tools, and no retrieval.
- Conversational prompts and local memory shape tone and continuity; they do not add reasoning ability.

## License

MIT. See [LICENSE](LICENSE). No model weights are bundled or downloaded.
