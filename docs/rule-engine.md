# Rule engine

The built-in assistant is a deterministic rule engine, not a language model. Replies come from matching the latest message and recent history against local rules and small data tables.

## Input pipeline

```
raw message
  -> normalizeText()        invisible chars, smart quotes, line endings, whitespace
  -> expandShorthand()      pls -> please, doesnt -> doesn't, idk -> I don't know
  -> analyzeIntent()        smalltalk | emotion | bug | question | request, plus vague flag
  -> buildDemoReply()       memory command, coder mode, or conversational rules
  -> generateDemo()         stream word chunks, then usage
```

`normalizeText()` and `expandShorthand()` leave fenced code and inline code untouched, so identifiers and string literals are never rewritten. Chat history stores the original wording; normalization applies only to the working copy.

`analyzeIntent()` is used for prompt hints and future model backends. The demo reply rules perform their own more specific matching.

## Reply order

`demoChatReply()` in `src/chat/replies.ts` checks rules in a deliberate order. Earlier rules win:

1. Empty input and safety/crisis language.
2. Prompt-injection and jailbreak refusal (`src/guardrails.ts`).
3. Name introductions.
4. Questions about memory or the user's saved name.
5. Time, date, and weather.
6. Arithmetic and percentages.
7. Code requests and language/task detection.
8. Riddle answers that follow a previous riddle.
9. Jokes, facts, stories, riddles, and motivation.
10. Emotional support.
11. Boredom, identity/capability questions, opinions, and explanations.
12. Planning and decision help.
13. Conversation follow-ups, greetings, thanks, and other small talk.
14. Conversation recap from compacted context plus kept turns (`src/context.ts`).
15. Statements and a final fallback.

Order matters. Safety must run first so no other rule can intercept a crisis message, and injection refusal runs immediately after it. Memory questions must run before general identity rules so "what's my name?" can use saved notes. Code detection runs before conversational fallbacks so a coding request is not treated as small talk. Recap runs late and only matches narrow "recap / what did we discuss" phrasing, so "summarize this paragraph" still falls through to the passage-summarize fallback.

## Determinism and variation

Most replies are fixed strings. Where variation is safe, the rule uses `history.turnCount` or the length of the previous assistant reply as a seed. That keeps a conversation varied without random output that is hard to reproduce in tests.

The clock is injectable: `demoChatReply({ now })` accepts a date, which tests use for stable time and greeting assertions.

## Memory

Memory is explicit, not inferred:

- `parseMemoryCommand()` recognizes "remember ...", "forget ...", "my name is ...", and a few close variants.
- `applyMemoryCommand()` returns a new list plus an outcome (`added`, `duplicate`, `full`, `removed`). The app persists changes before generation.
- `buildDemoReply()` uses the outcome for a deterministic confirmation. Conversational rules can read the notes for questions such as "what do you remember about me?".

Limits live in `src/memory.ts`: 30 notes, 200 characters each. Notes are plain text and are never sent anywhere.

## Guardrails

`src/guardrails.ts` holds cheap, deterministic, local checks — no model and no network:

- `detectPii()` / `piiWarning()` spot sensitive shapes (email, phone, Luhn-valid card, government ID, secrets/keys) in what the user types. The composer shows a non-blocking toast reminding them the text stays on this device; the message is still sent and saved locally. Card detection uses Luhn validation so ordinary long numbers are not flagged.
- `detectInjection()` / `injectionRefusal()` recognize prompt-injection and jailbreak phrasing and return a calm refusal that redirects to the user's real goal. Patterns carry precision guards (for example a `(?! of\b)` lookahead and system-ish qualifiers) so benign lines like "ignore the rules of grammar" or "show me the prompt for the play" are not refused.
- Output filtering is the markdown sanitizer in `src/markdown.ts`; uncertainty is expressed by the calibrated fallbacks in `replies.ts`. Together these cover redaction, injection resistance, output filtering, and honesty about limits without any model.

## Context management

`src/context.ts` keeps the bounded window honest. `compactHistory()` splits history into the tail that fits `CONTEXT_LIMITS` and the prefix that does not, and `buildHistorySummary()` makes an extractive digest of the dropped user topics (deduped, capped). `formatCompactionNote()` carries that digest as a system note so earlier context is not lost silently, and `recapReply()` answers "recap / what did we talk about" from the digest plus the turns still in the window. All of it is pure and unit-testable in Node.

## Adding a rule

1. Find the narrowest existing resolver in `src/chat/replies.ts`. Add a new resolver only when the intent is genuinely distinct.
2. Match against already-normalized text. Prefer explicit alternatives with word boundaries over broad substring checks.
3. Return `null` when the rule does not apply so later rules can run.
4. Keep the reply in the assistant's voice: direct, warm, honest about limits, and free of invented facts.
5. Add a test in `tests/unit/replies.test.js` for the match and for a near-miss that should fall through.
6. Run `npm test` and `npm run lint`.

Rules must be local and side-effect free. Do not add network access, timers that mutate state, or HTML output. The renderer sanitizes markdown, but rules should still return plain markdown only.

## Adding a mode-specific answer

Coder mode passes a `buildDemoReply` function through the engine. `buildDemoReply()` in `src/engine/demo.ts` uses it when provided, otherwise it falls back to the conversational rules. This keeps mode behavior out of the core engine while preserving a single streaming path.

## Limits by design

- No reasoning beyond pattern matching and small templates.
- No live data, browsing, tools, or retrieval.
- No learning from conversation. Only explicitly saved memory notes persist.
- No guarantee that a generated code recipe fits an unusual request; the engine should say so instead of inventing one.

These limits are product decisions, not bugs. Keeping them visible in replies and documentation is part of the privacy promise.
