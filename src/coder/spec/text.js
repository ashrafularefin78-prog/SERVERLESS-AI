import { expandShorthand, normalizeText } from "../../understand.js";

const UNITS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES = { hundred: 100, thousand: 1000, million: 1000000 };
const WORD = `(?:${[...Object.keys(UNITS), ...Object.keys(TENS), ...Object.keys(SCALES)].join("|")})`;
const NUMBER_WORDS = new RegExp(
  `\\b${WORD}(?:(?:[\\s-]+|(?<=hundred|thousand)\\s+and\\s+)${WORD})*\\b`,
  "g",
);
const ORDINAL_WORDS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const QUOTED = /(^|[\s([{:=,])(["'`])((?:(?!\2)[^\n])+?)\2(?=$|[\s)\]}.,!?:;])/g;
const VERSIONS = [
  /\b(?:python|py|java|jdk|jre|node(?:\.?js)?|golang|go|typescript|ts|kotlin|swift|php|ruby|perl|dart|scala|rust|es|ecmascript|csharp|dotnet|net)\s*v?\d+(?:\.\d+)*\b/g,
  /(?:\.net|c#)\s*\d+(?:\.\d+)*/g,
  /(?:c\+\+|cpp)\s*\d{2}\b/g,
  /\bc(?:89|90|99|11|17|18|23)\b/g,
  /\b\d+\s*-?\s*bits?\b/g,
  /\b[23]-?d\b/g,
];
const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?\b(?!\.\d)|\bn\b/g;
const N = String.raw`(-?\d+(?:\.\d+)?|n)`;
export const COUNT_NOUN = String.raw`(?:(?:different|given|random|positive|negative|natural|whole|real|decimal|floating(?:[\s-]point)?|prime|odd|even|fibonacci|armstrong|perfect|integer)\s+)*(numbers?|nums?|integers?|ints?|values?|elements?|items?|terms?|digits?|floats?|decimals?|doubles?|marks|scores?|subjects?|students?|rows?|lines?|names?|strings?|words?|inputs?|entries|entry|times|primes|multiples|tables?)\b`;
const COUNT_AFTER = new RegExp(`^${COUNT_NOUN}`);
const RANGE_LEAD = /(?:\bfrom|\bbetween|\brange(?:\s+of)?|\bin)$/;
const RANGE_JOIN = new RegExp(
  String.raw`^(?:to|and|till|until|through|thru|up\s*to|upto|-|\.\.)\s*${N}(?![\w.])`,
);
const BARE_JOIN = new RegExp(String.raw`^(?:to|till|until|through|thru|-|\.\.)\s*${N}(?![\w.])`);
const LIMIT_LEAD =
  /(?:\bup\s*to|\bupto|\btill|\buntil|\bthrough|\bthru|\bbelow|\bunder|\bless\s+than|\blesser\s+than|\bsmaller\s+than|\bnot\s+exceeding|\bnot\s+more\s+than|\bwithin|\blimit(?:\s+of)?|<=?|≤)$/;
const EXCLUSIVE = /(?:below|under|less\s+than|lesser\s+than|smaller\s+than|<)$/;
const COUNT_LEAD = /\b(?:first|last|top|next)$/;
const NAME = String.raw`([a-z](?:[a-z_]*\d+)?)`;
const NAMES = new RegExp(
  String.raw`\b(?:numbers?|variables?|integers?|values?|add|sum\s+of|swap|multiply|subtract|divide|compare|of|between)\s+` +
    String.raw`${NAME}\s*(?:,\s*${NAME}\s*,?)?\s*(?:and|&|,)\s*${NAME}(?![\w'])`,
);

function convertNumberWords(text) {
  return text.replace(NUMBER_WORDS, (run, offset, whole) => {
    if (run === "one") {
      const before = whole.slice(Math.max(0, offset - 12), offset);
      const after = whole.slice(offset + 3, offset + 14);
      if (/\b(?:the|this|that|which|each|every|any|no|some|only|a|another)\s+$/.test(before))
        return run;
      if (/^(?:\s+(?:by|of|another|after|more|line)\b|-liner)/.test(after)) return run;
    }
    const out = [];
    let total = 0;
    let current = 0;
    let last = null;
    const flush = () => {
      if (last !== null) out.push(String(total + current));
      total = 0;
      current = 0;
      last = null;
    };
    for (const word of run.split(/[\s-]+/)) {
      if (word === "and") continue;
      if (word in UNITS) {
        if (last === "unit" || (last === "tens" && (UNITS[word] >= 10 || UNITS[word] === 0)))
          flush();
        current += UNITS[word];
        last = "unit";
      } else if (word in TENS) {
        if (last === "unit" || last === "tens") flush();
        current += TENS[word];
        last = "tens";
      } else if (word === "hundred") {
        current = (current || 1) * 100;
        last = "hundred";
      } else {
        total += (current || 1) * SCALES[word];
        current = 0;
        last = "scale";
      }
    }
    flush();
    return out.join(" ");
  });
}

function tokenize(numeric) {
  const tokens = [...numeric.matchAll(NUMBER)].map((m) => ({
    value: m[0] === "n" ? "n" : Number(m[0]),
    raw: m[0],
    start: m.index,
    end: m.index + m[0].length,
    role: "value",
  }));
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const before = numeric.slice(0, tok.start).trimEnd();
    const after = numeric.slice(tok.end).trimStart();
    const count = after.match(COUNT_AFTER);
    if (count) {
      tok.role = "count";
      tok.noun = count[1];
      continue;
    }
    const next = tokens[i + 1];
    const join = (RANGE_LEAD.test(before) ? RANGE_JOIN : BARE_JOIN).exec(after);
    if (join && next && next.raw === join[1]) {
      tok.role = "from";
      next.role = "to";
      next.noun = numeric.slice(next.end).trimStart().match(COUNT_AFTER)?.[1];
      i += 1;
      continue;
    }
    if (LIMIT_LEAD.test(before)) {
      tok.role = "limit";
      tok.exclusive = EXCLUSIVE.test(before);
      continue;
    }
    if (COUNT_LEAD.test(before)) tok.role = "count";
  }
  return tokens;
}

function ordinalOf(numeric) {
  const digits = numeric.match(/\b(\d+)(?:st|nd|rd|th)\b/);
  if (digits) return Number(digits[1]);
  if (/\bnth\b|\bkth\b/.test(numeric)) return "n";
  const word = numeric.match(
    /\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:largest|smallest|highest|lowest|biggest|greatest|maximum|minimum|term|number|element|prime)/,
  );
  return word ? ORDINAL_WORDS[word[1]] : null;
}

export function prepare(prompt) {
  const original = expandShorthand(normalizeText(prompt || ""));
  const quoted = [];
  const masked = original.replace(QUOTED, (match, pre, quote, body) => {
    quoted.push(body);
    return `${pre} qstr${quoted.length - 1} `;
  });
  const text = masked.toLowerCase().replace(/\s+/g, " ").trim();
  let numeric = convertNumberWords(text);
  for (const pattern of VERSIONS) numeric = numeric.replace(pattern, " ");
  numeric = numeric.replace(/\s+/g, " ");
  const tokens = tokenize(numeric);
  const role = (name) => tokens.filter((tok) => tok.role === name);
  const from = role("from")[0];
  const to = role("to")[0];
  const limit = role("limit")[0];
  const names = text.match(NAMES);
  return {
    original,
    text,
    numeric,
    quoted,
    tokens,
    values: role("value").map((tok) => tok.value),
    literals: tokens.filter((tok) => tok.role !== "count").map((tok) => tok.value),
    counts: role("count"),
    range: from && to ? { from: from.value, to: to.value, noun: to.noun } : null,
    limit: limit ? { value: limit.value, exclusive: limit.exclusive } : null,
    ordinal: ordinalOf(numeric),
    names: names ? names.slice(1).filter(Boolean) : [],
  };
}

export function countOf(ctx, nouns) {
  const match = ctx.counts.find((tok) => !tok.noun || nouns.test(tok.noun));
  return match ? match.value : null;
}

export const has = (ctx, pattern) => pattern.test(ctx.text);
