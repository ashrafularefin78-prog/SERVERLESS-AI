import { describe, expect, it } from "vitest";
import { buildDemoReply, generateDemo } from "../../src/engine/demo.js";

const added = (text) => ({
  memory: [],
  changed: true,
  added: { id: "1", text, addedAt: 1 },
  removed: 0,
  duplicate: false,
  full: false,
});

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe("buildDemoReply", () => {
  it("answers ordinary conversation through the reply rules", () => {
    expect(buildDemoReply({ prompt: "what is 6 * 7" })).toBe("That's 42.");
  });

  it("confirms a new name in a natural sentence", () => {
    expect(
      buildDemoReply({
        prompt: "my name is Ada",
        memoryOutcome: added("The user's name is Ada."),
      }),
    ).toBe("Nice to meet you, Ada. I'll remember your name on this device.");
  });

  it("confirms a saved note and explains where it lives", () => {
    const text = buildDemoReply({
      prompt: "remember that I like tea",
      memoryOutcome: added("I like tea"),
    });
    expect(text).toContain("Got it, I'll remember that I like tea");
    expect(text).toContain("Settings, Memory");
  });

  it("explains duplicate, full, and unmatched outcomes", () => {
    expect(
      buildDemoReply({
        prompt: "remember I like tea",
        memoryOutcome: { duplicate: true, removed: 0 },
      }),
    ).toMatch(/already have that note/);

    expect(
      buildDemoReply({
        prompt: "remember I like tea",
        memoryOutcome: { full: true, removed: 0 },
      }),
    ).toMatch(/memory is full/);

    expect(
      buildDemoReply({
        prompt: "forget coffee",
        memoryOutcome: { removed: 0, duplicate: false, full: false },
      }),
    ).toMatch(/nothing to forget/);
  });

  it("reports how many notes were forgotten", () => {
    expect(
      buildDemoReply({
        prompt: "forget tea",
        memoryOutcome: { removed: 2, duplicate: false, full: false },
      }),
    ).toContain("2 notes matching that");
  });

  it.each([
    "Explain the TCP handshake",
    "What were the main causes of WWI?",
    "Explain SQL injection",
    "Compare symmetric and asymmetric encryption",
  ])("offers an on-device model for unsupported knowledge: %s", (prompt) => {
    const reply = buildDemoReply({ prompt });
    expect(reply).toContain("built-in rules cannot explain");
    expect(reply).toContain("[[LOAD_ON_DEVICE_MODEL]]");
    expect(reply).not.toContain("What made you bring it up?");
  });

  it("does not override a mode-specific builder", () => {
    const custom = () => "custom coder answer";
    expect(buildDemoReply({ prompt: "Explain the TCP handshake", buildDemoReply: custom })).toBe(
      "custom coder answer",
    );
  });

  it("uses a mode-specific builder when one is provided", () => {
    const custom = () => "custom coder answer";
    expect(buildDemoReply({ prompt: "write a C program", buildDemoReply: custom })).toBe(
      "custom coder answer",
    );
    expect(buildDemoReply({ prompt: "hello" })).toMatch(/quiet start/);
  });
});

describe("generateDemo", () => {
  it("streams the reply word by word and ends with usage", async () => {
    const messages = [
      { role: "system", content: "test" },
      { role: "user", content: "hello" },
    ];
    const chunks = await collect(generateDemo(messages, undefined, null, { delayMs: 0 }));
    const text = chunks.map((chunk) => chunk.text || "").join("");

    expect(text).toBe(buildDemoReply({ prompt: "hello", messages }));
    expect(chunks.every((chunk) => typeof chunk.text === "string" || chunk.usage)).toBe(true);
    expect(chunks.at(-1).usage.completion_tokens).toBeGreaterThan(0);
  });

  it("passes memory notes and outcomes through to the reply builder", async () => {
    const chunks = await collect(
      generateDemo(
        [{ role: "user", content: "remember I like tea" }],
        undefined,
        { memory: [], memoryOutcome: added("I like tea") },
        { delayMs: 0 },
      ),
    );
    expect(chunks.map((chunk) => chunk.text || "").join("")).toContain("Got it, I'll remember");
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const chunks = await collect(
      generateDemo([{ role: "user", content: "hello" }], controller.signal, null, { delayMs: 0 }),
    );
    expect(chunks).toEqual([]);
  });

  it("stops yielding after cancellation mid-stream", async () => {
    const controller = new AbortController();
    const chunks = [];
    for await (const chunk of generateDemo(
      [{ role: "user", content: "hello" }],
      controller.signal,
      null,
      { delayMs: 0 },
    )) {
      chunks.push(chunk);
      controller.abort();
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBeTruthy();
  });
});
