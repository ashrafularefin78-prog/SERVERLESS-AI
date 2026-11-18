import { describe, expect, it } from "vitest";
import { detectLanguage, detectLanguageDetailed, detectTask } from "../../src/coder/languages.js";

describe("detectLanguageDetailed", () => {
  it("returns null for empty input", () => {
    expect(detectLanguageDetailed("")).toBeNull();
    expect(detectLanguageDetailed("   \n")).toBeNull();
  });

  it.each([
    ["Write a Python program to add two numbers", "python"],
    ["How do I fix this Java NullPointerException?", "java"],
    ["I need a C++ program", "cpp"],
    ["Why does my Rust borrow checker complain?", "rust"],
    ["Write a small Go service", "go"],
    ["Convert this code to Kotlin", "kotlin"],
    ["```js\nconsole.log('hi');\n```", "javascript"],
    ["```sql\nSELECT * FROM users;\n```", "sql"],
  ])("detects the language in %j", (text, id) => {
    expect(detectLanguage(text)?.id).toBe(id);
  });

  it("records how the match was made", () => {
    expect(detectLanguageDetailed("Write a Python program")).toMatchObject({
      method: "mention",
      confidence: "high",
    });
    expect(detectLanguageDetailed("```js\nconsole.log(1);\n```")).toMatchObject({
      method: "fence",
      confidence: "high",
    });
    expect(detectLanguageDetailed("Convert this code to Go")).toMatchObject({
      method: "conversion",
      confidence: "high",
    });
  });

  it("does not force a language on ordinary prose", () => {
    expect(detectLanguage("I had a rough day at work")).toBeNull();
  });
});

describe("detectTask", () => {
  it.each([
    ["I get a TypeError when I run this", "error"],
    ["Please refactor this function", "refactor"],
    ["Write a Go program", "write"],
    ["How does this code work?", "explain"],
    ["Add unit tests for this module", "tests"],
    ["Convert this Java code to Kotlin", "convert"],
    ["Set up a virtualenv", "setup"],
    ["This SQL query is slow", "optimize"],
    ["Can you review this code?", "review"],
    ["Document this module", "document"],
  ])("classifies %j as %s", (text, task) => {
    expect(detectTask(text)).toBe(task);
  });
});
