# Requests for Comments

Design documents for decisions that outlive a pull request: storage formats,
protocols, and anything another project could reasonably want to implement.

| RFC                                 | Status                      | Topic                                            |
| ----------------------------------- | --------------------------- | ------------------------------------------------ |
| [0001](0001-browser-rag-storage.md) | Draft, implemented by 1.0.0 | IndexedDB schema for documents and chunk vectors |

An RFC is written before the code changes where possible, and updated to match
the code afterwards - with unimplemented ideas explicitly marked **Proposal**, so
a reader can tell what is specified from what is aspirational.

Process, deliberately light for a project this size:

1. Open an issue describing the problem and the shape of the answer.
2. Send a pull request adding `rfcs/NNNN-title.md`, numbered by issue.
3. Keep it reviewable: motivation, the proposal, alternatives considered, and
   open questions. Length is not a virtue.
4. Status moves Draft -> Accepted when the implementation lands, or Superseded
   when a later RFC replaces it. Nothing is deleted.
