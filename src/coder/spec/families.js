import { countOf } from "./text.js";

export const STRINGY = /\b(?:strings?|words?|texts?|sentences?|phrases?|names?|lines?|paragraphs?|qstr\d+)\b/;
export const CHARACTER = /\b(?:characters?|chars?|letters?|alphabets?|symbols?)\b/;
export const COUNTING = /\b(?:count|counts|counting|number\s+of|how\s+many|total|find\s+the\s+number)\b/;
export const CHECKING = /\b(?:check|checks|checking|whether|determine|identify|find\s+(?:out\s+)?if|is\s+it|or\s+not|test|verify)\b/;
const ROWS = /rows?|lines?|levels?|height|steps?|size/;

function quotedChar(ctx) {
  const single = ctx.quoted.find((q) => [...q].length === 1);
  if (single) return single;
  const named = ctx.original.match(/\b(?:character|char|letter|symbol)\s+([A-Za-z0-9#@$*+])(?![\w'])/i);
  return named ? named[1] : null;
}

function pattern(ctx) {
  const x = ctx.text;
  if (/\b(?:area|perimeter|volume|circumference|hypotenuse|valid\s+triangle|type\s+of\s+triangle)\b/.test(x)) return null;
  const strong = /\b(?:patterns?|pyramids?|diamonds?|stars?|asterisks?|floyd'?s?|pascal'?s?|hourglass)\b|\*/.test(x);
  if (!strong && !(/\btriangles?\b/.test(x) && /\b(?:print|display|draw|rows?|numbers?|alphabets?)\b/.test(x))) return null;
  let shape = "triangle";
  if (/\bpascal/.test(x)) shape = "pascal";
  else if (/\bfloyd/.test(x)) shape = "floyd";
  else if (/\bdiamond/.test(x)) shape = "diamond";
  else if (/\bhollow\s+(?:square|rectangle|box)/.test(x)) shape = "hollow-square";
  else if (/\b(?:square|rectangle|box|grid)\b/.test(x)) shape = "square";
  else if (/\bpyramid\b|\b(?:full|equilateral|isosceles|cent(?:er|re)d?)\s+triangle\b/.test(x) && !/\bhalf[\s-]?pyramid\b/.test(x)) {
    shape = "pyramid";
  }
  let fill = "star";
  if (/\b1\s*22\s*333\b|\bsame\s+numbers?\b|\brepeat(?:ed|ing)?\s+numbers?\b|\brow\s+numbers?\b/.test(x)) fill = "repeat";
  else if (/\balphabets?\b|\bletters?\b|\bcharacters?\b|\babc\b|\ba\s+ab\s+abc\b/.test(x)) fill = "alpha";
  else if (/\bnumbers?\b|\bnumeric\b|\bdigits?\b|\b1\s*12\s*123\b|\bintegers?\b/.test(x)) fill = "number";
  const rows = countOf(ctx, ROWS) ?? ctx.values[0] ?? null;
  return {
    shape,
    fill,
    char: quotedChar(ctx) || (/#/.test(x) ? "#" : "*"),
    inverted: /\b(?:inverted|invert|reversed?|upside[\s-]down|downward|decreasing)\b/.test(x),
    mirrored: /\bright[\s-]aligned\b|\bmirror(?:ed)?\b|\bleft[\s-]?(?:side|facing)\b/.test(x),
    rows: typeof rows === "number" && rows > 0 && rows <= 50 ? Math.trunc(rows) : rows === "n" ? "n" : null,
  };
}

function calculator(ctx) {
  const x = ctx.text;
  if (
    !/\bcalculators?\b|\bmenu[\s-]?driven\b|\b(?:arithmetic|math(?:ematical)?)\s+operations?\s+(?:using|with|based\s+on)\s+(?:a\s+|the\s+)?(?:switch|operator|choice|menu|user\s+choice)|\b(?:choose|enter|input|select|read)s?\s+(?:an?\s+|the\s+)?(?:operator|operation|choice)\b/.test(x)
  ) {
    return null;
  }
  return { repeat: /\b(?:continuous(?:ly)?|repeat(?:edly|s)?|until|loop|again|keep\s+(?:running|asking)|multiple\s+times|menu)\b/.test(x) };
}

function interest(ctx) {
  if (!/\binterest\b/.test(ctx.text)) return null;
  const simple = /\bsimple\b/.test(ctx.text);
  const compound = /\bcompound\b/.test(ctx.text);
  return { kinds: compound && simple ? ["simple", "compound"] : compound ? ["compound"] : ["simple"] };
}

function temperature(ctx) {
  const x = ctx.text.replace(/°\s*c\b|\bdeg(?:rees?)?\s+c\b/g, " celsius ").replace(/°\s*f\b|\bdeg(?:rees?)?\s+f\b/g, " fahrenheit ");
  const units = [...x.matchAll(/\b(celsius|centigrade|fahrenheit|kelvin)\b/g)].map((m) => (m[1] === "centigrade" ? "celsius" : m[1]));
  if (!units.length && !/\btemperatures?\b/.test(x)) return null;
  const target = x.match(/\b(?:to|into|in)\s+(celsius|centigrade|fahrenheit|kelvin)\b/)?.[1]?.replace("centigrade", "celsius");
  const distinct = [...new Set(units)];
  let from = distinct.find((u) => u !== target) || (target === "celsius" ? "fahrenheit" : "celsius");
  let to = target || distinct.find((u) => u !== from) || (from === "celsius" ? "fahrenheit" : "celsius");
  if (from === to) to = from === "celsius" ? "fahrenheit" : "celsius";
  return { from, to };
}

const SHAPES = [
  ["circle", /\bcircles?\b|\bcircular\b|\bradius\b/],
  ["rectangle", /\brectangles?\b|\brectangular\b|\blength\s+and\s+(?:width|breadth)\b/],
  ["square", /\bsquares?\b(?!\s+roots?)/],
  ["triangle", /\btriangles?\b/],
  ["sphere", /\bspheres?\b/],
  ["cube", /\bcubes?\b(?!\s+roots?)/],
  ["cylinder", /\bcylinders?\b/],
];

function area(ctx) {
  const x = ctx.text;
  if (!/\b(?:area|perimeter|circumference|volume|surface\s+area)\b/.test(x)) return null;
  const shapes = SHAPES.filter(([, re]) => re.test(x))
    .map(([name, re]) => [name, x.search(re)])
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
  if (!shapes.length) return null;
  const measures = [];
  if (/\barea\b/.test(x) && !/\bsurface\s+area\b/.test(x)) measures.push("area");
  if (/\bsurface\s+area\b/.test(x)) measures.push("surface");
  if (/\bperimeter\b|\bcircumference\b/.test(x)) measures.push("perimeter");
  if (/\bvolume\b/.test(x)) measures.push("volume");
  return { shapes, measures, heron: /\bheron|\b(?:three|3)\s+sides\b|\ball\s+(?:three\s+)?sides\b/.test(x) };
}

function grade(ctx) {
  const x = ctx.text;
  if (!/\bgrades?\b|\bgrading\b|\bmarks?\b.*\b(?:division|result|pass|fail|percentage)\b|\bpercentage\b.*\b(?:marks?|subjects?)\b|\bstudent\b.*\b(?:result|report)\b/.test(x)) {
    return null;
  }
  const subjects = countOf(ctx, /subjects?|marks|scores?|courses?|papers?/);
  return { subjects: subjects === "n" ? "n" : subjects > 1 ? Math.min(Math.trunc(subjects), 20) : 1, passFail: /\bpass\b|\bfail\b/.test(x) };
}

function vote(ctx) {
  return /\b(?:eligib\w*|can|allowed)\b.*\bvot(?:e|ing)\b|\bvot(?:e|ing)\b.*\b(?:eligib\w*|age)\b/.test(ctx.text) ? {} : null;
}

const BASE_WORDS = { binary: 2, octal: 8, hexadecimal: 16, hexa: 16, hex: 16, decimal: 10 };
// An optional literal such as "1010" or "1a" between the base name and "to".
const DIGITS_TOKEN = String.raw`(?:(?:qstr\d+|(?!a\s)[0-9a-f]+)\s+)?`;
const FROM_BASE = new RegExp(String.raw`\b(?:binary|octal|hexa(?:decimal)?|hex)\s+(?:numbers?\s+|values?\s+)?${DIGITS_TOKEN}(?:to|into)\b`);
const BASE_PAIR = new RegExp(
  String.raw`\b(binary|octal|hexa(?:decimal)?|hex|decimal)\s+(?:numbers?\s+|values?\s+)?${DIGITS_TOKEN}(?:to|into)\s+(?:its\s+|an?\s+)?(binary|octal|hexa(?:decimal)?|hex|decimal)\b`,
);

function baseConvert(ctx) {
  const x = ctx.text.replace(/\bbase[\s-]?(2|8|10|16)\b/g, (m, b) => ({ 2: "binary", 8: "octal", 10: "decimal", 16: "hexadecimal" })[b]);
  const found = [...x.matchAll(/\b(binary|octal|hexa(?:decimal)?|hex|decimal)\b/g)].map((m) => BASE_WORDS[m[1]] || 16);
  if (!found.some((b) => b !== 10)) return null;
  if (!/\bconver\w*|\bequivalent\b|\brepresentation\b|\b(?:to|into|in|of)\s+(?:its\s+)?(?:binary|octal|hex)/.test(x) && !FROM_BASE.test(x)) return null;
  const pair = x.match(BASE_PAIR);
  if (pair) {
    const from = BASE_WORDS[pair[1]] || 16;
    const to = BASE_WORDS[pair[2]] || 16;
    if (from !== to && (from === 10 || to === 10)) return { from, to };
    return null;
  }
  const other = found.find((b) => b !== 10);
  return FROM_BASE.test(x) ? { from: other, to: 10 } : { from: 10, to: other };
}

function ascii(ctx) {
  const x = ctx.text;
  if (!/\bascii\b|\bunicode\s+(?:values?|codes?|code\s*points?)\b|\bchar(?:acter)?\s+codes?\b/.test(x)) return null;
  const toChar = /\b(?:to|into)\s+(?:a\s+|its\s+)?(?:character|char|letter)\b|\b(?:character|char|letter)\s+(?:of|from|for)\s+(?:an?\s+|the\s+|given\s+)?(?:ascii|code|value|number)\b|\bfrom\s+(?:an?\s+)?ascii\b/.test(x);
  return { toChar, string: !toChar && /\b(?:strings?|words?|texts?|sentences?|each\s+character|every\s+character|all\s+characters|qstr\d+)\b/.test(x) };
}

function palindrome(ctx) {
  if (!/\bpalindrom\w*\b/.test(ctx.text)) return null;
  const numeric = /\b(?:numbers?|integers?|digits?|numeric|int)\b/.test(ctx.text) && !STRINGY.test(ctx.text);
  if (numeric) return { family: "number-property", kind: "palindrome", list: Boolean(ctx.range || ctx.limit) };
  return {};
}

function countChars(ctx) {
  const x = ctx.text;
  const cats = [];
  const add = (name, re) => re.test(x) && cats.push(name);
  add("vowels", /\bvowels?\b/);
  add("consonants", /\bconsonants?\b/);
  add("uppercase", /\bupper\s*case\b|\bcapital\s+letters?\b|\buppercase\b/);
  add("lowercase", /\blower\s*case\b|\bsmall\s+letters?\b|\blowercase\b/);
  add("letters", /\balphabets?\b|\bletters?\b(?!\s+in\s+(?:upper|lower))/);
  add("digits", /\bdigits?\b|\bnumbers?\b|\bnumeric\b/);
  add("spaces", /\b(?:spaces?|white\s*spaces?|blanks?)\b/);
  add("special", /\bspecial\s+(?:characters?|symbols?|chars?)\b|\bsymbols?\b|\bpunctuation\b/);
  if (!cats.length || !COUNTING.test(x)) return null;
  const onlyDigits = cats.every((c) => c === "digits");
  if (onlyDigits && !STRINGY.test(x)) return null;
  if (cats.includes("uppercase") && cats.includes("letters") && !/\balphabets?\b/.test(x)) cats.splice(cats.indexOf("letters"), 1);
  if (cats.includes("lowercase") && cats.includes("letters") && !/\balphabets?\b/.test(x)) cats.splice(cats.indexOf("letters"), 1);
  return { cats: cats.filter((c) => !(c === "digits" && cats.length > 1 && !/\bdigits?\b/.test(x))) };
}

function vowelCheck(ctx) {
  const x = ctx.text;
  if (!/\bvowels?\b/.test(x) || COUNTING.test(x) || STRINGY.test(x)) return null;
  return CHARACTER.test(x) || CHECKING.test(x) || /\bvowels?\s+or\s+(?:an?\s+)?consonants?\b/.test(x) ? { char: quotedChar(ctx) } : null;
}

function charFrequency(ctx) {
  const x = ctx.text;
  if (!/\b(?:frequency|frequencies|occurrences?|occurs?|occurring|how\s+many\s+times|number\s+of\s+times|repeated)\b/.test(x)) return null;
  if (!CHARACTER.test(x) && !STRINGY.test(x)) return null;
  return { each: /\b(?:each|every|all)\s+(?:the\s+)?(?:characters?|chars?|letters?)\b|\bcharacter\s+frequencies\b/.test(x), char: quotedChar(ctx) };
}

function charType(ctx) {
  const x = ctx.text;
  if (!CHARACTER.test(x) || COUNTING.test(x) || STRINGY.test(x)) return null;
  const caseWords = /\b(?:upper\s*case|lower\s*case|uppercase|lowercase|capital|small)\b/.test(x);
  const kindWords = /\b(?:alphabets?|digits?|special|numeric|numbers?|symbols?)\b/.test(x);
  if (!caseWords && !kindWords) return null;
  if (!CHECKING.test(x) && !/\bor\b/.test(x)) return null;
  return { mode: caseWords && !kindWords ? "case" : /\bdigits?\b|\bspecial\b|\bnumeric\b|\bnumbers?\b|\bsymbols?\b/.test(x) ? "kind" : "alpha", char: quotedChar(ctx) };
}

function caseConvert(ctx) {
  const x = ctx.text;
  if (!/\b(?:upper\s*case|lower\s*case|uppercase|lowercase|capital(?:s|\s+letters)?|small\s+letters|toggle|swap\s*case|invert(?:ing)?\s+(?:the\s+)?case|title\s+case|capitali[sz]e)\b/.test(x)) {
    return null;
  }
  if (!/\b(?:convert\w*|change|changing|transform|make|turn|print|display)\b/.test(x) && !STRINGY.test(x)) return null;
  let mode = "upper";
  const target = x.match(/\b(?:to|into|in)\s+(upper|lower|title)\s*case\b|\b(?:to|into|in)\s+(capital|small)\s+letters\b/);
  if (/\btoggle|\bswap\s*case|\binvert/.test(x)) mode = "toggle";
  else if (/\btitle\s+case\b|\bcapitali[sz]e\s+(?:the\s+)?(?:first|each|every)\b/.test(x)) mode = "title";
  else if (target) mode = { upper: "upper", capital: "upper", lower: "lower", small: "lower", title: "title" }[target[1] || target[2]];
  else if (/\blower\s*case\b|\blowercase\b|\bsmall\s+letters\b/.test(x) && !/\bupper\s*case\b|\buppercase\b|\bcapital/.test(x)) mode = "lower";
  return { mode, char: CHARACTER.test(x) && !STRINGY.test(x) };
}

export const EARLY = [
  ["pattern", pattern],
  ["calculator", calculator],
  ["quadratic", (ctx) => (/\bquadratic\b|\broots?\s+of\s+(?:an?\s+|the\s+)?(?:quadratic|equation)|\bdiscriminant\b/.test(ctx.text) ? {} : null)],
  ["interest", interest],
  ["temperature", temperature],
  ["area", area],
  ["grade", grade],
  ["vote", vote],
  ["base-convert", baseConvert],
  ["ascii", ascii],
  ["anagram", (ctx) => (/\banagrams?\b/.test(ctx.text) ? {} : null)],
  ["palindrome", palindrome],
  ["concat", (ctx) => (/\bconcat\w*\b|\b(?:join|combine|merge|append)\s+(?:two\s+|2\s+)?strings?\b/.test(ctx.text) ? {} : null)],
  ["compare-strings", (ctx) => (/\bcompare\s+(?:two\s+|2\s+)?strings?\b|\bstrings?\s+(?:are\s+)?(?:equal|same|identical)\b|\bstring\s+comparison\b/.test(ctx.text) ? {} : null)],
  ["count-words", (ctx) => (/\b(?:count|number\s+of|how\s+many|total)\s+(?:the\s+)?(?:number\s+of\s+)?words?\b|\bword\s+count\b/.test(ctx.text) ? {} : null)],
  ["vowel-check", vowelCheck],
  ["count-chars", countChars],
  ["char-frequency", charFrequency],
  ["char-type", charType],
  ["string-length", (ctx) => (/\b(?:length|size)\s+of\s+(?:an?\s+|the\s+|given\s+)?(?:strings?|texts?|words?|sentences?|qstr\d+)\b|\bstring\s+length\b|\bcount\s+(?:the\s+)?(?:number\s+of\s+)?characters?\b|\bhow\s+many\s+characters\b/.test(ctx.text) ? {} : null)],
  ["case-convert", caseConvert],
];
