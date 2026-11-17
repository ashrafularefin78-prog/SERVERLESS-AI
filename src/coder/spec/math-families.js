import { countOf } from "./text.js";
import { CHECKING, COUNTING, STRINGY } from "./families.js";

const NUMBERY = /\b(?:numbers?|integers?|ints?|digits?|values?|nums?|floats?|decimals?)\b/;
const ITEMS = /numbers?|integers?|ints?|values?|elements?|inputs?|nums?|floats?|decimals?|doubles?|items?|marks|scores?|entries|entry/;
const SUMMING = /\b(?:sum|summation|total|add|adds|adding|addition)\b/;

function listing(ctx, plural = /numbers|primes/) {
  if (ctx.range || ctx.limit) return true;
  if (ctx.counts.some((tok) => tok.noun && /numbers?|primes|terms?|values|elements/.test(tok.noun))) return true;
  if (/\b(?:all|list|series|sequence|between|generate)\b/.test(ctx.text)) return true;
  return new RegExp(String.raw`\b(?:print|display|show|find|output)\s+(?:the\s+|all\s+)?(?:\w+\s+){0,2}(?:${plural.source})\b`).test(ctx.text);
}

const PROPERTIES = [
  ["armstrong", /\barmstrong\b|\bnarcissistic\b/],
  ["perfect-square", /\bperfect\s+squares?\b/],
  ["perfect", /\bperfect\b(?!\s+(?:square|cube|power))/],
  ["strong", /\bstrong\s+(?:numbers?|or\s+not)\b|\bkrishnamurthy\b|\bpeterson\s+numbers?\b/],
  ["neon", /\bneon\b/],
  ["harshad", /\bharshad\b|\bniven\b/],
  ["automorphic", /\bautomorphic\b/],
  ["spy", /\bspy\s+(?:numbers?|or\s+not)\b/],
];

function numberProperty(ctx) {
  const hit = PROPERTIES.find(([, re]) => re.test(ctx.text));
  if (!hit) return null;
  return { kind: hit[0], list: listing(ctx, /numbers|squares/) && !(CHECKING.test(ctx.text) && !ctx.range && !ctx.limit) };
}

function prime(ctx) {
  const x = ctx.text;
  if (!/\bprimes?\b|\bprimality\b|\bsieve\b|\beratosthenes\b/.test(x)) return null;
  const list = /\bsieve\b|\beratosthenes\b/.test(x) || (listing(ctx) && !(CHECKING.test(x) && !ctx.range && !ctx.limit && !ctx.counts.length));
  return {
    mode: list ? "list" : "check",
    count: countOf(ctx, /numbers?|primes/),
    sum: list && SUMMING.test(x),
    tally: list && /\b(?:count|how\s+many|number\s+of)\b/.test(x),
    sieve: /\bsieve\b|\beratosthenes\b/.test(x),
  };
}

function fibonacci(ctx) {
  const x = ctx.text;
  if (!/\bfibonacci\b|\bfib\b|\bfibo\b/.test(x)) return null;
  const nth = ctx.ordinal ?? (/\bn[\s-]?th\b/.test(x) ? "n" : null);
  if (nth !== null || /\b(?:term|number|element)\s+at\s+(?:position|index)\b/.test(x)) return { mode: "nth", n: nth ?? ctx.values[0] ?? null };
  if (CHECKING.test(x) && /\bfibonacci\s+(?:number|or\s+not)\b/.test(x) && !/\bseries\b|\bsequence\b/.test(x)) return { mode: "check" };
  let terms = countOf(ctx, /terms?|numbers?|elements?|values?/);
  let limit = null;
  if (terms === null && ctx.limit) {
    const { value, exclusive } = ctx.limit;
    if (value !== "n" && (exclusive || value > 30 || /\b(?:value|max(?:imum)?)\b/.test(x))) limit = ctx.limit;
    else terms = value;
  }
  if (terms === null && !limit && ctx.range) limit = { value: ctx.range.to, exclusive: false };
  if (terms === null && !limit) terms = ctx.values[0] ?? null;
  return { mode: "series", terms, limit, sum: SUMMING.test(x) };
}

function gcd(ctx) {
  const x = ctx.text;
  const g = /\bgcd\b|\bhcf\b|\b(?:greatest|highest)\s+common\s+(?:divisor|factor)\b/.test(x);
  const l = /\blcm\b|\b(?:least|lowest|smallest)\s+common\s+multiple\b/.test(x);
  return g || l ? { gcd: g || !l, lcm: l } : null;
}

