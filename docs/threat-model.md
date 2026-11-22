# Threat model and privacy

This page states what LocalMind protects, from whom, and where the protection
stops. It is written to be argued with: every claim below is tied to a file, a
test, or a limitation you can reproduce. [PRIVACY.md](../PRIVACY.md) covers what
data exists at all; this page covers what can go wrong with it.

## What is worth attacking

| Asset                                 | Where it lives                                        | Why it matters                                                |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Chat transcripts                      | IndexedDB (`conversations`), optionally AES-256-GCM   | The whole conversation, including anything the user pasted    |
| Memory notes                          | IndexedDB (`settings` row `memory`, or `memoryVault`) | Deliberately long-lived facts the user asked to be remembered |
| Knowledge documents and chunk vectors | IndexedDB (`knowledge`, `chunks`)                     | Whatever was in the uploaded file                             |
| Prompt text in flight                 | A Web Worker, then WebLLM/wllama                      | What the model is asked                                       |
| Model files                           | OPFS / Cache Storage, from Hugging Face               | Integrity matters: a tampered model can emit anything         |
| Diagnostics                           | In-memory ring buffer, 60 entries                     | Device and error detail, never uploaded                       |

## Who the design defends against

**1. The server, because there is none.** There is no backend to breach, no
account to take over, and no analytics pipeline to subpoena. The production build
is HTML, CSS, JavaScript, and a service worker. The only outbound requests are to
`huggingface.co` (model weights), `raw.githubusercontent.com` (the model
catalogue), and the app's own origin — enforced by `connect-src` in the CSP and
counted per page load by `npm run screenshots`.

**2. Someone else using the same browser profile.** This is the realistic
attacker, and it is why encryption exists. Without a vault, chats are readable
from devtools by anyone with the open browser. With a vault, records are
ciphertext until the key is in memory. The key is non-extractable, lives in a
module variable, and is dropped on lock, on tab hide after 60 s, on `pagehide`,
and on reload.

**3. A malicious document or model response.** Retrieved passages and replies are
attacker-influenced text. They are escaped into `<context>` with delimiter
stripping, the prompt states that passages are data, an abstain answer exists for
unanswerable questions, and every render path goes through DOMPurify under a
Trusted Types policy (`require-trusted-types-for 'script'`, one `localmind`
policy) so `innerHTML` cannot take a raw string.

**4. A tampered download.** Model weights come from Hugging Face with WLLM's
pinned `prebuiltAppConfig`, whose SRI hashes are checked before load; a mismatch
aborts the load rather than running the model. GGUF downloads use `If-Range`
against a stored ETag so a resumed download cannot silently splice two different
files.

**5. A nosy network or a shared device watching outbound traffic.** Nothing about
the conversation leaves the tab. The opt-in kill switch makes the service worker
refuse every cross-origin request regardless of method.

**6. A supply-chain compromise of the build.** Runtime dependencies are seven,
audited for licences (`npm run deps:licenses`), scanned by `npm audit` and OSV
(including dev tooling), and pinned in the lockfile. CI actions are pinned to
40-character commit SHAs with a version comment, checked by
`scripts/check-workflows.mjs`. Releases carry an SBOM and a zip of the exact build.

## What is explicitly out of scope

- **A compromised browser, OS, or extension.** An extension with `tabs` and
  script access reads the same DOM the user reads, and the model's weights are in
  the same process. Nothing in a web page can prevent that.
- **Malware with local file access.** IndexedDB is a file on disk.
- **Shoulder surfing and screen capture.** Locking hides content, but an unlocked
  tab is plaintext on screen by definition.
- **A user who ignores the passphrase warning.** There is no recovery, no reset,
  and no escrow. A lost passphrase is a lost vault; that is the point.
- **Denial of service on the device itself.** A huge PDF, a 4 GB model, or a very
  long chat can exhaust tab memory. The app releases GPU memory on idle, warns
  above the iOS tab budget, and pages long chats, but it will not stop a user from
  making their own tab slow.
- **Metadata the browser leaks anyway.** A network observer sees that
  `huggingface.co` was contacted and roughly how much was downloaded. That is
  visible in the network panel and is not hidden.
- **Third-party model licences and behaviour.** A model can produce harmful or
  wrong text. Licences are shown before load and unknown licences require explicit
  acceptance with a model-card link, but the output is the model's, not the app's.

## Residual risks we are not pretending to have solved

| Risk                                                               | Status                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Knowledge documents and vectors are **not** encrypted by the vault | Documented limitation; the vault covers chats and memory notes only                 |
| A vault unlocked in one tab stays unlocked until it locks itself   | Idle/hide timeouts apply per tab; there is no cross-tab coordination                |
| Redaction is opt-in, deterministic, and structured-only            | Names, postal addresses, and free-form identifiers are not detected; the UI says so |
| No audit log of unlocks, exports, or deletions                     | Deletions are real deletions, but nothing records who did what                      |
| The service-worker kill switch only covers requests it can see     | It does not intercept WebSockets, and it needs the worker active                    |
| WebLLM's artifact cache cannot resume a partial download           | A cancelled download starts over; wllama's CacheManager deletes partials            |
| No sync and no backup                                              | A cleared site loses everything, by design                                          |

## Testing the claims

- `tests/e2e/app.spec.js` — "locking during a slow reply never writes the reply in
  the clear", "hiding the tab briefly keeps the vault unlocked", and the reset
  test that clears a vault without leaving records behind.
- `tests/e2e/trusted-types.spec.js` — string sinks reject raw input and no policy
  violation occurs while the app renders and chats.
- `tests/unit/rag*.test.js` — `<context>` escaping, delimiter stripping, the
  abstain path, and the confidence gate.
- `tests/unit/diagnostics-bundle.test.js` — the exported bundle is an allowlist
  schema; a marker string in a chat never appears in it.
- `tests/unit/redact.test.js` — checksum-aware detection and placeholder stability.
- `npm run screenshots` — counts the network requests a first visit makes.
