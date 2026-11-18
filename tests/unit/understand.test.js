import { describe, expect, it } from "vitest";
import {
  analyzeIntent,
  expandShorthand,
  normalizeText,
  understandingHint,
} from "../../src/understand.js";

describe("normalizeText", () => {
  it("removes invisible characters and normalizes smart punctuation", () => {
    const messy = "\u200b  \u201chello\u201d\u2026  \u2018world\u2019 \u2014 ok\u200d  ";
    expect(normalizeText(messy)).toBe("\"hello\"...  'world' - ok");
  });

  it("normalizes line endings and collapses redundant blank lines", () => {
    expect(normalizeText("one\r\ntwo\r\n\r\n\r\nthree   \r\n")).toBe("one\ntwo\n\nthree");
    expect(normalizeText("a  \n b\t\n")).toBe("a\n b");
  });

  it("handles non-string and empty input", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText(42)).toBe("42");
  });
});

describe("expandShorthand", () => {
  it("expands common chat shorthand", () => {
    expect(expandShorthand("pls dont be late, thx")).toBe("please don't be late, thanks");
    expect(expandShorthand("idk imo btw")).toBe("I don't know in my opinion by the way");
  });

  it("leaves fenced blocks and inline code untouched", () => {
    const input = "pls fix `doesnt`\n```js\n// pls dont\nexport const idk = true;\n```";
    expect(expandShorthand(input)).toBe(
      "please fix `doesnt`\n```js\n// pls dont\nexport const idk = true;\n```",
    );
  });
});

describe("analyzeIntent", () => {
  it.each([
    ["hi", "smalltalk"],
    ["good morning", "smalltalk"],
    ["I had a rough day at work", "emotion"],
    ["I'm feeling stressed", "emotion"],
    ["Why does this Python script fail with a traceback?", "bug"],
    ["What is the capital of France?", "question"],
    ["Write a haiku about rain", "request"],
  ])("classifies %j as %s", (text, kind) => {
    expect(analyzeIntent(text)).toEqual({ kind, vague: false });
  });

  it("flags underspecified problem reports", () => {
    expect(analyzeIntent("it doesn't work")).toEqual({ kind: "bug", vague: true });
    expect(analyzeIntent("help")).toEqual({ kind: "request", vague: true });
    expect(analyzeIntent("the code is broken")).toEqual({ kind: "bug", vague: true });
  });

  it("does not flag a report that includes code", () => {
    const text = "it doesn't work\n```js\nconst value = 1;\n```";
    expect(analyzeIntent(text)).toEqual({ kind: "bug", vague: false });
  });
});

describe("understandingHint", () => {
  it("asks one targeted question only for vague messages", () => {
    expect(understandingHint({ vague: true })).toMatch(/ask one short, targeted question/i);
    expect(understandingHint({ vague: false })).toBeNull();
    expect(understandingHint(null)).toBeNull();
  });
});