function root(ctx) {
  if (/\bcube\s+roots?\b|\bcbrt\b/.test(ctx.text)) return { kind: "cube" };
  if (/\bsquare\s+roots?\b|\bsqrt\b/.test(ctx.text)) return { kind: "square" };
  return null;
}

function power(ctx) {
  const x = ctx.text;
  if (/\bsquares?\s+(?:and|&)\s+cubes?\b/.test(x)) return { exponent: null, both: true, list: Boolean(ctx.range || ctx.limit) };
  const fixed = /\bcubes?\s+of\b|\bcubes?\b(?=.*\bnumbers?\b)/.test(x) ? 3 : /\bsquares?\s+of\b|\bsquares?\b(?=.*\bnumbers?\b)/.test(x) ? 2 : null;
  if (fixed) return { exponent: fixed, list: Boolean(ctx.range || ctx.limit) };
  if (/\bpower\b|\braised\s+to\b|\bexponent(?:s|iation|ial)?\b|\bto\s+the\s+power\b|\^|\*\*/.test(x)) return { exponent: null, list: false };
  return null;
}

function digitSum(ctx) {
  const x = ctx.text;
  if (/\bproduct\s+of\s+(?:the\s+|its\s+|all\s+)?digits\b/.test(x)) return { op: "product" };
  if (/\bsum\b[^.]{0,30}\bfirst\s+and\s+last\s+digits?\b/.test(x)) return { op: "first-last" };
  if (!/\b(?:sum|add|adding|addition|total)\b[^.\n]{0,40}\bdigits?\b|\bdigits?\b[^.\n]{0,40}\bsum\b/.test(x)) return null;
  if (/\bdigits?\s+(?:in|of|from)\s+(?:a\s+|the\s+)?strings?\b/.test(x)) return null;
  return { op: "sum", repeat: /\bsingle\s+digit\b|\bdigital\s+root\b|\buntil\b/.test(x) };
}

function reverse(ctx, flags) {
  const x = ctx.text;
  if (!/\brevers\w*\b/.test(x)) return null;
  if (/\breverse\s+order\b/.test(x) && (ctx.range || ctx.limit || /\bnatural\s+numbers\b/.test(x)) && !flags.array) {
    return { family: "print-range", filter: "all", descending: true };
  }
  if (flags.array && !/\bstrings?\b/.test(x)) return { target: "array" };
  if (/\b(?:words|order\s+of\s+(?:the\s+)?words|each\s+word|word\s+by\s+word)\b/.test(x) && /\b(?:sentence|words|string)\b/.test(x)) {
    return { target: /\beach\s+word\b|\bcharacters\s+of\s+each\b/.test(x) ? "each-word" : "words" };
  }
  if (NUMBERY.test(x) && !STRINGY.test(x)) return { target: "number" };
  return { target: "string" };
}

function swap(ctx) {
  if (!/\bswap\w*\b|\binterchang\w*\b|\bexchang\w*\b/.test(ctx.text)) return null;
  return { names: ctx.names.length === 2 ? ctx.names : [], strings: STRINGY.test(ctx.text) && !NUMBERY.test(ctx.text) };
}

function table(ctx) {
  const x = ctx.text;
  if (!/\b(?:multiplication|times)\s+(?:tables?|chart)\b|\btables?\s+(?:of|for|from)\b/.test(x)) return null;
  const many = Boolean(ctx.range) && (/\btables\b/.test(x) || /\btables?\s+(?:of|for)\s+(?:-?\d+|n)\s*(?:to|-|\.\.)/.test(ctx.numeric));
  return { many, number: many ? null : ctx.values[0] ?? null };
}

function divisible(ctx) {
  const x = ctx.numeric;
  if (!/\bdivisible\b|\bdivisibility\b|\bmultiples?\s+of\b/.test(x)) return null;
  const by = x.match(/\b(?:divisible\s+by|multiples?\s+of)\s+(?:both\s+|either\s+)?(-?\d+)(?:\s*(?:,|and|or|&)\s*(-?\d+))?/);
  const divisors = by ? [by[1], by[2]].filter(Boolean).map(Number) : [];
  const any = /\b(?:either|or)\b/.test(by?.[0] || "") || /\beither\b/.test(x);
  return { divisors, any, list: listing(ctx, /numbers|multiples/) || /\bmultiples\b/.test(x) };
}

