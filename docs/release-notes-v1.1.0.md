# LocalMind 1.1.0 — the private AI you can actually read

LocalMind is a chat app with no backend. Download it once, and every token is
generated on your own GPU or CPU, in a tab, from code and weights you can inspect.
There is no account, no API key, no telemetry, and nothing to sign up for.

This release is about the things that were missing for someone who is not already
convinced: a second and third language, a way to see what is on your disk, a
straight answer about content filtering, and the paperwork that tells you who to ask
when something breaks.

**Try it:** https://ashrafularefin78-prog.github.io/SERVERLESS-AI/ — it works
immediately on the built-in assistant, and downloads a model only if you ask.

## What is new in 1.1.0

### Español y Deutsch

The interface offered coding help for 66 languages while speaking only English.
Navigation, controls, headings, dialog titles, buttons, placeholders, and
`aria-label`s now follow your browser in **English, Spanish, or German**, and can be
pinned in Settings.

Two details matter more than the feature:

- **A missing translation shows English, never a blank button.** The English text
  _is_ the lookup key, so the app cannot drift into a half-translated interface.
- **You download nothing for a language you do not use.** Locales are separate
  chunks; the entry grew 1.7 kB for the resolution logic and no more.

Model replies are not translated — they answer in whatever language you write in.
That is stated in [docs/i18n.md](docs/i18n.md) rather than left to be discovered.

### Every model download, with its real size

Settings → **Model storage** lists each model whose weights are actually on this
device: its measured size, whether it lives in OPFS or cache storage, and a delete
button for _that_ model. Before this, you could only delete the one you had
selected, so a third download was invisible until you went looking.

Sizes are read from the files, not from an estimate, and a model present in both
stores is counted once. The same panel shows what the site is using against its
quota and the WebGPU adapter limits that decide whether a model can fit at all.

### A stated content-safety position

The catalogue includes 504 uncensored "abliterated" builds. The app does not filter
their output — and [docs/content-safety.md](docs/content-safety.md) now says so
plainly, along with why a classifier is not shipped: it would be a second
multi-hundred-megabyte download for every user, it cannot be verified on this
repository's hardware, and a filter that narrows the app's one checkable promise
without doing the work is worse than an honest warning.

Selecting one keeps a bordered warning in Settings while it is selected, instead of
a chip in a picker you have already scrolled past.

### Two bugs that made the app look fine and do nothing

Both were found by running the launch demo rather than trusting the suite.

- **Trusted Types was blocking every Worker.** The page enforces
  `require-trusted-types-for 'script'`, and Vite emits workers that the policy
  correctly refuses: PDF ingestion sat on "Reading …" forever and model loading
  failed silently. The workers are now same-origin files fetched through the app's
  own policy, and `tests/e2e/pdf-ingest.spec.js` drops a real PDF and waits for it
  to be indexed, because "the tests pass" was not the same as "the feature runs".
- **The dev server was what CI tested.** The Playwright job ran the suite twice,
  once against `vite dev`, where the CSP header and the service worker do not exist
  and the payload is 4.6 MB of unbundled modules. It now builds and tests `dist/`
  only; the specs that need the build skip themselves in dev mode with a reason.

### Accessibility that fails loudly

The automated axe audit now also runs with the mobile drawer open, and it caught two
real WCAG 2.2 failures: the scroll-to-bottom cue was 23 px tall, and the
thinking-effort select was a text-sized touch target. Both are fixed. The audit runs
across six states, including a streaming conversation and an uncensored model's
warning.

### Optional prompt redaction

Settings → **Redact before sending** masks emails, phone numbers, card numbers
(Luhn-checked), IBANs (mod 97), SSNs, API tokens, JWTs, and IPv4 addresses as stable
placeholders before a prompt reaches a model — including retrieved document passages.
Your chat keeps exactly what you typed. Names and postal addresses are not detected,
and the UI says so.

### Everything else in this release

- **Benchmark:** `npm run bench` reports time to first token and tokens per second
  from the app's own statistics, with the median of several runs.
- **Diagnostics bundle:** `?debug=true` opens the environment panel; the export is an
  allowlist schema that cannot carry a chat, a document, or a setting.
- **Vault hardening:** new vaults use PBKDF2-SHA-256 at 600,000 iterations with
  record-bound AAD; a lock during a slow reply no longer writes plaintext, and hiding
  the tab locks after a 60-second grace period.
- **First-run introduction and honest indexing progress**, replacing one "loading"
  line with the stage, the file name, and a real progress bar.
- **Keyboard path:** a skip link, visible focus rings on every stop, and a spec that
  proves a reply can be requested and announced without a pointer.
- **CI that tells the truth:** the Playwright job now tests the production build
  (the dev server served 4.6 MB of unbundled modules and no CSP header), the OSV scan
  actually writes its report, and the coverage floor follows the CI measurement
  instead of the local one.
- **Supply chain:** actions pinned to 40-character SHAs, an SBOM per release, a
  licence audit of shipped dependencies (69, all permissive), and CODEOWNERS routing
  for the paths that matter.

## What it still is not

- The built-in assistant is rules and templates. It cannot reason. That is what the
  optional on-device model is for.
- A 0.3B–1B quantised model is useful, not frontier-grade. Expect uneven facts and
  short context.
- GitHub Pages cannot set COOP/COEP, so there is no `SharedArrayBuffer` and no
  multi-threaded WASM. Models run single-threaded there.
- Documents and their vectors are **not** encrypted by the vault; chats and memory
  notes are.
- There is no sync, no backup, and no audit log. Clearing the site deletes everything,
  by design.

## Verify it yourself

```bash
npm ci
npm test            # 1,735 unit and eval tests
npm run test:e2e:preview   # 81 Playwright specs against the production build
npm run check:size  # 262.4 kB gzip of a 264 kB budget
npm run deps:licenses      # 69 shipped dependencies, all permissive
npm run screenshots # counts the network requests a first visit makes
```

The SBOM and a zip of the exact build are attached below.
