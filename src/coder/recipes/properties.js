import * as I from "../ir.js";
import { countOf } from "../spec/text.js";
import { countDigitsFn, digitNote, digitType, eachDigit, productOfDigitsFn, reverseNumberFn, sumOfDigitsFn, wholeLiterals } from "./digits.js";
import { recursive, RECURSION } from "./numbers.js";
import { finish, joinParts, loopNote, rangeOf, rangeVars, result, scalar, spanParts } from "./util.js";

const SEARCH_LIMIT = 100000;
const NO_RECURSION = "Recursion is not a natural fit for this check, so it uses a loop instead.";
const doLoop = (spec) => spec.flags.loop === "do-while";
const square = (x, type) => (type === "long" ? I.mul(x, x) : I.mul(I.toLong(x), x));
const powerFn = I.func("power", [I.param("base", "int"), I.param("exponent", "int")], "long", [
  I.if_(I.eq("exponent", 0), [I.ret(1)]),
  I.ret(I.mul("base", I.call("power", "base", I.sub("exponent", 1)))),
]);
const armstrongSumFn = (type) =>
  I.func("armstrongSum", [I.param("num", type), I.param("digits", "int")], "long", [
    I.if_(I.eq("num", 0), [I.ret(0)]),
    I.ret(I.add(I.call("power", type === "long" ? I.toInt(I.mod("num", 10)) : I.mod("num", 10), "digits"), I.call("armstrongSum", I.div("num", 10), "digits"))),
  ]);
const factorialFn = (type) =>
  I.func("factorial", [I.param("digit", type)], type, [I.if_(I.le("digit", 1), [I.ret(1)]), I.ret(I.mul("digit", I.call("factorial", I.sub("digit", 1))))]);

// Each builder returns statements plus a `test` for the number named `x`. Recursive calls stay inside
// `test` so a domain check can short-circuit them (negative numbers never reach 0 with floor division).
function armstrong(spec, x, type) {
  if (recursive(spec)) {
    const test = I.eq(I.call("armstrongSum", x, I.call("countDigits", x)), x);
    return { stmts: [], test, functions: [countDigitsFn(type), powerFn, armstrongSumFn(type)], notes: ["Adds each digit raised to the number of digits.", RECURSION] };
  }
  const builtin = spec.flags.builtin === true;
  const power = builtin
    ? [I.op("total", "+", I.toLong(I.fn("pow", "digit", "digits")))]
    : [I.let_("power", "long", 1), I.for_("j", 1, "digits", [I.op("power", "*", "digit")]), I.op("total", "+", "power")];
  const stmts = [
    I.let_("num", type, x),
    I.let_("digits", "int", 0),
    eachDigit(spec, [I.inc("digits")]),
    I.set("num", x),
    I.let_("total", "long", 0),
    eachDigit(spec, [I.let_("digit", type, I.mod("num", 10)), ...power]),
  ];
  const how = builtin ? "Uses the built-in pow function for each digit's power." : "Raises each digit to the number of digits with a small loop, so the sum is exact.";
  return { stmts, test: I.eq("total", x), notes: ["Counts the digits first, then adds each digit raised to that count.", how, digitNote(spec)] };
}

function perfectSquare(spec, x, type, guard) {
  const notes = [recursive(spec) ? NO_RECURSION : null];
  if (spec.flags.builtin === false) {
    if (doLoop(spec)) notes.push("Uses a `while` loop, since a do-while would always add 1 even for 0.");
    notes.push("Counts up until root × root reaches the number, so no square root function is needed.");
    return { stmts: [I.let_("root", type, 0), I.while_(I.lt(I.mul("root", "root"), x), [I.inc("root")])], test: I.eq(I.mul("root", "root"), x), notes };
  }
  const sqrt = type === "long" ? I.toLong(I.fn("sqrt", x)) : I.toInt(I.fn("sqrt", x));
  notes.push("Takes the whole-number part of the square root and checks that squaring it gives the number back.");
  if (guard) notes.push("Negative numbers are never perfect squares, so they skip the square root.");
  return { stmts: [I.let_("root", type, guard ? I.cond(I.lt(x, 0), 0, sqrt) : sqrt)], test: I.eq(I.mul("root", "root"), x), notes };
}

function perfect(spec, x, type) {
  const loop = I.for_("i", 1, I.div(x, 2), [I.if_(I.eq(I.mod(x, "i"), 0), [I.op("total", "+", "i")])], { primary: true });
  const notes = [recursive(spec) ? NO_RECURSION : null, "Adds every proper divisor from 1 to n / 2 and compares the total with the number.", loopNote(spec)];
  return { stmts: [I.let_("total", type, 0), loop], test: I.eq("total", x), notes };
}

