---
"localmind": minor
---

Community GGUF models now request an 8-bit key/value cache with flash attention, roughly halving the memory a long conversation needs on the CPU path, and retry once with the runtime's defaults if the build rejects it. Adds a published vulnerability-response policy with severity-based targets, and collects the evidence needed to apply for the OpenSSF Best Practices badge.
