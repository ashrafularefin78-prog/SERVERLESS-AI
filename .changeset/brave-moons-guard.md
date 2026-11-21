---
"localmind": minor
---

Document excerpts now sit inside an escaped `<context>` block, and weak retrieval returns an explicit "I cannot find the answer in the provided documents." reply instead of a guess. A crashed or out-of-memory model worker falls back to the built-in assistant with an explanation, community GGUF downloads resume after an interrupted transfer, and Settings gains a local diagnostics log you can copy into a bug report.
