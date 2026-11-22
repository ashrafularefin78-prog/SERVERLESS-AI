# Maintaining LocalMind

LocalMind is a static, privacy-first browser app: no backend, no accounts, no
telemetry, no third-party runtime scripts. Anything that breaks one of those
promises is a regression, not a feature request. This file is the hand-off
document: what to run, how a release happens, how the model list is refreshed,
and which decisions are load-bearing.

Read [CONTRIBUTING.md](CONTRIBUTING.md) first for the code conventions,
[PRIVACY.md](PRIVACY.md) for the storage contract, and
[docs/architecture.md](docs/architecture.md) for how the pieces fit.

## 1. What every change must keep true

These are enforced by tests or budgets rather than review notes:

| Promise                                                     | Where it is enforced                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| No network request unless the user asked for one            | `tests/e2e/app.spec.js` ("no outbound requests"), CSP `connect-src` in `vite.config.js`                          |
| No chat, prompt, or document text leaves the device         | `tests/e2e/app.spec.js` (bug report and diagnostics bundle assertions)                                           |
| CSP stays `default-src 'self'` with `wasm-unsafe-eval` only | `vite.config.js`, `docs/whitepaper.md`                                                                           |
| Trusted Types stay enforced with one policy                 | `src/trusted-types.ts`, `tests/e2e/trusted-types.spec.js`                                                        |
| Initial payload stays under 260 kB gzip                     | `npm run check:size`, `scripts/check-size.mjs`                                                                   |
| A locked vault never writes plaintext                       | `tests/e2e/app.spec.js` ("locking during a slow reply never writes the reply in the clear"), `src/storage/db.ts` |
| Unit coverage does not fall                                 | `npm run test:coverage` thresholds in `vitest.config.js`                                                         |
| Workflows are parseable, pinned, and startable              | `npm run check:workflows`, `tests/unit/workflows.test.js`                                                        |

## 2. The rule engine is not dead code

`src/chat/replies.ts` (the built-in assistant) is the default experience: it runs
with zero download, zero GPU, and works offline. It is also the fallback when a
model fails to load, is released for memory, or never fit the device. Do not
delete it as "legacy". If you change the fallback wording, run
`tests/unit/replies.test.js` and `npm run evals` — both assert that it stays
honest rather than pretending to know things.

Unverified licences, unlimited downloads, and silent uploads are the three
things the app refuses to do; the code for each is small and should stay small.

## 3. Release checklist

Versions come from changesets, so `main` is never rewritten.

```bash
npm ci
npm run lint && npm run typecheck && npm run format:check
npm run test:coverage        # thresholds must pass, not be lowered
npm run evals && npm run evals:model
npm run check:workflows
npm run build && npm run check:size
PLAYWRIGHT_PREVIEW=1 npx playwright test          # production CSP + service worker
PLAYWRIGHT_BROWSERS=firefox PLAYWRIGHT_PREVIEW=1 npx playwright test
npm run models:licenses      # read the unknown count before you ship a catalogue
```

Then:

1. `npm run changeset` — describe the change for the user, pick patch/minor.
2. Merge the release pull request that `changesets/action` opens; it runs
   `npm run version`, writes `CHANGELOG.md`, and bumps `package.json`.
3. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
4. Create the GitHub Release from that tag and paste the matching
   `CHANGELOG.md` section. Attach nothing that is already in the repo.
5. Confirm the deploy: `.github/workflows/deploy.yml` publishes `dist/` to
   GitHub Pages, and `Source maps`/SBOM artifacts land on the run page.

`docs/release-notes-v1.0.0.md` is the body used for the 1.0.0 release; copy the
pattern from it for later versions.

### Rolling back

A bad deploy is fixed by reverting the commit on `main` and letting Pages
redeploy; the service worker keeps the shell in a versioned cache, so a user
receives the old shell until the new one activates. Because hashed assets are
content-addressed, an old HTML page never loads new JavaScript by accident.

## 4. Updating the model catalogue

`src/engine/community-generated.ts` is **generated**: `npm run models:sync` runs
in `predev` and `prebuild`, so do not hand-edit it.

- **Featured builds** live in `src/engine/community-models.ts` and are curated by
  hand: a stable commit-pinned URL, a size, and a note.
- **Licences** live in `src/engine/model-license-table.json`. Only add an entry
  when you have read the model card. Never infer a licence from a name —
  `licenseFor()` deliberately returns `unknown` with `requiresAcceptance: true`
  and links the model card, and `npm run models:licenses` reports the count of
  unverified models so the gap is visible.
