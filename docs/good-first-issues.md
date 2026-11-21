# Good first issues

Drafts for the repository's issue tracker. Each one is small, self-contained, and
has a clear definition of done, so a first-time contributor can finish it without
a design discussion. Create them with the `good first issue` and `help wanted`
labels.

Nothing here requires understanding the model runtime. That is deliberate: the
first contribution should be a normal web fix, not a WebGPU debugging session.

---

## 1. Localise the composer placeholders

**Files:** `src/config.ts`, `src/app.ts`
**Done when:** the composer placeholder, the empty-state line, and the send/stop
button labels come from a locale object with `en` as the only entry, and every
string still renders identically in English.

Keep the copy in `src/config.ts` with the other UI strings. Do not add a language
detection library; one exported `LOCALES` map is enough for the first pass.

---

## 2. Show the model download size in the model picker list

**Files:** `src/ui/render.ts`, `src/app.ts`
**Done when:** each model row in the picker shows its download size (GGUF) or
memory estimate (WebGPU) next to the label, using the existing `memoryLabel`
field, and the picker still passes its keyboard test.

The data is already on each `LocalModel`. This is a rendering change plus an
assertion in `tests/e2e/design.spec.js`.

---

## 3. Add a keyboard shortcut to focus the conversation

**Files:** `src/app.ts`
**Done when:** `g` then `c` (pressed with no modifier and no dialog open) moves
focus to the message list, with an accessible name announced; typing in the
composer is unaffected.

Follow the existing `Ctrl/Cmd+K` handling for the pattern, including the
`document.querySelector("dialog[open]")` guard. Add a case to
`tests/e2e/a11y.spec.js`.

---

## 4. Make the diagnostics log exportable as a file

**Files:** `src/diagnostics.ts`, `src/app.ts`
**Done when:** a "Download diagnostics" button next to "Copy diagnostics" saves
the same text as `localmind-diagnostics-<date>.txt`, and the log stays bounded at
`DIAGNOSTICS_LIMIT` entries.

Use a `Blob` and an object URL, revoked after the click. Keep the existing
privacy rule: no prompts, documents, or memory notes in the log.

---

## 5. Fix mobile padding on the conversation header

**Files:** `src/style.css`
**Done when:** at a 390×844 viewport the conversation title does not collide with
the model chip, and the header's horizontal padding matches the composer's
(14px). Verify with a screenshot before and after.

This is a pure CSS fix; the design tests in `tests/e2e/design.spec.js` show how to
assert computed sizes.

---

## 6. Add a "copy conversation as Markdown" action

**Files:** `src/ui/render.ts`, `src/app.ts`, `src/markdown.ts`
**Done when:** a per-conversation action copies the whole chat as `## You` /
`## Assistant` sections with fenced code blocks preserved, and a toast confirms
the copy.

Reuse the existing clipboard helper and the `data-copy` handler rather than adding
a second copy path. Code fences are already detected by `detectLanguage`, so the
serializer can reuse the same language ids.

---

## 7. Document the retrieval thresholds with measured examples

**Files:** `docs/architecture.md`, `tests/evals/cases.json`
**Done when:** the three thresholds in `src/rag/confidence.ts` each have a worked
example (query, passage, score) in the docs, taken from a real run rather than
invented, and an eval case covers the abstain path.

Produce the numbers by logging `assessRetrieval` output for a few documents; do
not tune the thresholds in this issue, only document what they do today.

---

## 8. Add a French translation of the welcome suggestions

**Files:** `src/config.ts`
**Done when:** `SUGGESTIONS` and the welcome headline have `fr` variants behind
the locale seam added in issue 1, with the empty-state copy translated too, and a
test asserts every locale has the same number of suggestions as `en`.

Depends on issue 1. Keep the prompts short: they sit in cards and wrap awkwardly
past ~70 characters.

---

## How to write a good issue for this project

- Name the files, so nobody has to search.
- State the definition of done as something testable.
- Say what _not_ to change (the temptation to refactor a neighbouring file is how
  a small fix turns into a review argument).
- Link the test file where the assertion belongs.