function search(ctx) {
  const x = ctx.text;
  if (
    !/\bsearch\w*\b|\blocate\b|\b(?:position|index)\s+of\b|\b(?:element|number|value|item|key)\s+(?:is\s+)?(?:present|exists?|found)\b|\bfind\s+(?:an?\s+|the\s+|given\s+)?(?:element|number|value|item|key)\s+in\b/.test(x)
  ) {
    return null;
  }
  return { strings: STRINGY.test(x) && !NUMBERY.test(x) };
}

function sort(ctx) {
  const x = ctx.text;
  if (!/\bsort\w*\b|\barrang\w*\b.*\border\b|\b(?:ascending|descending|increasing|decreasing)\s+order\b/.test(x)) return null;
  return { strings: /\b(?:names|strings|words)\b/.test(x) && !NUMBERY.test(x) };
}

function largest(ctx, flags) {
  const x = ctx.text;
  const max = /\b(?:largest|greatest|biggest|maximum|max|highest)\b/.test(x);
  const min = /\b(?:smallest|lowest|least|minimum|min)\b/.test(x);
  if (!max && !min) return null;
  const k = countOf(ctx, ITEMS) ?? (ctx.values.length >= 2 ? ctx.values.length : null);
  if (!NUMBERY.test(x) && !flags.array && !/\belements?\b|\bamong\b/.test(x) && k === null) return null;
  const ordinal = typeof ctx.ordinal === "number" && ctx.ordinal > 1 ? ctx.ordinal : ctx.ordinal === "n" ? "n" : null;
  const array = flags.array || /\belements?\b|\blist\b/.test(x) || k === "n" || k > 5 || ordinal !== null;
  return { which: max && min ? "both" : max ? "max" : "min", k: k ?? (array ? null : 3), ordinal, array };
}

function average(ctx, flags) {
  const x = ctx.text;
  if (!/\baverage\b|\bmean\b|\bavg\b/.test(x)) return null;
  const k = countOf(ctx, ITEMS) ?? (ctx.values.length >= 2 ? ctx.values.length : null);
  const array = flags.array || /\belements?\b|\blist\b/.test(x) || k === "n" || k > 5 || k === null;
  return { k, array, sum: SUMMING.test(x) };
}

function seriesSum(ctx, flags) {
  const x = ctx.text;
  if (!SUMMING.test(x) || flags.array || /\belements?\b|\bdigits?\b/.test(x)) return null;
  const natural = /\bnatural\s+numbers?\b|\bfirst\s+(?:\d+|n)\b|\bseries\b|\bnumbers?\s+(?:from|between|up\s*to|upto|till|until)\b/.test(ctx.numeric);
  const filter = /\beven\b/.test(x) && !/\bodd\b/.test(x) ? "even" : /\bodd\b/.test(x) && !/\beven\b/.test(x) ? "odd" : "all";
  const filtered = filter !== "all" && /\b(?:even|odd)\s+(?:natural\s+)?numbers\b/.test(x);
  if (!natural && !ctx.range && !ctx.limit && !filtered) return null;
  return {
    filter,
    term: /\bcubes?\b/.test(x) ? "cube" : /\bsquares?\b/.test(x) ? "square" : "n",
    count: countOf(ctx, /numbers?|terms?|integers?|values?/),
  };
}

function evenOdd(ctx, flags) {
  const x = ctx.text;
  const even = /\beven\b/.test(x);
  const odd = /\bodd\b/.test(x);
  if (!even && !odd) return null;
  if (!odd && /\beven\s+(?:if|though|when|more|better|after|before|faster|with)\b/.test(x) && !/\beven\s+numbers?\b/.test(x)) return null;
  const which = even && odd ? "both" : even ? "even" : "odd";
  if (flags.array || /\belements\b/.test(x)) return { mode: "array", which, sum: SUMMING.test(x), tally: COUNTING.test(x) };
  if (listing(ctx) && !(CHECKING.test(x) && !ctx.range && !ctx.limit)) return { family: "print-range", filter: which };
  return { mode: "check" };
}

function positiveNegative(ctx, flags) {
  const x = ctx.text;
  if (!/\bpositive\b|\bnegative\b/.test(x) || !/\bnumbers?\b|\bintegers?\b|\bvalues?\b|\bzero\b|\belements?\b|\bor\b/.test(x)) return null;
  return { array: flags.array || /\belements\b/.test(x), tally: COUNTING.test(x) };
}

function printRange(ctx) {
  const x = ctx.text;
  if (!(ctx.range || ctx.limit || /\bnatural\s+numbers\b|\bnumbers\s+(?:from|between)\b/.test(x))) return null;
  if (!/\b(?:print|prints|display|show|list|output|generate|write|count|counting|numbers)\b/.test(x)) return null;
  return { filter: "all" };
}

