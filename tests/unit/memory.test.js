import { describe, expect, it } from "vitest";
import {
  MAX_MEMORIES,
  MAX_MEMORY_LENGTH,
  applyMemoryCommand,
  buildMemoryPrompt,
  parseMemoryCommand,
} from "../../src/memory.js";

const note = (text, id = text) => ({ id, text, addedAt: 1 });

describe("parseMemoryCommand", () => {
  it.each([
    ["remember that I use metric units", { type: "add", text: "I use metric units" }],
    ["Please remember this: I like tea", { type: "add", text: "I like tea" }],
    ["keep in mind I work nights", { type: "add", text: "I work nights" }],
    ["my name is Ada Lovelace.", { type: "add", text: "The user's name is Ada Lovelace." }],
    ["call me Grace", { type: "add", text: "The user's name is Grace." }],
    ["forget about my old address", { type: "forget", text: "my old address" }],
    ["forget everything", { type: "forget-all" }],
    ["forget it all", { type: "forget-all" }],
  ])("parses %j", (text, expected) => {
    expect(parseMemoryCommand(text)).toEqual(expected);
  });

  it("ignores ordinary messages", () => {
    expect(parseMemoryCommand("hello there")).toBeNull();
    expect(parseMemoryCommand("")).toBeNull();
    expect(parseMemoryCommand(null)).toBeNull();
  });

  it("trims and caps stored notes", () => {
    const command = parseMemoryCommand(`remember   ${"x".repeat(400)}`);
    expect(command.type).toBe("add");
    expect(command.text).toHaveLength(MAX_MEMORY_LENGTH);
  });
});

describe("applyMemoryCommand", () => {
  it("adds a note without mutating the input list", () => {
    const original = [note("I like tea")];
    const result = applyMemoryCommand(original, { type: "add", text: "I use metric units" });

    expect(original).toHaveLength(1);
    expect(result.changed).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.added).toMatchObject({ text: "I use metric units" });
    expect(result.memory).toHaveLength(2);
  });

  it("rejects duplicates case-insensitively", () => {
    const result = applyMemoryCommand([note("I like tea")], { type: "add", text: "i like TEA" });
    expect(result.duplicate).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.memory).toHaveLength(1);
  });

  it("reports a full memory instead of growing past the limit", () => {
    const memory = Array.from({ length: MAX_MEMORIES }, (_, index) => note(`note ${index}`));
    const result = applyMemoryCommand(memory, { type: "add", text: "one more" });
    expect(result.full).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.memory).toHaveLength(MAX_MEMORIES);
  });

  it("forgets matching notes and reports the count", () => {
    const memory = [note("I like green tea"), note("I like coffee"), note("My name is Ada.")];
    const result = applyMemoryCommand(memory, { type: "forget", text: "tea" });

    expect(result.removed).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.memory.map((item) => item.text)).toEqual(["I like coffee", "My name is Ada."]);
  });

  it("forgets everything", () => {
    const result = applyMemoryCommand([note("a"), note("b")], { type: "forget-all" });
    expect(result.removed).toBe(2);
    expect(result.changed).toBe(true);
    expect(result.memory).toEqual([]);
  });

  it("returns an untouched copy for empty input", () => {
    expect(applyMemoryCommand(null, null)).toMatchObject({
      memory: [],
      changed: false,
      added: null,
      removed: 0,
    });
  });
});

describe("buildMemoryPrompt", () => {
  it("returns null when there is nothing to add", () => {
    expect(buildMemoryPrompt([], "hello", null)).toBeNull();
    expect(buildMemoryPrompt(null, "hello", null)).toBeNull();
  });

  it("lists saved notes with a no-recital instruction", () => {
    const prompt = buildMemoryPrompt(
      [note("I like tea"), note("I use metric units")],
      "hello",
      null,
    );
    expect(prompt).toContain("- I like tea");
    expect(prompt).toContain("- I use metric units");
    expect(prompt).toMatch(/never recite the list/i);
  });

  it("describes the outcome of a memory command", () => {
    expect(buildMemoryPrompt([], "remember I like tea", { added: { text: "I like tea" } })).toMatch(
      /confirm it in one short, natural sentence/i,
    );

    expect(buildMemoryPrompt([], "remember I like tea", { duplicate: true })).toMatch(
      /already know/i,
    );

    expect(buildMemoryPrompt([], "remember I like tea", { full: true })).toMatch(/memory is full/i);

    expect(buildMemoryPrompt([note("tea")], "forget tea", { removed: 1 })).toMatch(/was removed/i);

    expect(buildMemoryPrompt([note("tea")], "forget coffee", { removed: 0 })).toMatch(
      /no note matched/i,
    );
  });
});
