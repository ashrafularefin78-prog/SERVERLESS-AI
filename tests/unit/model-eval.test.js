import { describe, expect, it } from "vitest";
import {
  compareRuns,
  countSentences,
  detectLanguage,
  evaluateCase,
  summarize,
} from "../../scripts/lib/model-eval.mjs";
import cases from "../evals/model/cases.json";

const baseCase = {
  id: "sample",
  prompt: "hello",
  expect: { minChars: 3, maxChars: 40, contains: ["hello"], notContains: ["goodbye"] },
};

describe("golden model cases", () => {
  it("has unique ids and a prompt and expectations for every case", () => {
    const ids = new Set();
    for (const testCase of cases) {
      expect(typeof testCase.id, "case id").toBe("string");
      expect(testCase.prompt.length).toBeGreaterThan(0);
      expect(testCase.expect, `${testCase.id} expectations`).toBeTruthy();
      expect(ids.has(testCase.id), `duplicate ${testCase.id}`).toBe(false);
      ids.add(testCase.id);
    }
  });
});

describe("evaluateCase", () => {
  it("passes a reply that meets every property", () => {
    const result = evaluateCase(baseCase, {
      replyText: "Hello there.",
      hasCodeBlock: false,
      ms: 12,
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.ms).toBe(12);
  });

  it("reports length, content and formatting failures", () => {
    const result = evaluateCase(
      { ...baseCase, expect: { ...baseCase.expect, maxChars: 4, notContains: ["hello"] } },
      { replyText: "Hello there goodbye" },
    );
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("too long");
    expect(result.failures.join(" ")).toContain("must not contain: hello");
  });

  it("requires a rendered code block when asked", () => {
    const result = evaluateCase(
      { id: "code", prompt: "code", expect: { codeBlock: true } },
      { replyText: "def f():\n    pass" },
    );
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("expected a fenced code block");
  });

  it("flags empty replies", () => {
    const result = evaluateCase({ id: "empty", prompt: "x", expect: {} }, { replyText: "   " });
    expect(result.failures).toContain("empty reply");
  });

  it("matches case-insensitively and reports invalid patterns", () => {
    expect(
      evaluateCase({ id: "ci", expect: { contains: ["HELLO"] } }, { replyText: "hello" }).passed,
    ).toBe(true);
    const invalid = evaluateCase({ id: "re", expect: { matches: "(" } }, { replyText: "hello" });
    expect(invalid.failures.join(" ")).toContain("invalid pattern");
  });
});

describe("language detection", () => {
  it("recognises Spanish and Polish text", () => {
    expect(
      detectLanguage(
        "La fotosíntesis es el proceso por el que las plantas producen energía.",
        "es",
      ),
    ).toBe(true);
    expect(
      detectLanguage(
        "Sztuczna inteligencja jest dziedziną informatyki, która zajmuje się uczeniem maszyn.",
        "pl",
      ),
    ).toBe(true);
  });

  it("rejects English text for Spanish", () => {
    expect(detectLanguage("The cat sat on the mat and looked outside.", "es")).toBe(false);
  });
});

describe("countSentences", () => {
  it("counts sentence groups and ignores empty input", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("")).toBe(0);
  });
});

describe("summarize", () => {
  it("aggregates pass rate, length and latency", () => {
    const metrics = summarize([
      { passed: true, chars: 10, ms: 100 },
      { passed: false, chars: 20, ms: 200 },
      { passed: true, chars: 30, ms: 300 },
    ]);
    expect(metrics.passRate).toBeCloseTo(2 / 3);
    expect(metrics.meanChars).toBe(20);
    expect(metrics.p95Ms).toBe(300);
  });
});

describe("compareRuns", () => {
  const baseline = {
    modelId: "model-a",
    passRate: 1,
    meanChars: 100,
    p95Ms: 1000,
    cases: { a: { passed: true }, b: { passed: true } },
  };
  const current = {
    modelId: "model-a",
    passRate: 1,
    meanChars: 100,
    p95Ms: 1000,
    cases: { a: { passed: true }, b: { passed: true } },
  };

  it("passes an unchanged run", () => {
    expect(compareRuns(baseline, current).regressions).toEqual([]);
  });

  it("fails a flipped case and a lower pass rate", () => {
    const result = compareRuns(baseline, {
      ...current,
      passRate: 0.5,
      cases: { a: { passed: true }, b: { passed: false, failures: ["too long"] } },
    });
    expect(result.regressions.join(" ")).toContain("case regressed: b");
    expect(result.regressions.join(" ")).toContain("pass rate dropped");
  });

  it("fails latency and verbosity regressions", () => {
    const result = compareRuns(baseline, { ...current, p95Ms: 2000, meanChars: 200 });
    expect(result.regressions.join(" ")).toContain("p95 latency regressed");
    expect(result.regressions.join(" ")).toContain("replies got longer");
  });

  it("requires a new baseline when the model changes", () => {
    const result = compareRuns(baseline, { ...current, modelId: "model-b" });
    expect(result.modelChanged).toBe(true);
    expect(result.regressions.join(" ")).toContain("model changed");
  });

  it("reports fixes and new cases as improvements", () => {
    const result = compareRuns(
      { ...baseline, passRate: 0.5, cases: { a: { passed: false } } },
      { ...current, cases: { a: { passed: true }, c: { passed: true } } },
    );
    expect(result.improvements.join(" ")).toContain("case fixed: a");
    expect(result.improvements.join(" ")).toContain("new case: c");
  });

  it("fails a missing case", () => {
    const result = compareRuns(baseline, { ...current, cases: { a: { passed: true } } });
    expect(result.regressions.join(" ")).toContain("case missing from run: b");
  });
});