- After a sync, run `npm run models:licenses`, `npm run models:ai-bom`, and
  `npm run check:size`. A new catalogue entry costs bundle size; a large jump
  means the filter in `scripts/sync-model-catalogue.mjs` changed behaviour.
- Changing the default model (`DEFAULT_MODEL_ID` in `src/engine/models.ts`)
  requires a recorded evaluation: `npm run evals:model:record` on a machine with
  WebGPU, then commit `tests/evals/model/recorded.json`. Without hardware, keep
  the default and say so in the pull request.

## 5. Architecture decisions you can break by accident

Short records; each is one paragraph because each has one reason.

- **Static hosting, no backend.** GitHub Pages cannot set response headers, so
  the CSP ships as a `<meta>` tag and there is no COOP/COEP. That rules out
  `SharedArrayBuffer` and multi-threaded WASM; single-threaded is the trade for
  "open a URL and it works".
- **`wasm-unsafe-eval` is required and is the only script concession.** The
  inference runtime compiles WebAssembly at runtime. Adding `unsafe-eval`, or a
  CDN origin, would undo the isolation the policy provides.
- **Vault compatibility is append-only.** Existing vaults are v1: 310,000
  PBKDF2-SHA-256 iterations, no AAD. New vaults are v2: 600,000 iterations with
  record-bound AAD and NFKC-normalised passphrases. v1 is re-wrapped on unlock,
  never rejected. Do not delete `LEGACY_KEY_DERIVATION` or
  `migrateVaultRecords` (`src/crypto.ts`, `src/storage/db.ts`); users still hold
  v1 data.
- **Storage fails closed.** With a vault present and no key, `saveConversation`
  throws. Do not add a plaintext fallback "to keep the app working" — that was a
  real bug (`27953fb`), caught by an e2e test that hides the tab mid-reply.
- **Encrypt before opening the IndexedDB transaction.** Awaiting WebCrypto inside
  a live transaction lets the transaction auto-close in some engines.
- **Never `buffer.destroy()` a WebGPU object.** WebLLM owns those buffers;
  destroying them corrupts its state. Release memory with `MLCEngine.unload()`
  and worker termination (`src/engine/memory.ts`, `src/engine/local.ts`).
- **Auto-scroll follows direction, not flags.** `BOTTOM_SLACK`/`STICK_SLACK` in
  `src/app.ts` decide intent from geometry; a reply finishing does not yank the
  reader to the bottom.
- **Retrieval abstains.** Below the confidence gate (`src/rag/confidence.ts`) the
  app answers "not in your documents" instead of letting the model invent text
  from a weak match.
- **Documents and vectors are not vault-encrypted.** This is documented in
  `PRIVACY.md` as a known limit, not an oversight; the knowledge base lives in a
  separate IndexedDB store and is cleared explicitly.
- **Local-only observability.** There is no crash reporting. Diagnostics live in
  session storage, are capped, and leave the device only when a user copies or
  exports them (`src/diagnostics.ts`, `src/diagnostics-bundle.ts`).

Fuller background: [docs/whitepaper.md](docs/whitepaper.md) (threat model),
[docs/architecture.md](docs/architecture.md) (module map),
[docs/rule-engine.md](docs/rule-engine.md) (fallback behaviour).

## 6. Benchmarking and platform feedback

`npm run bench` measures time to first token and tokens per second on the current
machine (see `bench/README.md`). It exists so a user can tell whether their device
is usable before downloading a model, and so a performance regression has a number
rather than an impression. Results are per-machine and stay out of git.

`docs/webml-feedback.md` is the running list of platform gaps found while building
this (memory-fit signals, adapter info, artifact caching, model manifests, CSP for
WASM). Add to it when you hit a new one; it is written to be quoted to the W3C Web
Machine Learning working group, and every item names the code that had to work
around it.

## 7. Where to look when something breaks

| Symptom                             | First place to look                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| Blank reply, no error               | `src/engine/local.ts` reasoning filter; run `tests/unit/gguf.test.js`         |
| Reply stops mid-stream              | `src/engine/worker-protocol.ts`, `watchWorker`, `src/diagnostics.ts`          |
| "Built-in assistant" after a reload | `SKIP_MODEL_RESTORE_FLAG`, `src/engine/memory.ts`                             |
| Vault unlocks but chats vanish      | `vaultExists()` in `src/storage/db.ts`, then `migrateVaultRecords`            |
| Settings panel empty or throws      | `cacheDom()` in `src/app.ts` logs `Missing element #id`                       |
| Download restarts from zero         | `src/engine/resumable-download.ts`, `ETag`/`Range` support of the host        |
| CI never starts                     | `npm run check:workflows` — an unpinned or mispermissioned job fails silently |
