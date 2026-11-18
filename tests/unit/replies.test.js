import { describe, expect, it } from "vitest";
import { demoChatReply } from "../../src/chat/replies.js";

const noon = new Date(2026, 0, 15, 12, 0, 0);
const reply = (prompt, options = {}) => demoChatReply({ prompt, now: noon, ...options });

describe("demoChatReply", () => {
  it("greets by name from memory and stays deterministic with a fixed clock", () => {
    const text = reply("hello", { memory: [{ text: "The user's name is Ada." }] });
    expect(text).toBe(
      "Hey, Ada. The afternoon is off to a quiet start on my side. What's on your mind?",
    );
  });

  it("answers the empty prompt safely", () => {
    expect(reply("")).toBe("I'm here. What's on your mind?");
  });

  it("describes itself honestly", () => {
    expect(reply("who are you")).toContain("LocalMind");
    expect(reply("can you browse the internet?")).toMatch(/can't browse|No/);
  });

  it("does simple arithmetic without eval", () => {
    expect(reply("what is 2 + 3")).toBe("That's 5.");
    expect(reply("10% of 250")).toBe("That's 25.");
  });

  it("tells a joke and offers another", () => {
    expect(reply("tell me a joke")).toMatch(/Want another\?$/);
  });

  it("responds to a rough day with care before solving", () => {
    expect(reply("I had a rough day")).toMatch(/draining/);
  });

  it("handles a crisis message with immediate safety guidance", () => {
    expect(reply("I want to kill myself")).toMatch(/crisis line/);
  });

  it("generates a complete C example for a coding request", () => {
    const text = reply("write a C program to add two numbers");
    expect(text).toContain("```c");
    expect(text).toContain("#include <stdio.h>");
    expect(text).toContain("int main");
  });

  it("recalls a saved name", () => {
    expect(reply("what's my name", { memory: [{ text: "The user's name is Ada." }] })).toBe(
      "You're Ada.",
    );
  });

  it("lists saved notes when asked", () => {
    const text = reply("what do you remember about me", {
      memory: [{ text: "I like tea" }, { text: "I use metric units" }],
    });
    expect(text).toContain("I have 2 notes");
    expect(text).toContain("- I like tea");
    expect(text).toContain("- I use metric units");
  });

  it("expands shorthand before matching rules", () => {
    expect(reply("pls tell me a joke")).toMatch(/Want another\?$/);
  });

  it("does not pretend to know live information", () => {
    expect(reply("what's the weather tomorrow?")).toMatch(/cannot pull live weather/i);
    expect(reply("what is the capital of France?")).toMatch(
      /don't want to invent|outside what I can answer/i,
    );
  });
});
