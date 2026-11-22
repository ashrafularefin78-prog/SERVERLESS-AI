// Deterministic PII redaction for the text this app hands to a model.
//
// Scope, stated plainly: this finds structured identifiers - email addresses,
// phone numbers, card numbers, IBANs, US SSNs, and API tokens - and replaces them
// with stable placeholders such as [EMAIL_1]. It does not find names or addresses;
// that needs a named-entity model, which is a separate download and can be wrong
// in both directions. Nothing here is a guarantee that no personal data reaches a
// model, so the UI wording never says "safe".
//
// Placeholders are stable per value: the fifth mention of the same email is
// [EMAIL_1] again, so the model can still reason about "this address" without
// ever seeing it. Redaction is idempotent: running it twice changes nothing.

export type RedactionKind = "EMAIL" | "PHONE" | "CARD" | "IBAN" | "SSN" | "SECRET" | "IPV4";

export interface RedactionResult {
  text: string;
  /** Placeholder counts by kind, e.g. `{ EMAIL: 2 }`. Never contains a value. */
  counts: Partial<Record<RedactionKind, number>>;
  total: number;
}

const PLACEHOLDER = /\[(EMAIL|PHONE|CARD|IBAN|SSN|SECRET|IPV4)_\d+\]/g;

// Control characters that cannot appear in text a user types. Used to hold values
// aside while the detectors run, then restore them.
const GUARD_OPEN = String.fromCharCode(1);
const GUARD_CLOSE = String.fromCharCode(2);
const GUARD_TOKEN = new RegExp(`${GUARD_OPEN}(\\d+)${GUARD_CLOSE}`, "g");

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function ibanValid(value: string): boolean {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const code = character.charCodeAt(0);
    const chunk = code >= 65 && code <= 90 ? String(code - 55) : character;
    if (!/^\d+$/.test(chunk)) return false;
    for (const digit of chunk) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  // A year range is not a phone number.
  if (/^\d{4}[-/]\d{4}$/.test(value.trim())) return false;
  // Require a country code, parentheses, or an internal separator: a bare run of
  // fourteen digits is usually an account number.
  return /^\+/.test(value.trim()) || /[()]/.test(value) || /[\s.-]/.test(value.trim());
}

interface Detector {
  kind: RedactionKind;
  pattern: RegExp;
  /** Extra structural check; a mismatch leaves the text alone. */
  accept?: (match: string) => boolean;
}

const DETECTORS: Detector[] = [
  { kind: "EMAIL", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  {
    kind: "SECRET",
    // Common key shapes plus JWTs. Deliberately specific: a false positive here
    // would mangle ordinary prose.
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
  },
  {
    kind: "IBAN",
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    accept: ibanValid,
  },
  {
    kind: "CARD",
    pattern: /\b\d(?:[ -]?\d){12,18}\b/g,
    accept: (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    },
  },
  {
    kind: "SSN",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    // 000, 666, and 900-999 are not issued, so leave them for the reader.
    accept: (match) => {
      const area = Number(match.slice(0, 3));
      return area !== 0 && area !== 666 && area < 900;
    },
  },
  {
    kind: "IPV4",
    pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
    accept: (match) => match.split(".").every((part) => Number(part) <= 255),
  },
  {
    // Last on purpose: this is the loosest pattern, so everything more specific
    // must have claimed its text first.
    kind: "PHONE",
    pattern: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d{2,4}[ .-]\d{3,4}(?:[ .-]\d{2,4})?/g,
    accept: validPhone,
  },
];

/**
 * Replace structured identifiers with stable placeholders. Existing placeholders
 * are protected, so passing redacted text back through changes nothing.
 */
export function redactPII(input: string): RedactionResult {
  const source = String(input ?? "");
  if (!source) return { text: source, counts: {}, total: 0 };

  const held: string[] = [];
  const hold = (value: string) => {
    held.push(value);
    return `${GUARD_OPEN}${held.length - 1}${GUARD_CLOSE}`;
  };

  let working = source.replace(PLACEHOLDER, (placeholder) => hold(placeholder));

  const counts: Partial<Record<RedactionKind, number>> = {};
  const assigned = new Map<string, string>();
  let total = 0;

  for (const detector of DETECTORS) {
    // First hold this detector's rejected candidates: a number that looks like a
    // card or an IBAN but fails its checksum is not PII, and it must not be picked
    // up by a looser detector later in the list.
    if (detector.accept) {
      working = working.replace(detector.pattern, (match) => {
        if (detector.accept?.(match)) return match;
        if (match.includes(GUARD_OPEN)) return match;
        return hold(match);
      });
    }

    // Then replace the accepted ones before moving on to the next detector.
    working = working.replace(detector.pattern, (match) => {
      if (detector.accept && !detector.accept(match)) return match;
      if (match.includes(GUARD_OPEN)) return match;
      const key = `${detector.kind}:${match.toLowerCase()}`;
      const existing = assigned.get(key);
      if (existing) return existing;
      counts[detector.kind] = (counts[detector.kind] ?? 0) + 1;
      total += 1;
      const placeholder = `[${detector.kind}_${counts[detector.kind]}]`;
      assigned.set(key, placeholder);
      return placeholder;
    });
  }

  const text = working.replace(GUARD_TOKEN, (_match, index: string) => held[Number(index)] ?? "");

  return { text, counts, total };
}

/** One-line summary for diagnostics. Never includes a matched value. */
export function describeRedaction(result: RedactionResult): string {
  if (!result.total) return "No structured identifiers found.";
  const parts = Object.entries(result.counts)
    .map(([kind, count]) => `${count} ${kind.toLowerCase()}`)
    .join(", ");
  return `Redacted ${result.total} identifier${result.total === 1 ? "" : "s"} (${parts}).`;
}
