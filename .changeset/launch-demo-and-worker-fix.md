---
"localmind": patch
---

Fix workers blocked by the app's own Trusted Types policy

`require-trusted-types-for 'script'` applies to the Worker constructor, and Vite emits
worker URLs that the policy refuses, so PDF ingestion hung on "Reading …" and model
loading failed silently in the production build. Workers are now same-origin files
created through the app's policy, pdf.js is handed a port instead of a worker URL, and
an end-to-end test ingests a real PDF so the regression cannot come back unseen.

`npm run demo` runs the launch flow against the production build and writes the
evidence - screenshots, a full network log, and a report that fails if anything was
requested between the question and the answer.
