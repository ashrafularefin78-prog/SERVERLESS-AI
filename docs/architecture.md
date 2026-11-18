# Architecture

LocalMind is a static single-page app. All code runs in the browser tab; there is no backend, API, database server, or account system.

## Runtime at a glance

```
index.html
  -> src/main.ts        boot, service-worker registration, fatal-error screen
  -> src/app.ts         DOM events, app state, IndexedDB persistence
       |-- src/understand.ts      normalization and intent hints
       |-- src/memory.ts          explicit memory commands
       |-- src/guardrails.ts      local PII warning + injection/jailbreak refusal
       |-- src/context.ts         context-window compaction and recap
       |-- src/chat/replies.ts    conversational rules
       |-- src/coder/             language/task detection and code recipes
       |-- src/ui/render.ts       safe DOM rendering
       |-- src/markdown.ts        marked + DOMPurify
       |-- src/engine/manager.ts  generation lifecycle (rules-only)
       |     `-- src/engine/demo.ts  built-in reply engine (pure, testable)
       `-- src/storage/db.ts      IndexedDB conversations and settings
```

Dependencies point downward: UI code may import engine and storage modules, but the demo engine must not import DOM or app state. Keeping `src/engine/demo.ts` independent is what makes Node unit tests and a future Worker move straightforward.

## Boot sequence

1. `main.ts` calls `boot()` from `app.ts`.
2. `app.ts` caches DOM nodes, binds events, applies the theme, and loads settings and conversation summaries from IndexedDB.
3. `engine.init()` marks the built-in engine ready. Nothing is downloaded and no hardware is probed.
4. The welcome screen or the most recent conversation is rendered.

If boot fails, `main.ts` shows a self-contained error overlay with a reload action.

## Message lifecycle

1. The composer calls `handleSend()` and then `sendUserMessage(text)`.
2. `parseMemoryCommand(text)` inspects explicit commands. If one is present, `applyMemoryCommand()` updates the in-memory list and persisted settings, and the outcome is stored for the reply.
3. The user message and a placeholder assistant message are appended to the conversation and saved to IndexedDB.
4. `runGeneration()` builds a bounded context (`maxMessages`, `maxChars`) via `compactHistory()`, starts an `AbortController`, and calls `engine.generate()`. Turns that fall out of the window are not lost silently: an extractive digest of them is carried as a system note and can be recapped on request.
5. `generateDemo()` resolves a reply with `buildDemoReply()`, splits it into word-sized chunks, yields them with a small delay, and emits token usage at the end.
6. `app.ts` appends chunks through `streamText()` using `textContent` while streaming. When the stream finishes, the final content is saved and rendered as sanitized markdown.

Stop and regenerate are handled with the run identifier and abort signal. A late chunk from an old run is ignored. Editing a user message loads it into the composer with a banner; sending truncates the conversation at that message and regenerates from the new text. Edit actions are hidden while a reply is generating.

## Data model

IndexedDB database `localmind`, version 1:

| Store           | Key   | Contents                                                                |
| --------------- | ----- | ----------------------------------------------------------------------- |
| `conversations` | `id`  | Title, timestamps, mode, and messages                                   |
| `settings`      | `key` | One row per setting key (theme, memory, custom instructions, and so on) |

`settings` rows are merged over `DEFAULT_SETTINGS`, so missing keys get safe defaults. Conversations are sorted by `updatedAt` for the sidebar. "Clear all data" closes and deletes the database, clears caches and web storage, unregisters service workers, and reloads.

## Reply engine

`src/engine/demo.ts` contains the model-free backend. It has two seams:

- `buildDemoReply()` is a pure function that resolves the text for one turn. Unit tests target this directly.
- `generateDemo()` is an async generator that streams the resolved text and handles cancellation.

`src/engine/manager.ts` owns the state machine (`idle`, `ready`, `generating`), exposes `subscribe()` for the UI, and streams replies from the rule engine. There are no model backends.

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

The worker ignores non-GET requests and cross-origin URLs. The Vite build rewrites the cache version on each build, and activation deletes older caches.

## Performance notes

The built-in engine is small and runs on the main thread. That is a deliberate tradeoff: no Worker startup, no message serialization, and no duplicated state. Keep individual rule checks cheap and avoid scanning large inputs repeatedly.

The initial production payload has a **260 kB gzip budget**, enforced by `npm run check:size` in CI. The check measures the entry JavaScript, stylesheet, and HTML referenced by `dist/index.html`. The app is model-free, so everything it needs ships in this payload; the entry bundle should not grow without a deliberate decision.

If reply rules grow substantially, `src/engine/demo.ts` can move behind a Worker without touching UI code, because it has no DOM dependencies. The app already imports the engine through a small API (`init`, `generate`, `stop`, `subscribe`).

## TypeScript

The app is written in strict TypeScript (`tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `noEmit`). Vite and Vitest resolve `./x.js` import specifiers to `x.ts`, so import paths keep the `.js` suffix even though the sources are `.ts`. Shared shapes live in `src/types.ts`. `npm run typecheck` runs `tsc --noEmit` and is enforced in CI; ESLint uses `typescript-eslint` for `.ts` files.

Migration is phased. The application surface — boot, state, DOM rendering, markdown, storage, engine, chat rules, memory, understanding, and coder detection (`config`, `understand`, `memory`, `storage/db`, `engine/*`, `chat/replies`, `coder/languages`, `coder/programs`, `coder/highlight`, `coder/grammars`, `markdown`, `ui/render`, `app`, `main`) — is fully typed.

The code-generation cluster under `src/coder/` (`ir.js`, `emit/*`, `recipes/*`, `spec/*`) is still JavaScript, compiled under `allowJs` with `checkJs: false`. It builds a language-neutral node tree (`{ k: ... }`) and renders it through dynamic dispatch (`this[\`s_${node.k}\`]`), so typing it well means a discriminated-union IR with narrowing across every emitter — a deliberate follow-up refactor, not part of this phase. It is covered by unit and browser tests, and its public entry points (`coder/languages.ts`, `coder/programs.ts`) are typed, so the rest of the app interacts with it through a checked boundary.

## Tests and CI

- Vitest covers pure logic: normalization, memory, reply rules, language detection, and the demo engine.
- A golden eval suite (`tests/evals/cases.json` + `evals.test.js`) asserts reply properties, deterministic repeatability (fixed clock), and a per-case latency budget. Run it with `npm run evals`; it also runs inside `npm test`.
- Playwright covers the browser flows and asserts that a chat makes no cross-origin requests.
- GitHub Actions runs typecheck, lint, formatting, unit tests, evals, build, and Playwright on pushes and pull requests.
