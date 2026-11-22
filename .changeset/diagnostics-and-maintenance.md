---
"localmind": patch
---

Local observability you can hand over, and the maintenance docs to go with it

Settings now reads the environment instead of guessing: the WebGPU adapter and
the limits that constrain a model, the device memory budget, and storage usage
broken down by OPFS files. `?debug=true` opens that panel directly, which is the
link to put in a bug report.

An "Export bundle" button writes a JSON file with that environment, the user
agent, and the local error log, and nothing else: there is no field in the
schema that could carry chat, document, or settings content, and an end-to-end
test sends a marked message and asserts the marker never appears in the file.

Also: clearing all data now frees the embedding worker that holds the MiniLM
weights, the retrieval numbers live in one module (`src/rag/config.ts`) instead
of being repeated as default arguments, lint fails on `any` and on any warning,
`MAINTAINERS.md` covers releases, model updates, and the load-bearing decisions,
`docs/ci.md` explains every workflow and the SBOM, a throttled-CPU browser test
holds the stop button to a response budget, and `docs/release-notes-v1.0.0.md`
is the 1.0.0 release body.
