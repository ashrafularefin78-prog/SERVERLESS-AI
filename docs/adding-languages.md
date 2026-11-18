# Adding language support

Coder mode uses a language catalog for detection, prompt guidance, fence labels, highlighting, and beginner code recipes. There are two levels of support:

1. **Detection and guidance** - add metadata to `LANGUAGES` in `src/coder/languages.js`.
2. **Complete beginner programs** - add or extend recipes in `src/coder/programs.js` and the emitters under `src/coder/emit/`.

A language can be detected and explained without having a program recipe. The reply engine will say that a complete example is not available rather than inventing one.

## 1. Add a catalog entry

Entries live in the `LANGUAGES` array in `src/coder/languages.js`. A typical entry:

```js
{
  id: "example",
  name: "Example",
  group: "general",
  fence: "example",
  fences: ["example", "ex"],
  extensions: [".ex"],
  version: "Example 2.0 or later",
  toolchain: "the example compiler",
  guidance:
    "Use the modern standard library, explicit error handling, and clear names. Avoid deprecated APIs.",
}
```

Important fields:

| Field         | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `id`          | Stable internal identifier used by recipes and tests |
| `name`        | Display name                                         |
| `group`       | Catalog grouping                                     |
| `fence`       | Default markdown fence label                         |
| `fences`      | Accepted fence aliases, lower-case                   |
| `extensions`  | File extensions used as a weak detection signal      |
| `match`       | Command or tool names that imply the language        |
| `contextOnly` | Requires a stronger signal than a bare mention       |
| `signals`     | Patterns that provide that stronger context          |
| `version`     | Version shown in prompt guidance                     |
| `toolchain`   | How the user runs or tests the code                  |
| `guidance`    | Style rules added to the coder prompt                |

Use `contextOnly` and `signals` when a language name is also an ordinary word or a short token that produces false positives (for example "go" or "rust"). Prefer specific patterns over a bare name.

## 2. Detection behavior

`detectLanguageDetailed()` tries, in order:

1. Explicit conversion targets: "convert this to Go".
2. Fenced code labels.
3. Language name mentions, filtered for ambiguous words.
4. Code signatures (keywords, imports, and syntax patterns).
5. File extensions as a low-confidence fallback.

`detectTask()` independently classifies the request as `write`, `explain`, `fix`, `error`, `refactor`, `review`, `tests`, `setup`, `optimize`, `convert`, `document`, `design`, or `security`. Add task keywords carefully: they affect every language.

## 3. Add a complete program recipe

The beginner-program path is intentionally curated. It is not a general code generator.

- `src/coder/programs.js` describes task shapes and format helpers.
- `src/coder/recipes/` contains task families (basic, decisions, digits, maths, numbers, properties, ranges).
- `src/coder/emit/` contains language-specific emitters and naming conventions.

To add a language:

1. Add an emitter under `src/coder/emit/` and register it in `src/coder/emit/index.js`.
2. Follow the intermediate representation used by the other emitters instead of building strings ad hoc.
3. Add the language to the program builder's supported set in `src/coder/programs.js`.
4. Test at least one program end to end and confirm it compiles or parses if a toolchain is available.

If you only need detection and explanation, stop after step 2 above.

## 4. Tests

Add cases to `tests/unit/languages.test.js`:

- a clear mention or fence that should detect the language,
- an ambiguous phrase that should not,
- a task keyword that should classify correctly,
- if a recipe was added, a full reply test in `tests/unit/replies.test.js` that checks the fence label and a key line of code.

Run:

```bash
npm test
npm run lint
npm run build
```

## 5. Review checklist

- Fence aliases are lower-case and do not collide with an existing language.
- Ambiguous names are protected with `contextOnly` plus specific `signals`.
- Guidance is accurate for the version you name.
- No code recipe claims to be complete if it has placeholders.
- New patterns do not severely slow detection across the whole catalog.
- Tests cover both a positive match and a false-positive case.
