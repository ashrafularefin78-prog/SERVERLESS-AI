// Local guardrails for a model-free assistant. Nothing here calls out to a
// model or a network: these are cheap, deterministic checks over text.
//
// Because every reply is produced by local rules and nothing leaves the
// device, "PII redaction" becomes a privacy courtesy: detect sensitive shapes
// in what the user types and warn before it is saved, without blocking. Output
// filtering is handled by the markdown sanitizer (src/markdown.ts), and
// uncertainty is expressed by the calibrated fallbacks in chat/replies.ts.

export type PiiKind = "email" | "phone" | "card" | "ssn" | "secret";

export interface PiiFinding {
  kind: PiiKind;
  label: string;
}

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s*|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\bbearer\s+[A-Za-z0-9._-]{16,}\b/i,
  /\b(?:password|passwd|pwd|api[_-]?key|apikey|secret|token|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9._\-/+=]{6,}/i,
];

const LABELS: Record<PiiKind, string> = {
  email: "an email address",
  phone: "a phone number",
  card: "a payment card number",
  ssn: "a government ID number",
  secret: "a password or API key",
};

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function hasCard(text: string): boolean {
  for (const match of text.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

/** Detect sensitive shapes in text. Returns one finding per kind, in a stable order. */
export function detectPii(text: string): PiiFinding[] {
  const source = String(text ?? "");
  const found = new Set<PiiKind>();
  if (EMAIL.test(source)) found.add("email");
  if (PHONE.test(source)) found.add("phone");
  if (SSN.test(source)) found.add("ssn");
  if (hasCard(source)) found.add("card");
  if (SECRET_PATTERNS.some((pattern) => pattern.test(source))) found.add("secret");

  const order: PiiKind[] = ["secret", "card", "ssn", "phone", "email"];
  return order.filter((kind) => found.has(kind)).map((kind) => ({ kind, label: LABELS[kind] }));
}

function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

/**
 * A short, non-blocking privacy warning for the composer, or null when the text
 * looks clean. The message is still sent and saved locally; this only nudges.
 */
export function piiWarning(text: string): string | null {
  const findings = detectPii(text);
  if (!findings.length) return null;
  return `Looks like ${joinLabels(findings.map((f) => f.label))} — it stays on this device. Double-check before sharing it elsewhere.`;
}

const INJECTION_PATTERNS: RegExp[] = [
  // Override the assistant's own instructions. The `(?! of\b)` guard keeps
  // benign phrases like "ignore the rules of grammar" from matching.
  /\b(?:ignore|disregard|forget|override|bypass|dismiss|skip)\s+(?:all\s+|any\s+|previous\s+|prior\s+|above\s+|your\s+|these\s+|the\s+)*(?:system\s+prompt|instructions?|rules?|prompts?|directives?|guidelines?|programming|restrictions?|safety|filters?|guardrails?)\b(?!\s+of\b)/,
  /\b(?:ignore|disregard|bypass|override|disable)\s+(?:your|the|all)\s+(?:safety|ethical|moral|content)\s+(?:guidelines|filters|rules|training|restrictions|protocols)\b/,
  // Extract the hidden prompt. Requires a system-ish qualifier so "show me the
  // prompt for the play" is not treated as an attack.
  /\b(?:reveal|show|print|repeat|leak|extract|expose|display)\s+(?:me\s+)?(?:your\s+|the\s+system\s+|system\s+|initial\s+|hidden\s+|original\s+|secret\s+)+(?:prompt|instructions?|message|programming)\b/,
  /\bwhat(?:'s| is)\s+(?:your|the)\s+system\s+prompt\b/,
  /\btell me\s+(?:your|the)\s+(?:system\s+|hidden\s+|initial\s+)*(?:prompt|instructions|rules)\b/,
  // Role-play jailbreaks.
  /\b(?:you are now|act as|pretend (?:to be|you are)|roleplay as|become)\s+(?:an?\s+)?(?:dan|unrestricted|uncensored|jailbroken|unfiltered|evil|amoral)\b/,
  /\bdo anything now\b/,
  /\b(?:jailbreak|jailbroken|developer mode|sudo mode|god mode|dan mode)\b/,
  /\b(?:pretend|imagine|act like|assume)\s+(?:you\s+)?(?:have|has|had)\s+no\s+(?:restrictions|rules|limits|limitations|guidelines|filters|ethics|morals)\b/,
  /\byou\s+(?:have|has)\s+no\s+(?:restrictions|rules|limits|limitations|guidelines|filters|ethics|morals)\b/,
  /\bfrom now on\s+you\b[^.]*\b(?:ignore|unrestricted|unfiltered|no restrictions|without restrictions)\b/,
];

/** True when the text looks like a prompt-injection or jailbreak attempt. */
export function detectInjection(text: string): boolean {
  const source = String(text ?? "").toLowerCase();
  return INJECTION_PATTERNS.some((pattern) => pattern.test(source));
}

/** A calm, in-character refusal that redirects to the user's real goal. */
export function injectionRefusal(): string {
  return "I can't set aside my guidelines or hand over my internal instructions — they're part of how I work. I'm glad to keep helping with the actual thing you're after, though. What do you need?";
}
