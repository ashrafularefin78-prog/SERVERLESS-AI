import { describe, expect, it } from "vitest";
import cases from "./cases.json";
import {
  demoChatReply,
  isUnsupportedKnowledgeQuestion,
  modelUpgradeReply,
} from "../../src/chat/replies.js";
import { demoCodingReply } from "../../src/coder/languages.js";

const FIXED_NOW = new Date("2026-11-18T14:00:00");

function resolve(testCase) {
  if (testCase.mode === "coder") return demoCodingReply({ prompt: testCase.prompt });
  if (isUnsupportedKnowledgeQuestion(testCase.prompt)) return modelUpgradeReply();
  return demoChatReply({
    prompt: testCase.prompt,
    messages: testCase.messages || [],
    memory: testCase.memory || [],
    now: testCase.now ? new Date(testCase.now) : FIXED_NOW,
  });
}

function assertProperties(reply, expectSpec) {
  for (const needle of expectSpec.contains || []) expect(reply).toContain(needle);
  for (const needle of expectSpec.notContains || []) expect(reply).not.toContain(needle);
  if (expectSpec.matches) expect(reply).toMatch(new RegExp(expectSpec.matches));
  if (expectSpec.minLength) expect(reply.length).toBeGreaterThanOrEqual(expectSpec.minLength);
  if (expectSpec.equals) expect(reply).toBe(expectSpec.equals);
}

describe("golden evals", () => {
  it.each(cases)("$id", (testCase) => {
    const first = resolve(testCase);
    const second = resolve(testCase);
    expect(second).toBe(first); // deterministic repeatability
    assertProperties(first, testCase.expect);
  });
});

describe("eval latency", () => {
  it("resolves every case within a generous local-rule budget", () => {
    const timings = cases.map((testCase) => {
      const started = performance.now();
      resolve(testCase);
      return { id: testCase.id, ms: performance.now() - started };
    });
    const mean = timings.reduce((sum, t) => sum + t.ms, 0) / timings.length;
    const max = Math.max(...timings.map((t) => t.ms));
    console.log(
      `\nEval latency: mean ${mean.toFixed(2)} ms, max ${max.toFixed(2)} ms over ${timings.length} cases`,
    );
    expect(mean).toBeLessThan(25);
    expect(max).toBeLessThan(250);
  });
});
