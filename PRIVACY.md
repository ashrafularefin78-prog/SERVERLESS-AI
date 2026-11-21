# Privacy Policy

LocalMind is a static web app. There is no server, no account, and no company that receives your data. This page states exactly what the software does with information, in terms a reader can check against the source.

**Last reviewed:** see the repository history for this file. Every claim below names the code that implements it.

## Summary

| Question                                             | Answer                                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is any of my data sent to a server?                  | No. Chats, memory notes, documents, embeddings, and settings stay in this browser.                                                                       |
| Do you use analytics, telemetry, or crash reporting? | No. There is no analytics code and no endpoint to send to.                                                                                               |
| Do you use cookies?                                  | No. The app stores data in IndexedDB, Cache Storage, OPFS, and `sessionStorage` (diagnostics only).                                                      |
| Can I delete everything?                             | Yes: **Settings → Clear all data**, and per-conversation delete.                                                                                         |
| Do you need my email or an account?                  | No.                                                                                                                                                      |
| Are model downloads private?                         | The download itself requests public files from a model host; that host sees your IP address, as any download does. Nothing about your chats is included. |

## What is stored, and where

All of it is on your device, in this browser profile.

| Data                                            | Where                                      | Code                               |
| ----------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| Conversations, messages, titles                 | IndexedDB `conversations`                  | `src/storage/db.ts`                |
| Settings, memory notes, accepted model licenses | IndexedDB `settings`                       | `src/storage/db.ts`                |
| Documents and their chunk vectors               | IndexedDB `knowledge`, `knowledgeChunks`   | `src/rag/store.ts`                 |
| Model weights and partial downloads             | OPFS                                       | `src/engine/resumable-download.ts` |
| App shell and assets                            | Cache Storage                              | `public/sw.js`                     |
| Diagnostics log (this tab only)                 | `sessionStorage`                           | `src/diagnostics.ts`               |
| Theme preference                                | DOM attribute, plus the settings row above | `src/app.ts`                       |

Nothing in that list leaves the device. **Clear all data** closes and deletes the database, clears caches, web storage, and service workers, then reloads (`clearAllData()` in `src/app.ts`).

## When the app talks to the network

Only these cases exist, and each one needs you to start it:

1. **Loading the app** — your browser fetches the static files from whichever host you opened. That host sees a normal web request.
2. **Downloading an on-device model** — after you pick a model in Settings, the app fetches weights from Hugging Face (or the pinned host in the catalogue) and from the model-library host. The request contains the file URL and your IP address; it contains no chat, document, or memory content.
3. **The first embedding run** — the first time you add a document or ask about one, the app downloads `all-MiniLM-L6-v2` for on-device embeddings. Same properties as above.

Everything else — chatting, retrieval, encryption, summarising, exporting — runs locally. The Content Security Policy in `vite.config.js` restricts `connect-src` to those model hosts, so a bug could not quietly reach another origin.

**Offline mode** in Settings goes further: while it is on, the service worker refuses every cross-origin request (`src/offline.ts`, `public/sw.js`).

## GPDR / UK GDPR mapping

LocalMind is not a data controller or processor for your chats, because no one operating this project receives them. The following are still the practical answers a privacy reviewer will ask for:

| Obligation                                     | How it is met                                                                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lawful basis / purpose limitation**          | No personal data is collected by the project. Processing happens on your device under your control.                                                                                 |
| **Data minimisation**                          | Only what you type or add is stored, in the smallest form the feature needs (for example, retrieval traces keep a 220-character preview, not the whole document).                   |
| **Right of access / portability**              | **Settings → Export chats** writes a JSON file with your conversations, memory, and selected settings.                                                                              |
| **Right to erasure ("right to be forgotten")** | **Settings → Clear all data** deletes conversations, settings, knowledge documents, vectors, caches, and service workers. Individual chats and documents can be deleted separately. |
| **Storage limitation**                         | No retention schedule is needed because nothing is retained by a third party. You can erase everything at any time.                                                                 |
| **Security of processing**                     | Optional AES-256-GCM encryption of chats and notes with a passphrase-derived, non-extractable key; strict CSP; sanitized rendering. See [SECURITY.md](SECURITY.md).                 |
| **International transfers**                    | None by the project. Model downloads go directly from your browser to the model host; that host's own policy applies to the request.                                                |
| **Cookies / ePrivacy**                         | No cookies, no tracking pixels, no fingerprinting.                                                                                                                                  |
| **Automated decision-making**                  | None. The app produces text you choose how to use.                                                                                                                                  |

## Encryption, precisely

- Chats and memory notes can be encrypted at rest with AES-256-GCM. Keys are derived with PBKDF2-SHA-256 (600,000 iterations for new vaults) from your passphrase, are non-extractable, and live only in the open tab (`src/crypto.ts`).
- The passphrase is never stored, never transmitted, and cannot be recovered. If you forget it, the data is unreadable.
- Vaults created by an earlier version are upgraded on unlock; they keep working with the older derivation until then.
- Knowledge documents and their vectors are **not** covered by the vault today. That is a real limitation, stated here rather than implied otherwise. See [ROADMAP.md](ROADMAP.md).

## What this policy cannot promise

- **Your device.** Malware, a hostile browser extension, or another person with access to your profile can read local data. Encryption protects the at-rest case only while the vault is locked.
- **The host serving the app.** It sees the request for the page itself, like any website visit.
- **Model hosts.** They see that someone downloaded a specific public file. They do not see your prompts.
- **A modified build.** This policy describes this repository. Anyone can fork it and add tracking; a build is only as trustworthy as the source it came from. The deploy workflow attests the artifacts it publishes so you can check provenance.

## Verifying the claims

You do not have to take this document's word for it:

1. Deploy or open the build, then open DevTools → **Network** and use the app for a while. Apart from the initial asset load and any model download you start, there are no requests.
2. Enable **Offline mode** and confirm the app still works with the network blocked.
3. Read `vite.config.js` for the CSP and `SECURITY.md` for the threat model.
4. `npm test` includes a browser test asserting that chatting makes no cross-origin request.

## Children

The app has no account system and collects nothing, so there is no age-gated data collection. On-device models can produce unsuitable output; the app does not add a content filter, which is stated in the README.

## Changes

Material changes to data handling must update this file and [SECURITY.md](SECURITY.md) in the same pull request. The contribution guide requires it.

## Contact

Open an issue for privacy questions about the software. Do not include personal data in an issue.