function strong(spec, x, type) {
  const rec = recursive(spec);
  const fact = rec
    ? [I.op("total", "+", I.call("factorial", "digit"))]
    : [I.let_("fact", type, 1), I.for_("j", 1, "digit", [I.op("fact", "*", "j")]), I.op("total", "+", "fact")];
  const stmts = [I.let_("num", type, x), I.let_("total", type, 0), eachDigit(spec, [I.let_("digit", type, I.mod("num", 10)), ...fact])];
  const notes = ["Adds the factorial of every digit and compares the total with the number.", rec ? RECURSION : null, digitNote(spec)];
  return { stmts, test: I.eq("total", x), functions: rec ? [factorialFn(type)] : [], notes };
}

function neon(spec, x, type) {
  const notes = ["Squares the number, adds the digits of the square, and compares the total with the number.", "The square is stored in a 64-bit integer."];
  if (recursive(spec)) {
    return { stmts: [I.let_("square", "long", square(x, type))], test: I.eq(I.call("sumOfDigits", "square"), x), functions: [sumOfDigitsFn("long")], notes: [...notes, RECURSION] };
  }
  const stmts = [I.let_("square", "long", square(x, type)), I.let_("num", "long", "square"), I.let_("total", "long", 0), eachDigit(spec, [I.op("total", "+", I.mod("num", 10))])];
  return { stmts, test: I.eq("total", x), notes: [...notes, digitNote(spec)] };
}

function harshad(spec, x, type) {
  const notes = ["A Harshad (Niven) number is divisible by the sum of its digits."];
  if (recursive(spec)) return { stmts: [], test: I.eq(I.mod(x, I.call("sumOfDigits", x)), 0), functions: [sumOfDigitsFn(type)], notes: [...notes, RECURSION] };
  const stmts = [I.let_("num", type, x), I.let_("total", type, 0), eachDigit(spec, [I.op("total", "+", I.mod("num", 10))])];
  return { stmts, test: I.eq(I.mod(x, "total"), 0), notes: [...notes, digitNote(spec)] };
}

function automorphic(spec, x, type) {
  const stmts = [I.let_("square", "long", square(x, type)), I.let_("num", type, x), I.let_("place", "long", 1), eachDigit(spec, [I.op("place", "*", 10)])];
  const notes = [
    recursive(spec) ? NO_RECURSION : null,
    "Finds 10 raised to the number of digits, then checks that the square ends with the number (76² = 5776).",
    "The square is stored in a 64-bit integer.",
    digitNote(spec),
  ];
  return { stmts, test: I.eq(I.mod("square", "place"), x), notes };
}

function spy(spec, x, type) {
  const notes = ["A spy number has the same sum and product of its digits (1124: 1+1+2+4 = 1×1×2×4 = 8)."];
  if (recursive(spec)) {
    const test = I.eq(I.call("sumOfDigits", x), I.call("productOfDigits", x));
    return { stmts: [], test, functions: [sumOfDigitsFn(type), productOfDigitsFn(type)], notes: [...notes, RECURSION] };
  }
  const body = [I.let_("digit", type, I.mod("num", 10)), I.op("total", "+", "digit"), I.op("product", "*", "digit")];
  const stmts = [I.let_("num", type, x), I.let_("total", type, 0), I.let_("product", "long", 1), eachDigit(spec, body)];
  return { stmts, test: I.eq("total", "product"), notes: [...notes, digitNote(spec)] };
}

function palindrome(spec, x, type) {
  const notes = ["Reverses the digits and compares the reverse with the original number."];
  if (recursive(spec)) return { stmts: [], test: I.eq(I.call("reverseNumber", x, 0), x), functions: [reverseNumberFn(type)], notes: [...notes, RECURSION] };
  const stmts = [I.let_("num", type, x), I.let_("reverse", "long", 0), eachDigit(spec, [I.set("reverse", I.add(I.mul("reverse", 10), I.mod("num", 10)))])];
  return { stmts, test: I.eq("reverse", x), notes: [...notes, digitNote(spec)] };
}

const positive = (spec, x) => I.gt(x, 0);
const nonNegative = (spec, x) => (doLoop(spec) || recursive(spec) ? I.ge(x, 0) : null);

const KINDS = {
  armstrong: { build: armstrong, label: "an Armstrong number", plural: "Armstrong numbers", fn: "isArmstrong", sample: 153, to: 1000, domain: nonNegative },
  "perfect-square": { build: perfectSquare, label: "a perfect square", plural: "perfect squares", fn: "isPerfectSquare", sample: 49, to: 100 },
  perfect: { build: perfect, label: "a perfect number", plural: "perfect numbers", fn: "isPerfect", sample: 28, to: 10000, limit: 10000, domain: positive },
  strong: { build: strong, label: "a strong number", plural: "strong numbers", fn: "isStrong", sample: 145, to: 50000, domain: positive },
  neon: { build: neon, label: "a neon number", plural: "neon numbers", fn: "isNeon", sample: 9, to: 100 },
  harshad: { build: harshad, label: "a Harshad number", plural: "Harshad numbers", fn: "isHarshad", sample: 18, to: 100, domain: positive },
  automorphic: { build: automorphic, label: "an automorphic number", plural: "automorphic numbers", fn: "isAutomorphic", sample: 76, to: 10000 },
  spy: { build: spy, label: "a spy number", plural: "spy numbers", fn: "isSpy", sample: 1124, to: 1000, domain: positive },
  palindrome: { build: palindrome, label: "a palindrome", plural: "palindrome numbers", fn: "isPalindrome", sample: 12321, to: 200, domain: nonNegative },
};

