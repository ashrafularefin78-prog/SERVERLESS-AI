# The 2-minute demo, beat by beat

A recording script for LocalMind. Every claim in it is checked by
`npm run demo`, which runs the same flow in a real browser and writes the evidence
to `docs/demo/` — so if the app regresses, the report fails instead of the video
looking fine.

Record at 1440×900 or larger, in a profile that has never opened the app, with the
DevTools **Network** tab open and **Preserve log** checked. Everything below fits in
two minutes if you do not ad-lib.

## Before you press record

```bash
npm run build
npm run preview      # leave this running; the demo uses the production build
```

Have `confidential-contract.pdf` ready — any PDF with a distinctive sentence works,
for example a page containing "Either party may terminate with ninety (90) days
written notice." Do not use a real confidential document in a public recording.

## Beat 1 — what this is (0:00–0:15)

> "This is LocalMind. It's a chat app with no backend: no account, no API key, no
> server that could see your prompts. It runs a language model inside this browser
> tab, on this machine's GPU or CPU."

Show the first-run dialog, then **Start with the built-in assistant**. Point at the
composer line: _"Prompt never leaves this tab"_.

## Beat 2 — the document (0:15–0:40)

Open **Settings → Knowledge → Add documents**, drop the PDF in.

> "I'm adding a confidential contract. Watch the progress: reading the PDF,
> preparing the embedding model — that's the one download you'll see — then
> generating embeddings on this device, and saving them locally."

Keep the Network tab visible while the embedding model downloads. It is the only
outbound traffic in the whole recording: a fixed model file, no document text.

## Beat 3 — the question (0:40–1:15)

Close Settings. Ask: **"How much notice does the Meridian contract require to
terminate?"**

> "Retrieval happens here, in the tab. The passage is pulled from my IndexedDB, put
> in front of the model, and the model answers with the clause it used."

Let the answer render. Point at the sources line under the reply.

## Beat 4 — the proof (1:15–1:45)

Switch to the **Network** tab, filter to **Fetch/XHR**, scroll to the moment the
question was typed.

> "Nothing. Zero requests between the question and the answer. The PDF, the
> question, the reply — none of it left this tab. The only things that were
> downloaded are the model weights and the embedding model, both fixed files, both
> cached now."

Show the size of the request list before and after the question. Optionally reload
the page with the network tab open to show the app working from cache.

## Beat 5 — the honest part (1:45–2:00)

Open **Settings → Encryption**, set a passphrase, then **Lock now**.

> "Chats can be encrypted at rest with a passphrase that never leaves this tab, and
> locked with one click. Two honest limits: the knowledge documents themselves are
> not encrypted by that vault, and there is no sync, no backup, and no recovery if
> you forget the passphrase. That's the trade for having no server."

Stop recording.

## What not to claim

- Do not say "no network traffic". Two model files are downloaded; say "no traffic
  after the downloads" and show the phase boundary.
- Do not say "unhackable" or "100% private". Say what is true: no backend, no
  telemetry, no upload, and a threat model in `docs/threat-model.md` that lists what
  is out of scope.
- Do not show the uncensored community models as a headline feature. They exist,
  they are labelled, and `docs/content-safety.md` explains the app does not filter
  them.

## If the machine has no GPU

The demo still works: pick a community GGUF model in **Settings → AI model**, which
runs on the CPU through WebAssembly. It is slower, and a 400 MB download, so start
the recording after it has loaded — or run `npm run demo -- --model` first to warm
the cache, since the script keeps a profile in `.demo-profile/`.
