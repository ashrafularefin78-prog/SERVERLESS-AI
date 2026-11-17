import { arithmetic, calculator, evenOdd, hello, positiveNegative, swap } from "./basic.js";
import { averageScalar, divisible, largestScalar, leapYear, vote } from "./decisions.js";
import { fizzbuzz, printRange, seriesSum, table } from "./ranges.js";
import { factorial, factors, fibonacci, prime, primeFactors } from "./numbers.js";
import { gcd, power, root } from "./maths.js";

const unless = (test, recipe) => (spec, lang) => (test(spec) ? null : recipe(spec, lang));

const RECIPES = {
  hello,
  arithmetic,
  calculator,
  swap,
  "even-odd": unless((spec) => spec.mode !== "check", evenOdd),
  "positive-negative": unless((spec) => spec.array, positiveNegative),
  largest: unless((spec) => spec.array, largestScalar),
  average: unless((spec) => spec.array, averageScalar),
  "leap-year": leapYear,
  vote,
  divisible,
  "print-range": printRange,
  "series-sum": seriesSum,
  table,
  fizzbuzz,
  factorial,
  fibonacci,
  prime,
  "prime-factors": primeFactors,
  factors,
  gcd,
  power,
  root,
};

const POINTER_LANGS = new Set(["c", "cpp"]);
const REFERENCE_LANGS = new Set(["cpp", "csharp"]);

function caveats(spec, lang) {
  const { flags } = spec;
  const notes = [];
  if (flags.ternary && lang === "go") notes.push("Go has no ternary operator, so the choice is written as an if-else statement.");
  if (flags.loop === "do-while" && lang === "python") notes.push("Python has no do-while loop, so this uses `while True` with a `break` at the end.");
  if (flags.loop === "do-while" && lang === "go") notes.push("Go has no do-while loop, so this uses `for` with a `break` at the end.");
  if (flags.loop === "while" && lang === "go") notes.push("Go writes a while loop as `for condition { ... }`.");
  if (flags.pointer && !POINTER_LANGS.has(lang)) notes.push("Pointers are only used in the C and C++ versions; this language works with the values directly.");
  if (flags.byRef && !flags.pointer && !POINTER_LANGS.has(lang) && !REFERENCE_LANGS.has(lang)) {
    notes.push("This language passes plain values by value, so the result is returned or updated in place instead.");
  }
  return notes;
}

export function buildRecipe(spec, lang) {
  const recipe = RECIPES[spec.family];
  const built = recipe ? recipe(spec, lang) : null;
  if (!built) return null;
  return { ...built, notes: [...new Set([...built.notes, ...caveats(spec, lang)])] };
}