function arraySum(ctx, flags) {
  const x = ctx.text;
  const product = /\bproduct\b/.test(x);
  if (!SUMMING.test(x) && !product) return null;
  const k = countOf(ctx, ITEMS);
  if (!(flags.array || /\belements?\b/.test(x) || k === "n" || k > 3 || ctx.values.length > 3)) return null;
  return { k, product, sum: SUMMING.test(x) || !product };
}

const OPS = [
  ["+", /\b(?:sum|add|adds|adding|addition|plus|total)\b|\d\s*\+\s*\d/],
  ["-", /\b(?:subtract\w*|difference|minus|deduct\w*)\b|\d\s*-\s*\d/],
  ["*", /\b(?:multipl\w*|product)\b|\d\s*[*x]\s*\d|\d\s+times\s+\d/],
  ["/", /\b(?:divid\w*|division|quotient)\b|\d\s*\/\s*\d/],
  ["%", /\b(?:modulus|modulo|remainder|mod)\b|\d\s*%\s*\d/],
];

function arithmetic(ctx) {
  const x = ctx.numeric;
  const all = /\b(?:arithmetic|math(?:ematical)?|basic)\s+operations?\b|\boperations?\s+on\s+(?:two|2)\s+numbers\b|\b(?:add|addition)\s*,\s*(?:subtract|subtraction)/.test(x);
  const ops = all ? ["+", "-", "*", "/", "%"] : OPS.filter(([, re]) => re.test(x)).map(([o]) => o);
  if (!ops.length) return null;
  const k = countOf(ctx, ITEMS) ?? (ctx.values.length >= 2 ? ctx.values.length : 2);
  return { ops, k: k === "n" ? 2 : Math.min(Math.max(Math.trunc(k), 2), 5) };
}

function hello(ctx) {
  const x = ctx.text;
  const times = countOf(ctx, /times/);
  if (/\bhello[\s,.!-]*(?:world)?\b/.test(x) && !ctx.quoted.length) return { message: "Hello, World!", times };
  if (ctx.quoted.length && /\b(?:print|prints|display|show|output|say|says|write|greet)\b/.test(x)) return { message: ctx.quoted[0], times };
  if (/\b(?:print|display)\s+(?:a\s+|the\s+)?(?:welcome|greeting)\s+message\b/.test(x)) return { message: "Welcome!", times };
  return null;
}

export const LATE = [
  ["fizzbuzz", (ctx) => (/\bfizz\s*buzz\b/.test(ctx.text) ? {} : null)],
  ["leap-year", (ctx) => (/\bleap\s*years?\b/.test(ctx.text) ? { list: Boolean(ctx.range) || /\bleap\s+years\s+(?:from|between|in)\b/.test(ctx.text) } : null)],
  ["number-property", numberProperty],
  ["prime-factors", (ctx) => (/\bprime\s+factors?\b|\bprime\s+factori[sz]ation\b/.test(ctx.text) ? {} : null)],
  ["factors", (ctx) => (/\b(?:factors|divisors)\b|\b(?:factor|divisor)s?\s+of\b/.test(ctx.text) && !/\bfactorial/.test(ctx.text) ? { sum: SUMMING.test(ctx.text) } : null)],
  ["factorial", (ctx) => (/\bfactorials?\b/.test(ctx.text) ? { list: Boolean(ctx.range) || /\bfactorials\b|\beach\s+number\b/.test(ctx.text) } : null)],
  ["fibonacci", fibonacci],
  ["prime", prime],
  ["gcd", gcd],
  ["root", root],
  ["count-digits", (ctx) => (/\b(?:count|counts|counting|number\s+of|how\s+many|total)\s+(?:the\s+)?(?:total\s+)?(?:number\s+of\s+)?digits?\b|\bdigits?\s+count\b|\b(?:length|size)\s+of\s+(?:an?\s+|the\s+|given\s+)?(?:number|integer)\b/.test(ctx.text) ? {} : null)],
  ["sum-digits", digitSum],
  ["reverse", reverse],
  ["swap", swap],
  ["table", table],
  ["divisible", divisible],
  ["sort", sort],
  ["search", search],
  ["largest", largest],
  ["average", average],
  ["series-sum", seriesSum],
  ["power", power],
  ["even-odd", evenOdd],
  ["positive-negative", positiveNegative],
  ["print-range", printRange],
  ["array-sum", arraySum],
  ["hello", hello],
  ["arithmetic", arithmetic],
];
