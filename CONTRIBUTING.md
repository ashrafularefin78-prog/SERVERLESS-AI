# Contributing to LocalMind

Thanks for helping improve LocalMind. This project is a static, privacy-first browser app with no backend. Contributions should keep it that way unless a change is discussed first.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer

## Setup

```bash
git clone <your-fork-url>
cd localmind
npm ci
npm run dev
```

Open the printed URL. The built-in assistant needs no model, API key, or network access.

## Before opening a pull request

Run the same checks as CI:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

Browser tests are recommended for UI changes:

```bash
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:e2e:preview
```

The preview suite exercises the production CSP, service worker, and hashed assets.

If you change model defaults, system prompts, or generation settings, also run the model quality replay:

```bash
npm run evals:model
```

It replays `tests/evals/model/recorded.json` and fails on property failures or drift from `baseline.json`. On a machine with WebGPU, capture a new recording and baseline with `npm run evals:model:record`; commit both files with the prompt or model change that motivated them.

If formatting fails, run `npm run format` and review the diff.

## Project layout

| Path                        | Responsibility                                                    |
| --------------------------- | ----------------------------------------------------------------- |
| `src/app.ts`                | UI orchestration, state, and persistence                          |
| `src/understand.ts`         | Unicode cleanup, shorthand expansion, intent hints                |
| `src/memory.ts`             | Explicit memory commands and prompt blocks                        |
| `src/engine/demo.ts`        | Built-in reply engine and streaming                               |
| `src/engine/manager.ts`     | Generation lifecycle and backend selection                        |
| `src/engine/local.ts`       | Optional local-model worker and streaming                         |
| `src/chat/replies.ts`       | Conversational reply rules                                        |
| `src/rag/`                  | On-device document chunking, embeddings, retrieval, and grounding |
| `src/coder/`                | Language detection, task detection, and code recipes              |
| `src/storage/db.ts`         | IndexedDB conversations, settings, and knowledge documents        |
| `tests/unit/`, `tests/e2e/` | Unit/evaluation and browser tests                                 |
| `public/sw.js`              | Offline app-shell caching                                         |

For details, read [docs/architecture.md](docs/architecture.md) and [docs/rule-engine.md](docs/rule-engine.md).

## Adding a rule

1. Choose the narrowest resolver in `src/chat/replies.js` (identity, emotion, planning, and so on).
2. Match on normalized text, not raw keystrokes. Prefer word boundaries and explicit alternatives.
3. Keep replies deterministic where possible. Use the conversation seed only for harmless variation.
4. Add a unit test in `tests/unit/replies.test.js` or `tests/unit/demo-engine.test.js`.
5. Run `npm test`.

Rules must not fetch anything, read browser data, or execute generated text.

## Adding language support

See [docs/adding-languages.md](docs/adding-languages.md) for the metadata fields, detection signals, and test checklist.

## Code style

- The application uses strict TypeScript. Keep new app code in `.ts` files and run `npm run typecheck`; `src/coder/` still contains a documented JavaScript code-generation cluster.
- ESLint and Prettier are enforced. Formatting is not a review topic.
- Prefer small pure functions. Keep DOM access in `src/app.js` and `src/ui/`.
- Use JSDoc for exported functions in core modules.
- Do not add runtime dependencies without a clear need and a security review.
- Do not add analytics, telemetry, remote fonts, CDNs, or third-party scripts.

## Tests

- Unit tests use Vitest and live in `tests/unit/`.
- End-to-end tests use Playwright and live in `tests/e2e/`.
- Test behavior, not implementation details.
- A bug fix should come with a regression test when practical.

## Commits and pull requests

- Keep each pull request focused.
- Describe the user-visible change, the approach, and how you tested it.
- Link the issue it resolves.
- Update `README.md`, `SECURITY.md`, or docs when behavior or risk changes.
- Do not include `dist/`, coverage output, or `node_modules/` in commits.

## Security and privacy

- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Never add code that uploads prompts, chat history, or memory notes.
- Treat model and rule output as untrusted. Render it through the existing markdown and DOMPurify path.
- If a change adds network access or a new trust boundary, update the threat model in the same pull request.

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
