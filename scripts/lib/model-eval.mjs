// Pure scoring logic for the on-device model eval harness.
//
// Model output is never compared byte-for-byte: each golden case asserts
// properties (length, language, formatting, refusal behaviour) that should
// survive a prompt change, a model swap or a quantisation change.

const LANGUAGE_MARKERS = {
  es: {
    chars: /[áéíóúñ¿¡]/i,
    words: ["que", "de", "la", "el", "es", "una", "para", "con", "por", "como"],
  },
  pl: {
    chars: /[ąćęłńóśźż]/i,
    words: ["jest", "się", "nie", "to", "które", "oraz", "dla", "są", "czym"],
  },
};

const DEFAULT_LIMITS = {
  latencyFactor: 1.5,
  verbosityFactor: 1.4,
};

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function wordCount(text, word) {
  const pattern = new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "iu");
  return pattern.test(text) ? 1 : 0;
}

/** Count sentence-ending groups without splitting abbreviations in the middle. */
export function countSentences(text) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return 0;
  return normalized
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function detectLanguage(text, language) {
  const markers = LANGUAGE_MARKERS[language];
  if (!markers) return false;
  if (markers.chars.test(text)) return true;
  const haystack = lower(text);
  const hits = markers.words.reduce((total, word) => total + wordCount(haystack, word), 0);
  return hits >= 2;
}

/**
 * Score one recorded reply against its case properties.
 * @param {{id: string, expect?: Record<string, unknown>}} testCase
 * @param {{replyText?: string, hasCodeBlock?: boolean, ms?: number}} result
 */
export function evaluateCase(testCase, result) {
  const expect = testCase.expect || {};
  const text = String(result?.replyText ?? "");
  const failures = [];

  if (!text.trim()) failures.push("empty reply");

  if (expect.minChars != null && text.length < expect.minChars) {
    failures.push(`too short: ${text.length} < ${expect.minChars}`);
  }
  if (expect.maxChars != null && text.length > expect.maxChars) {
    failures.push(`too long: ${text.length} > ${expect.maxChars}`);
  }

  const sentences = countSentences(text);
  if (expect.maxSentences != null && sentences > expect.maxSentences) {
    failures.push(`too many sentences: ${sentences} > ${expect.maxSentences}`);
  }

  const haystack = lower(text);
  for (const needle of expect.contains || []) {
    if (!haystack.includes(lower(needle))) failures.push(`missing: ${needle}`);
  }
  for (const needle of expect.notContains || []) {
    if (haystack.includes(lower(needle))) failures.push(`must not contain: ${needle}`);
  }

  if (expect.matches) {
    try {
      if (!new RegExp(expect.matches, "i").test(text)) failures.push(`no match: ${expect.matches}`);
    } catch {
      failures.push(`invalid pattern: ${expect.matches}`);
    }
  }

  if (expect.language && !detectLanguage(text, expect.language)) {
    failures.push(`expected language: ${expect.language}`);
  }

  if (expect.codeBlock === true && !result?.hasCodeBlock) {
    failures.push("expected a fenced code block");
  }
  if (expect.codeBlock === false && result?.hasCodeBlock) {
    failures.push("did not expect a code block");
  }

  return {
    id: testCase.id,
    passed: failures.length === 0,
    failures,
    chars: text.length,
    sentences,
    ms: Number.isFinite(result?.ms) ? result.ms : null,
  };
}

/** Aggregate pass rate, length and latency for a run. */
export function summarize(results) {
  const total = results.length || 1;
  const passed = results.filter((result) => result.passed).length;
  const chars = results.map((result) => result.chars);
  const times = results
    .map((result) => result.ms)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const p95Index = times.length
    ? Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)
    : -1;

  return {
    total: results.length,
    passed,
    passRate: passed / total,
    meanChars: Math.round(chars.reduce((sum, value) => sum + value, 0) / total),
    meanMs: times.length
      ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length)
      : null,
    p95Ms: p95Index >= 0 ? times[p95Index] : null,
  };
}

/**
 * Compare a run with the stored baseline.
 * Returns regressions (must fail CI), improvements, and whether the model changed.
 */
export function compareRuns(baseline, current, limits = {}) {
  const { latencyFactor, verbosityFactor } = { ...DEFAULT_LIMITS, ...limits };
  const regressions = [];
  const improvements = [];

  if (!baseline || !current) {
    return { regressions: ["missing baseline or current run"], improvements, modelChanged: false };
  }

  const modelChanged =
    Boolean(baseline.modelId) && Boolean(current.modelId) && baseline.modelId !== current.modelId;
  if (modelChanged) {
    regressions.push(
      `model changed: ${baseline.modelId} -> ${current.modelId}; re-record the baseline`,
    );
  }

  const baselineCases = baseline.cases || {};
  const currentCases = current.cases || {};

  for (const [id, previous] of Object.entries(baselineCases)) {
    const next = currentCases[id];
    if (!next) {
      regressions.push(`case missing from run: ${id}`);
      continue;
    }
    if (previous.passed && !next.passed) {
      regressions.push(`case regressed: ${id} (${(next.failures || []).join("; ") || "failed"})`);
    }
    if (!previous.passed && next.passed) improvements.push(`case fixed: ${id}`);
  }

  for (const id of Object.keys(currentCases)) {
    if (!(id in baselineCases)) improvements.push(`new case: ${id}`);
  }

  if (Number.isFinite(baseline.passRate) && current.passRate < baseline.passRate - 1e-9) {
    regressions.push(
      `pass rate dropped: ${(baseline.passRate * 100).toFixed(0)}% -> ${(current.passRate * 100).toFixed(0)}%`,
    );
  }

  if (
    Number.isFinite(baseline.p95Ms) &&
    baseline.p95Ms > 0 &&
    Number.isFinite(current.p95Ms) &&
    current.p95Ms > baseline.p95Ms * latencyFactor
  ) {
    regressions.push(
      `p95 latency regressed: ${baseline.p95Ms} ms -> ${current.p95Ms} ms (> ${latencyFactor}x)`,
    );
  }

  if (
    Number.isFinite(baseline.meanChars) &&
    baseline.meanChars > 0 &&
    current.meanChars > baseline.meanChars * verbosityFactor
  ) {
    regressions.push(
      `replies got longer: ${baseline.meanChars} -> ${current.meanChars} chars (> ${verbosityFactor}x)`,
    );
  }

  return { regressions, improvements, modelChanged };
}

/** Human-readable table for the CLI. */
export function formatResults(results) {
  const rows = results.map((result) => {
    const status = result.passed ? "PASS" : "FAIL";
    const timing = result.ms == null ? "-" : `${result.ms} ms`;
    const reason = result.passed ? "" : `  ${result.failures.join("; ")}`;
    return `${status}  ${result.id.padEnd(28)} ${String(result.chars).padStart(5)} chars  ${timing.padStart(9)}${reason}`;
  });
  return rows.join("\n");
}