// `guard` means the number may be 0 or negative, so the test must reject values outside the property's domain.
function check(spec, kind, x, type, guard) {
  const built = kind.build(spec, x, type, guard);
  const domain = guard ? kind.domain?.(spec, x) : null;
  return { ...built, functions: built.functions || [], test: domain ? I.and(domain, built.test) : built.test };
}

function predicate(spec, kind, type, guard) {
  const built = check(spec, kind, "value", type, guard);
  const fnDef = I.func(kind.fn, [I.param("value", type)], "bool", [...built.stmts, I.ret(built.test)]);
  return { functions: [...built.functions, fnDef], notes: built.notes };
}

function checkOne(spec, kind) {
  const type = digitType(spec);
  const input = scalar(spec, "n", "Enter a number: ", kind.sample, { type, literals: wholeLiterals(spec) });
  const guard = input.reading || input.used[0] <= 0;
  const say = (yes) => I.print(I.v("n"), ` is ${yes ? "" : "not "}${kind.label}.`);
  const what = `checks whether ${input.reading ? "a number" : input.used[0]} is ${kind.label}`;
  if (spec.flags.func) {
    const pred = predicate(spec, kind, type, guard);
    const main = [...input.stmts, I.if_(I.call(kind.fn, "n"), [say(true)], [say(false)])];
    return result(finish(spec, main, pred.functions), what, [input.note, `The check is a function ${kind.fn}() that returns true or false.`, ...pred.notes]);
  }
  const built = check(spec, kind, "n", type, guard);
  const main = [...input.stmts, ...built.stmts, I.if_(built.test, [say(true)], [say(false)])];
  return result(finish(spec, main, built.functions), what, [input.note, ...built.notes]);
}

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function firstFew(spec, kind, k) {
  const pred = predicate(spec, kind, "int", false);
  const limit = kind.limit ?? SEARCH_LIMIT;
  const want = typeof k === "number" ? I.num(k) : I.v("wanted");
  const found = [I.if_(I.call(kind.fn, "i"), [I.print(I.v("i")), I.inc("count")]), I.inc("i")];
  const c = I.and(I.lt("count", want), I.le("i", limit));
  const main = [
    ...(typeof k === "number" ? [] : [I.read("wanted", "int", "How many numbers? ")]),
    I.print(...joinParts("First ", want, ` ${kind.plural}:`)),
    I.let_("count", "int", 0),
    I.let_("i", "int", 1),
    doLoop(spec) ? I.doWhile(found, c) : I.while_(c, found),
  ];
  const notes = [`Tests 1, 2, 3, … with ${kind.fn}() until enough numbers are found.`, `Stops after checking ${limit}, so it prints fewer if there are not enough below that.`, ...pred.notes];
  return result(finish(spec, main, pred.functions), `prints the first ${typeof k === "number" ? k : "n"} ${kind.plural}`, notes);
}

function listRange(spec, kind) {
  const k = countOf(spec.ctx, /numbers?|terms?|values|elements/);
  if (!spec.ctx.range && !spec.ctx.limit && k !== null) return firstFew(spec, kind, k);
  const bounds = rangeOf(spec, { from: 1, to: kind.to });
  const vars = rangeVars(spec, bounds);
  const pred = predicate(spec, kind, "int", bounds.from === null || bounds.from <= 0);
  const main = [
    ...vars.stmts,
    I.print(...spanParts(`${capital(kind.plural)} from `, vars.start, vars.end, ":")),
    I.let_("count", "int", 0),
    I.for_("i", vars.start, vars.end, [I.if_(I.call(kind.fn, "i"), [I.print(I.v("i")), I.inc("count")])], { primary: true }),
    I.if_(I.eq("count", 0), [I.print("None found.")]),
  ];
  const notes = [...vars.notes, `Tests every number in the range with ${kind.fn}().`, loopNote(spec), ...pred.notes];
  return result(finish(spec, main, pred.functions), `lists the ${kind.plural} in a range`, notes);
}

export function numberProperty(spec) {
  const kind = KINDS[spec.kind];
  if (!kind) return null;
  return spec.list ? listRange(spec, kind) : checkOne(spec, kind);
}
