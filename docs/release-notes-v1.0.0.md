# LocalMind v1.0.0

A private AI assistant that runs entirely in a browser tab. Open a URL, start
typing. No account, no API key, no server, and nothing to install.

- **Works instantly.** The built-in assistant answers offline with no download.
- **Optional on-device models.** WebGPU models through WebLLM, or community GGUF
  builds on the CPU through WebAssembly, with resumable downloads.
- **Ask your own documents.** Drop in a PDF or text file and get an answer that
  cites the passage it came from - or an honest "I cannot find that".
- **Optional encrypted vault.** Chats and notes are sealed with AES-256-GCM and a
  passphrase only this device holds.

## What makes it different

**Nothing leaves your device.** There is no backend to send anything to. The app
makes exactly one kind of request: a model download you started yourself, from
Hugging Face. `docs/screenshots/network-log.txt` is the captured request log of a
full conversation - three requests, all same-origin. A kill switch in Settings
makes the service worker refuse every outbound request, including that download.

**The privacy claims are testable.** `PRIVACY.md` maps each promise to the code
that implements it, and the browser suite asserts the important ones: no outbound
requests during a chat, no plaintext written by a locked vault, a bug report that
contains no conversation text.

**Honest about limits.** The assistant has no internet access and says so. Model
licences are never guessed from a model name: verified families show their terms,
everything else is labelled unverified and links to the model card before you
download a byte.

## Try it

Open the site, then:

1. Ask something ordinary - "help me plan a 30-minute study session".
2. Open Settings, choose a model if your device has WebGPU, and download it. The
   first download is the only thing that leaves your machine.
3. Add a document in the knowledge base and ask about it. Turn on "Show your work"
   to see the passage and score behind the answer.
4. Turn on the vault if you want chats encrypted at rest. Set a passphrase of at
   least 12 characters; it cannot be recovered.

## Known limits, stated plainly

- **Model downloads are large.** A small GPU model is a few hundred megabytes; CPU
  builds start around 300 MB. Nothing is downloaded until you ask for it.
- **No iOS Safari guarantee for big models.** Safari caps a tab at roughly 1 GB,
  so the app judges models against that budget and warns instead of crashing.
- **Documents and vectors are not vault-encrypted.** They live in a separate store
  and are deleted explicitly. `PRIVACY.md` says so in the storage table.
- **No sync, no accounts, no audit.** This is one browser profile on one device.
- **WebLLM cannot resume an interrupted artifact download.** Community GGUF
  downloads do resume; the WebGPU runtime's cache does not expose that.
- **GitHub Pages cannot set COOP/COEP headers**, so there is no
  `SharedArrayBuffer` and no multi-threaded WASM here.

## Verifying a build

- Signed provenance: `gh attestation verify dist.zip --repo ashrafularefin78-prog/SERVERLESS-AI`
- SBOM: `npm run sbom > sbom.cdx.json`; model inventory: `npm run models:ai-bom`
- Tests: 1,600+ unit and evaluation cases, plus a Playwright suite covering the
  production CSP, service worker, accessibility, and scroll behaviour.

## Thanks

Built as a demonstration that a capable AI interface does not require a server, an
account, or a data collection pipeline. If it is useful to you, the most valuable
contributions are bug reports with a diagnostics bundle, an honest review of a
model licence, or a browser-engine pass (`PLAYWRIGHT_BROWSERS=firefox,webkit`).

Full history: [CHANGELOG.md](https://github.com/ashrafularefin78-prog/SERVERLESS-AI/blob/main/CHANGELOG.md).
