---
"localmind": minor
---

Optional prompt redaction, a benchmark, and the design docs to argue with

Settings has a new opt-in: mask structured identifiers before the text reaches a
model. Emails, phone numbers, card numbers (Luhn-checked), IBANs (mod 97), US
social security numbers, API tokens, JWTs, and IPv4 addresses become stable
placeholders such as `[EMAIL_1]`, in retrieved document passages as well as the
prompt. The chat keeps exactly what you typed, the log records counts and never
values, and the module is imported only when the setting is on. Names and postal
addresses are not detected, and the UI says so.

`npm run bench` reports time to first token and tokens per second for the current
device, from the app's own stored statistics, with the median of several runs and
an explicit `estimatedTokens` flag when the runtime reports no usage. Replies now
record their time to first token.

Also: `rfcs/0001-browser-rag-storage.md` specifies the IndexedDB document and
chunk schema as implemented, with unimplemented ideas marked as proposals;
`rfcs/README.md` describes the (light) process; `docs/webml-feedback.md` collects
ten platform gaps found while shipping, each naming the code that worked around
it; and an offline-mode assertion no longer depends on which toast won a race.
