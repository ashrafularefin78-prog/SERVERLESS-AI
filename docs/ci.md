# CI, releases, and deployment

What runs where, what it produces, and how to reproduce it locally. Every
command below exists in `package.json`; nothing here is a manual step that only
one person knows.

## Workflows

| File                               | Trigger                  | Does                                                                                | Produces                                                         |
| ---------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.github/workflows/ci.yml`         | push to `main`, every PR | seven checks, see below                                                             | `sbom-cyclonedx`, `preview-dist`, `playwright-report` on failure |
| `.github/workflows/deploy.yml`     | push to `main`, manual   | builds and publishes to GitHub Pages                                                | `dist.zip` attestation, `sbom`, Pages artifact                   |
| `.github/workflows/release.yml`    | push to `main`           | opens/updates the changesets version PR                                             | the version PR                                                   |
| `.github/workflows/codeql.yml`     | push, PR, weekly         | `security-extended` CodeQL for JavaScript/TypeScript                                | SARIF in the Security tab                                        |
| `.github/workflows/commitlint.yml` | PR                       | rejects non-Conventional-Commit titles                                              | -                                                                |
| `.github/workflows/stale.yml`      | daily                    | closes idle issues/PRs, exempts `pinned`, `security`, `roadmap`, `good first issue` | -                                                                |
| `.github/workflows/welcome.yml`    | first issue/PR           | greets the contributor                                                              | -                                                                |

All third-party actions are pinned to a commit SHA with a `# vX.Y` comment so
Dependabot can bump them and so a moved tag cannot change what runs. That, plus
"every job has a runner or a reusable workflow", is checked by
`npm run check:workflows` (`scripts/check-workflows.mjs`), which also runs as a
unit test so a broken workflow fails the suite instead of failing silently at
startup.

## `ci.yml` in detail

| Job                 | Steps                                                                                                                                               | Why it exists                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `quality`           | `check:workflows`, `typecheck`, `lint` (`--max-warnings=0`), `format:check`, `test:coverage`, `evals`, `evals:model`, `build`, `check:size`, `sbom` | the gate; coverage thresholds and the 264 kB budget are hard failures  |
| `preview` (PR only) | `build`, upload `dist`                                                                                                                              | review the exact bytes that would ship                                 |
| `osv`               | `google/osv-scanner-action` composite action, `--config=./osv-scanner.toml`                                                                         | dependency CVEs in the whole lockfile, including build tooling         |
| `e2e`               | `build`, then Playwright on Chromium against `dist/` served by `vite preview`                                                                       | the only run that exercises the real CSP header and the service worker |

The `e2e` job used to run the suite twice, once against the dev server. That run
was testing something users never load: `vite dev` serves unbundled modules
(measured 4.6 MB of script where the built entry is 260 kB gzip), injects no CSP
header, and registers no service worker, so the payload budget, Trusted Types, and
both cache specs failed there and nowhere else. CI now runs the production build
only. Locally, `npm run test:e2e` still uses the dev server for speed and skips the
four specs that need the build, with the reason in the skip message.

A job that calls a reusable workflow must grant every permission that workflow
declares: it fails _at startup_, with no logs, otherwise. `check:workflows` now
catches that before CI does.

`npm run test:e2e:preview` is the local equivalent of the `e2e` job: it builds,
serves `dist/` with `vite preview`, and runs the same specs.

## When a green build goes red for no reason

Three failures have been seen that are infrastructure, not code. Each is worth
recognising rather than debugging:

| Symptom                                                                          | Cause                                                                  | What to do                                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm ci` fails with `ETIMEDOUT` in `onnxruntime-node`'s postinstall              | that package downloads ~100 MB from a CDN the browser build never uses | the install steps already retry once; if both fail, re-run the job |
| `actions/attest-build-provenance` fails with `error fetching tlog entry - (404)` | GitHub's transparency log is briefly unavailable                       | re-run the failed jobs; the deploy itself is fine                  |
| OSV job reports `--output has been deprecated`                                   | the scanner changed a flag under the pinned action                     | update the pinned action, not the workflow logic                   |

Anything else is a real failure, and the first step is to read the step's log rather
than the job summary.

## Software bill of materials

Two different artifacts, produced two different ways:

```bash
npm run sbom           # CycloneDX for JavaScript dependencies (npm sbom)
npm run models:ai-bom   # writes ai-bom.json: models, licences, verification status
npm run models:licenses # prints the same inventory to the console
```

`sbom` covers npm packages. `models:ai-bom` covers the thing npm knows nothing
about: the downloadable weights, their licences, and whether the licence was
curated (`src/engine/model-license-table.json`) or unverified. Neither is a legal
opinion; both exist so a reader can check the claim rather than trust it.

## Signed provenance

`deploy.yml` zips `dist/`, attests the archive with
`actions/attest-build-provenance`, and deploys the same directory to Pages. To
verify a published build:

```bash
gh attestation verify dist.zip --repo ashrafularefin78-prog/SERVERLESS-AI
```

What this proves: the archive was produced by this workflow from this repository
at that commit. It does not prove the deployed files are reproducible byte for
byte; `npm run build` is not hermetic (Vite embeds content hashes), and
`docs/openssf-badge.md` lists that as a known gap.

## Deployment

Production is GitHub Pages, served from `main`. Consequences that shape the code:

- **No response headers.** The CSP ships as a `<meta>` tag in `index.html`
  (`vite.config.js`), and `_headers`-style files do nothing here. That is why
  there is no `SharedArrayBuffer`, and therefore no multi-threaded WASM.
- **Subpath hosting.** `base` is `./`, so the app works under
  `/SERVERLESS-AI/`; asset URLs are relative and the service worker scope is the
  deploy root.
- **One environment.** There is no staging. A PR is reviewed through the
  `preview-dist` artifact instead.

### Using a different host

Netlify, Vercel, or Cloudflare Pages can serve the same `dist/` folder. Two
reasons to switch: real response headers (which would allow COOP/COEP and
`SharedArrayBuffer`), and per-PR preview URLs. If you do, keep the `_headers`
equivalent in sync with the CSP in `vite.config.js`; two sources of truth for a
security policy is worse than one.

Nothing in the app requires a server: no API routes, no rewrites, no
environment variables beyond the model hosts already in the CSP.

## Reproducing a CI failure locally

| CI step                                   | Local command                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `npm audit --omit=dev --audit-level=high` | same, plus `npm audit` for dev dependencies                                   |
| typecheck / lint / format                 | `npm run typecheck`, `npm run lint`, `npm run format:check`                   |
| coverage                                  | `npm run test:coverage`                                                       |
| evals                                     | `npm run evals`, `npm run evals:model`                                        |
| build + budget                            | `npm run build && npm run check:size`                                         |
| Playwright                                | `npx playwright install chromium && PLAYWRIGHT_PREVIEW=1 npx playwright test` |
| other engines                             | `PLAYWRIGHT_BROWSERS=firefox PLAYWRIGHT_PREVIEW=1 npx playwright test`        |
| SBOM                                      | `npm run sbom > sbom.cdx.json`                                                |
| workflows                                 | `npm run check:workflows`                                                     |

Coverage runs on the whole `src` tree, including browser-only modules that only
Playwright exercises. The thresholds are the measured floor (37/38/35/38) and
exist to catch regressions, not to claim the tree is mostly unit-tested. The
honest split is in `docs/whitepaper.md`.
