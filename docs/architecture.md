# Architecture

LocalMind is a static single-page app. All code runs in the browser tab; there is no backend, API, database server, or account system.

## Runtime at a glance

```
index.html
  -> src/main.js        boot, service-worker registration, fatal-error screen
  -> src/app.js         DOM events, app state, IndexedDB persistence
       |-- src/understand.js      normalization and intent hints
       |-- src/memory.js          explicit memory commands
       |-- src/chat/replies.js    conversational rules
       |-- src/coder/             language/task detection and code recipes
       |-- src/ui/render.js       safe DOM rendering
       |-- src/markdown.js        marked + DOMPurify
       |-- src/engine/manager.js  generation lifecycle and backend selection
       |     `-- src/engine/demo.js  built-in reply engine (pure, testable)
       `-- src/storage/db.js      IndexedDB conversations and settings
```

Dependencies point downward: UI code may import engine and storage modules, but the demo engine must not import DOM or app state. Keeping `src/engine/demo.js` independent is what makes Node unit tests and a future Worker move straightforward.

## Boot sequence

1. `main.js` calls `boot()` from `app.js`.
2. `app.js` caches DOM nodes, binds events, applies the theme, and loads settings and conversation summaries from IndexedDB.
3. Device detection and model selection run for the status panel. This build always selects the built-in assistant.
4. `engine.loadModel({ modelKey: "demo" })` marks the demo backend ready. Nothing is downloaded.
5. The welcome screen or the most recent conversation is rendered.

If boot fails, `main.js` shows a self-contained error overlay with a reload action.

## Message lifecycle

1. The composer calls `handleSend()` and then `sendUserMessage(text)`.
2. `parseMemoryCommand(text)` inspects explicit commands. If one is present, `applyMemoryCommand()` updates the in-memory list and persisted settings, and the outcome is stored for the reply.
3. The user message and a placeholder assistant message are appended to the conversation and saved to IndexedDB.
4. `runGeneration()` builds a bounded context (`maxMessages`, `maxChars`), starts an `AbortController`, and calls `engine.generate()`.
5. `generateDemo()` resolves a reply with `buildDemoReply()`, splits it into word-sized chunks, yields them with a small delay, and emits token usage at the end.
6. `app.js` appends chunks through `streamText()` using `textContent` while streaming. When the stream finishes, the final content is saved and rendered as sanitized markdown.

Stop and regenerate are handled with the run identifier and abort signal. A late chunk from an old run is ignored.

## Data model

IndexedDB database `localmind`, version 1:

| Store           | Key   | Contents                                                                |
| --------------- | ----- | ----------------------------------------------------------------------- |
| `conversations` | `id`  | Title, timestamps, mode, model key, and messages                        |
| `settings`      | `key` | One row per setting key (theme, memory, custom instructions, and so on) |

`settings` rows are merged over `DEFAULT_SETTINGS`, so missing keys get safe defaults. Conversations are sorted by `updatedAt` for the sidebar. "Clear all data" closes and deletes the database, clears caches and web storage, unregisters service workers, and reloads.

## Reply engine

`src/engine/demo.js` contains the model-free backend. It has two seams:

- `buildDemoReply()` is a pure function that resolves the text for one turn. Unit tests target this directly.
- `generateDemo()` is an async generator that streams the resolved text and handles cancellation.

`src/engine/manager.js` owns the state machine (`idle`, `loading`, `ready`, `generating`, `error`), exposes `subscribe()` for the UI, and selects a backend. The WebGPU and WASM branches remain for future optional local models but are not reachable from the current UI.

See [rule-engine.md](rule-engine.md) for the rule order and extension points.

## Rendering and security boundary

- Streaming text is inserted as plain text.
- Completed replies are parsed by marked, sanitized by DOMPurify with a restrictive allowlist, then inserted.
- Links are restricted to `https:`, `http:`, and `mailto:` and open with `rel="noopener noreferrer"`.
- Images and raw HTML are not rendered.
- The production build injects a CSP meta tag. Hosts that can set headers should serve the same policy as a header and add `frame-ancestors 'none'`.

The full threat model is in [SECURITY.md](../SECURITY.md).

## Offline and PWA

`public/sw.js` caches the app shell during install, precaches hashed entry assets by reading `index.html`, and uses:

- network-first for navigation requests, with a cached shell fallback,
- stale-while-revalidate for same-origin assets.

The worker ignores non-GET requests and cross-origin URLs, so model traffic (when a model backend is used) is never intercepted. The Vite build rewrites the cache version on each build, and activation deletes older caches.

## Performance notes

The built-in engine is small and runs on the main thread. That is a deliberate tradeoff: no Worker startup, no message serialization, and no duplicated state. Keep individual rule checks cheap and avoid scanning large inputs repeatedly.

The initial production payload has a **260 kB gzip budget**, enforced by `npm run check:size` in CI. The check measures the entry JavaScript, stylesheet, and HTML referenced by `dist/index.html`. The dormant WebLLM and wllama chunks are loaded on demand and are excluded, but the entry bundle should not grow without a deliberate decision.

If reply rules grow substantially, `src/engine/demo.js` can move behind a Worker without touching UI code, because it has no DOM dependencies. The app already imports the engine through a small API (`loadModel`, `generate`, `stop`, `subscribe`).

## Tests and CI

- Vitest covers pure logic: normalization, memory, reply rules, language detection, and the demo engine.
- Playwright covers the browser flows and asserts that a chat makes no cross-origin requests.
- GitHub Actions runs lint, formatting, unit tests, build, and Playwright on pushes and pull requests.
