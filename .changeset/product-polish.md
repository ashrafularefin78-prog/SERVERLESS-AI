---
"localmind": minor
---

A first-run introduction, honest indexing progress, and the enterprise paperwork

A fresh profile now opens with a short introduction instead of an empty chat: it
names what this device can actually run, recommends the built-in assistant as the
zero-download path, and offers the model picker only when a model would work. It
appears once, and a full data reset brings it back because that is a first run
again.

Indexing a document now shows where the time goes, with a progress bar and a
sentence per stage - reading, preparing the embedding model, generating
embeddings (n of m chunks), saving - instead of one "loading" line.

Also: a 375x667 viewport test suite (no sideways overflow, drawer off-screen until
asked, `dvh` height, settings reachable), CODEOWNERS routing for the security and
supply-chain paths, grouped Dependabot security updates, `npm run deps:licenses`
(69 shipped dependencies, all permissive; Node-only binaries excluded with a
reason), Mermaid module and sequence diagrams in `docs/architecture.md`, and a
tag-triggered CI job that attaches the built archive and SBOM to the GitHub
Release.
