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

`demoChatReply()` in `src/chat/replies.js` checks rules in a deliberate order. Earlier rules win:

1. Empty input and safety/crisis language.
2. Name introductions.
3. Questions about memory or the user's saved name.
4. Time, date, and weather.
5. Arithmetic and percentages.
6. Code requests and language/task detection.
7. Riddle answers that follow a previous riddle.
8. Jokes, facts, stories, riddles, and motivation.
9. Emotional support.
10. Boredom, identity/capability questions, opinions, and explanations.
11. Planning and decision help.
12. Conversation follow-ups, greetings, thanks, and other small talk.
13. Statements and a final fallback.

Order matters. Safety must run first so no other rule can intercept a crisis message. Memory questions must run before general identity rules so "what's my name?" can use saved notes. Code detection runs before conversational fallbacks so a coding request is not treated as small talk.

## Determinism and variation

Most replies are fixed strings. Where variation is safe, the rule uses `history.turnCount` or the length of the previous assistant reply as a seed. That keeps a conversation varied without random output that is hard to reproduce in tests.

The clock is injectable: `demoChatReply({ now })` accepts a date, which tests use for stable time and greeting assertions.

## Memory

Memory is explicit, not inferred:

- `parseMemoryCommand()` recognizes "remember ...", "forget ...", "my name is ...", and a few close variants.
- `applyMemoryCommand()` returns a new list plus an outcome (`added`, `duplicate`, `full`, `removed`). The app persists changes before generation.
- `buildDemoReply()` uses the outcome for a deterministic confirmation. Conversational rules can read the notes for questions such as "what do you remember about me?".

Limits live in `src/memory.js`: 30 notes, 200 characters each. Notes are plain text and are never sent anywhere.

## Adding a rule

1. Find the narrowest existing resolver in `src/chat/replies.js`. Add a new resolver only when the intent is genuinely distinct.
2. Match against already-normalized text. Prefer explicit alternatives with word boundaries over broad substring checks.
3. Return `null` when the rule does not apply so later rules can run.
4. Keep the reply in the assistant's voice: direct, warm, honest about limits, and free of invented facts.
5. Add a test in `tests/unit/replies.test.js` for the match and for a near-miss that should fall through.
6. Run `npm test` and `npm run lint`.

Rules must be local and side-effect free. Do not add network access, timers that mutate state, or HTML output. The renderer sanitizes markdown, but rules should still return plain markdown only.

## Adding a mode-specific answer

Coder mode passes a `buildDemoReply` function through the engine. `buildDemoReply()` in `src/engine/demo.js` uses it only when the active model key is `"demo"`. This keeps mode behavior out of the core engine while preserving a single streaming path.

## Limits by design

- No reasoning beyond pattern matching and small templates.
- No live data, browsing, tools, or retrieval.
- No learning from conversation. Only explicitly saved memory notes persist.
- No guarantee that a generated code recipe fits an unusual request; the engine should say so instead of inventing one.

These limits are product decisions, not bugs. Keeping them visible in replies and documentation is part of the privacy promise.
