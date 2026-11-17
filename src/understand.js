// Deterministic reading of messy human input: unicode cleanup, chat shorthand
// expansion, and a coarse intent read. History keeps the original text; only
// the copy sent to the model is normalized.

const SHORTHAND = [
  [/\b(?:pls|plz|pleas)\b/gi, "please"],
  [/\b(?:thx|tnx|ty)\b/gi, "thanks"],
  [/\bur\b/gi, "your"],
  [/\bidk\b/gi, "I don't know"],
  [/\bimo\b/gi, "in my opinion"],
  [/\bimho\b/gi, "in my humble opinion"],
  [/\bbtw\b/gi, "by the way"],
  [/\bafaik\b/gi, "as far as I know"],
  [/\bw\/o\b/gi, "without"],
  [/\bw\/\b/gi, "with"],
  [/\bb4\b/gi, "before"],
  [/\bcuz\b/gi, "because"],
  [/\bdont\b/gi, "don't"],
  [/\bcant\b/gi, "can't"],
  [/\bwont\b/gi, "won't"],
  [/\bisnt\b/gi, "isn't"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bdidnt\b/gi, "didn't"],
  [/\bive\b/gi, "I've"],
  [/\bim\b/gi, "I'm"],
  [/\bwhats\b/gi, "what's"],
  [/\bthats\b/gi, "that's"],
];

export function normalizeText(text) {
  // The character classes below hold invisible literals: zero-width chars,
  // smart quotes, ellipsis, and en/em dashes.
  return String(text ?? "")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fenced blocks and inline code spans are left untouched so identifiers and
// string literals are never rewritten.
function mapProse(text, fn) {
  return String(text)
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, index) => (index % 2 === 1 ? part : fn(part)))
    .join("");
}

export function expandShorthand(text) {
  return mapProse(text, (prose) => {
    let out = prose;
    for (const [pattern, replacement] of SHORTHAND) out = out.replace(pattern, replacement);
    return out;
  });
}

export function analyzeIntent(text) {
  const raw = String(text ?? "");
  const t = expandShorthand(normalizeText(raw)).toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  const hasCode = /```/.test(raw) || /`[^`\n]+`/.test(raw);
  const hasDetail =
    /```|\b[a-z_]+\.(py|js|ts|c|cpp|go|rs|java|rb|php|sql|sh)\b|\b(typeerror|syntaxerror|referenceerror|nullpointer|segfault|segmentation fault|traceback|exception|errno|exit code|panic)\b|:\s*\S/.test(t);

  if (
    /^(hi|hiya|hello|hey|yo|howdy|thanks|thank you|thx|bye|goodbye|good (morning|afternoon|evening|night))\b/.test(t) ||
    /\bhow are you\b/.test(t)
  ) {
    return { kind: "smalltalk", vague: false };
  }

  if (
    /\b(i'm|i am|feeling|feel) (sad|down|stressed|anxious|exhausted|tired|upset|happy|excited|thrilled)\b|\brough (day|week|morning|night)\b|\bbad day\b|\bgood news\b/.test(t)
  ) {
    return { kind: "emotion", vague: false };
  }

  const bareHelp = /^(?:please\s+)?(?:help|fix it|fix this)\s*[.!?]*$/.test(t);
  const referential = /^(?:please\s+)?(?:it|this|that|the code|my code)\b/.test(t);
  const problem = /\b(broken|wrong|fails?|failing|doesn't work|does not work|won't work|not working|crash\w*|bug\w*|errors?)\b/.test(t);

  if (bareHelp || (referential && problem && words.length <= 9 && !hasCode && !hasDetail)) {
    return { kind: problem || /\bfix(?:es|ing)?\b/.test(t) ? "bug" : "request", vague: true };
  }

  if (/\b(error|exception|traceback|crash\w*|segfault|panic|bug|broken|doesn't work|not working|wrong output|fails?)\b/.test(t)) {
    return { kind: "bug", vague: false };
  }

  if (/\?\s*$/.test(t) || /^(what|why|how|when|where|who|which|is|are|does|do|should|can|could)\b/.test(t)) {
    return { kind: "question", vague: false };
  }

  return { kind: "request", vague: false };
}

export function understandingHint(intent) {
  if (intent?.vague) {
    return "The latest message is underspecified: it points at a problem without giving code, an error, or a concrete goal. Ask one short, targeted question to get what you need before guessing.";
  }
  return null;
}