import * as I from "../ir.js";
import { countOf } from "../spec/text.js";
import { NAMES, WORDS, chainIf, numberFields } from "./basic.js";
import { finish, list, loopNote, numericLiterals, rangeOf, rangeVars, result, scalar, scalars, spanParts, valueType } from "./util.js";

const pick = (op) => (op === "max" ? I.gt : I.lt);
const WORD = { max: "largest", min: "smallest" };

function runningExtreme(names, type, which, target = WORD[which]) {
  const stmts = [I.let_(target, type, names[0])];
  for (const name of names.slice(1)) stmts.push(I.if_(pick(which)(name, target), [I.set(target, name)]));
  return stmts;
}

export function largestScalar(spec) {
  const literals = numericLiterals(spec);
  const k = Math.max(2, Math.min(typeof spec.k === "number" ? Math.trunc(spec.k) : 3, 5));
  const type = valueType(spec, literals);
  const input = scalars(spec, numberFields(k), { type, literals });
  const names = NAMES.slice(0, k);
  const notes = [input.note];
  const main = [...input.stmts];
  const functions = [];
  const what = input.reading ? `${WORDS[k]} numbers` : list(input.used);
  if (spec.which === "both") {
    main.push(...runningExtreme(names, type, "max"), ...runningExtreme(names, type, "min"));
    main.push(I.print("Largest = ", I.v("largest")), I.print("Smallest = ", I.v("smallest")));
    notes.push("Compares each number with the current largest and smallest.");
    return result(finish(spec, main), `finds the largest and smallest of ${what}`, notes);
  }
  const which = spec.which;
  const word = WORD[which];
  const better = pick(which);
  const atLeast = which === "max" ? I.ge : I.le;
  const announce = (name) => I.print(I.v(name), ` is the ${word} number.`);
  const text = spec.ctx.text;
  if (spec.flags.func) {
    const fname = which === "max" ? "findLargest" : "findSmallest";
    const body =
      k === 2
        ? [I.if_(atLeast("a", "b"), [I.ret("a")]), I.ret("b")]
        : k === 3
          ? [I.if_(I.and(atLeast("a", "b"), atLeast("a", "c")), [I.ret("a")]), I.if_(atLeast("b", "c"), [I.ret("b")]), I.ret("c")]
          : [...runningExtreme(names, type, which, "result"), I.ret("result")];
    functions.push(I.func(fname, names.map((name) => I.param(name, type)), type, body));
    main.push(I.print(`The ${word} number is `, I.call(fname, ...names)));
    notes.push(`The comparison is done in a separate function, \`${fname}\`.`);
  } else if (spec.flags.builtin === true) {
    const expr = names.slice(1).reduce((acc, name) => I.fn(which, acc, I.v(name)), I.v(names[0]));
    main.push(I.print(`The ${word} number is `, expr));
    notes.push(`Uses the built-in \`${which}\` function.`);
  } else if (spec.flags.ternary) {
    const choose = (a, b) => I.cond(better(a, b), I.v(a), I.v(b));
    if (k === 2) main.push(I.let_(word, type, choose("a", "b")));
    else if (k === 3) main.push(I.let_(word, type, I.cond(better("a", "b"), choose("a", "c"), choose("b", "c"))));
    else {
      main.push(I.let_(word, type, "a"));
      for (const name of names.slice(1)) main.push(I.set(word, I.cond(better(name, word), I.v(name), I.v(word))));
    }
    main.push(I.print(`The ${word} number is `, I.v(word)));
    notes.push("Uses the ternary (conditional) operator.");
  } else if (k === 2) {
    const other = which === "max" ? "larger" : "smaller";
    main.push(chainIf([[better("a", "b"), [I.print(I.v("a"), ` is ${other}.`)]], [better("b", "a"), [I.print(I.v("b"), ` is ${other}.`)]]], [I.print("Both numbers are equal.")]));
  } else if (k === 3 && /\bnested\s+if/.test(text)) {
    main.push(
      I.if_(atLeast("a", "b"), [I.if_(atLeast("a", "c"), [announce("a")], [announce("c")])], [I.if_(atLeast("b", "c"), [announce("b")], [announce("c")])]),
    );
    notes.push("Uses nested if statements.");
  } else if (k === 3) {
    main.push(
      chainIf(
        [
          [I.and(atLeast("a", "b"), atLeast("a", "c")), [announce("a")]],
          [I.and(atLeast("b", "a"), atLeast("b", "c")), [announce("b")]],
        ],
        [announce("c")],
      ),
    );
  } else {
    main.push(...runningExtreme(names, type, which), I.print(`The ${word} number is `, I.v(word)));
    notes.push(`Keeps the ${word} value seen so far and compares it with each number.`);
  }
  return result(finish(spec, main, functions), `finds the ${word} of ${what}`, notes);
}

export function averageScalar(spec) {
  const literals = numericLiterals(spec);
  const k = Math.max(2, Math.min(typeof spec.k === "number" ? Math.trunc(spec.k) : 3, 5));
  const type = valueType(spec, literals);
  const input = scalars(spec, numberFields(k), { type, literals });
  const names = NAMES.slice(0, k);
  const totalExpr = names.slice(1).reduce((acc, name) => I.add(acc, name), I.v(names[0]));
  const averageExpr = (total) => (type === "double" ? I.div(total, I.dbl(k)) : I.div(I.toDouble(total), I.num(k)));
  const main = [...input.stmts];
  const functions = [];
  const notes = [input.note];
  if (spec.flags.func) {
    functions.push(I.func("findAverage", names.map((name) => I.param(name, type)), "double", [I.let_("total", type, totalExpr), I.ret(averageExpr(I.v("total")))]));
    if (spec.sum) main.push(I.print("Sum = ", totalExpr));
    main.push(I.print("Average = ", I.call("findAverage", ...names)));
    notes.push("The average is calculated in a separate function.");
  } else {
    main.push(I.let_("total", type, totalExpr), I.let_("average", "double", averageExpr(I.v("total"))));
    if (spec.sum) main.push(I.print("Sum = ", I.v("total")));
    main.push(I.print("Average = ", I.v("average")));
  }
  if (type !== "double") notes.push("Converts the total to a decimal before dividing, so the average keeps its fraction.");
  const what = input.reading ? `${WORDS[k]} numbers` : list(input.used);
  return result(finish(spec, main, functions), `finds the ${spec.sum ? "sum and average" : "average"} of ${what}`, notes);
}

const leapTest = (y) => I.or(I.and(I.eq(I.mod(y, 4), 0), I.ne(I.mod(y, 100), 0)), I.eq(I.mod(y, 400), 0));

export function leapYear(spec) {
  const functions = [];
  const notes = [];
  let test = (y) => leapTest(y);
  if (spec.flags.func) {
    functions.push(I.func("isLeapYear", [I.param("year", "int")], "bool", [I.ret(leapTest("year"))]));
    test = (y) => I.call("isLeapYear", y);
    notes.push("The rule is checked in a separate function, `isLeapYear`.");
  }
  if (spec.list) {
    const bounds = spec.ctx.range ? rangeOf(spec) : spec.flags.input === false ? { from: 2000, to: 2050, fixed: true } : { from: null, to: null, fixed: false };
    const vars = rangeVars(spec, bounds, { label: "year" });
    const main = [
      ...vars.stmts,
      I.print(...spanParts("Leap years from ", vars.start, vars.end, ":")),
      I.let_("count", "int", 0),
      I.for_("year", vars.start, vars.end, [I.if_(test(I.v("year")), [I.write(I.v("year"), " "), I.inc("count")])], { primary: true }),
      I.print(),
      I.print("Total leap years: ", I.v("count")),
    ];
    notes.push(...vars.notes, loopNote(spec));
    return result(finish(spec, main, functions), "lists the leap years in a range", notes);
  }
  const input = scalar(spec, "year", "Enter a year: ", 2024);
  notes.unshift(input.note);
  const yes = [I.print(I.v("year"), " is a leap year.")];
  const no = [I.print(I.v("year"), " is not a leap year.")];
  const main = [...input.stmts];
  if (spec.flags.ternary) {
    main.push(I.let_("verdict", "string", I.cond(test(I.v("year")), I.str("a leap year"), I.str("not a leap year"))), I.print(I.v("year"), " is ", I.v("verdict"), "."));
    notes.push("Uses the ternary (conditional) operator.");
  } else if (!spec.flags.func && (spec.flags.ifElse || /\bnested\b/.test(spec.ctx.text))) {
    main.push(chainIf([[I.eq(I.mod("year", 400), 0), yes], [I.eq(I.mod("year", 100), 0), no], [I.eq(I.mod("year", 4), 0), yes]], no));
    notes.push("Applies the rules step by step: divisible by 400, then by 100, then by 4.");
  } else {
    main.push(I.if_(test(I.v("year")), yes, no));
    notes.push("A leap year is divisible by 4 but not by 100, unless it is also divisible by 400.");
  }
  return result(finish(spec, main, functions), "checks whether a year is a leap year", notes);
}

export function vote(spec) {
  const input = scalar(spec, "age", "Enter your age: ", 20);
  const functions = [];
  const notes = [input.note];
  let allowed = I.ge("age", 18);
  if (spec.flags.func) {
    functions.push(I.func("canVote", [I.param("age", "int")], "bool", [I.ret(allowed)]));
    allowed = I.call("canVote", "age");
    notes.push("The age check is done in a separate function, `canVote`.");
  }
  const main = [...input.stmts];
  if (spec.flags.ternary) {
    main.push(I.let_("message", "string", I.cond(allowed, I.str("You are eligible to vote."), I.str("You are not eligible to vote."))), I.print(I.v("message")));
    notes.push("Uses the ternary (conditional) operator.");
  } else {
    main.push(
      chainIf(
        [
          [I.lt("age", 0), [I.print("Please enter a valid age.")]],
          [allowed, [I.print("You are eligible to vote.")]],
        ],
        [I.print("You are not eligible to vote."), I.print("You can vote after ", I.sub(18, "age"), " year(s).")],
      ),
    );
  }
  notes.push("Uses 18 as the minimum voting age.");
  return result(finish(spec, main, functions), "checks whether a person is eligible to vote", notes);
}

export function divisible(spec) {
  const divisors = spec.divisors.filter((d) => d !== 0);
  const joiner = spec.any ? "or" : "and";
  const rest = [...numericLiterals(spec)];
  for (const d of spec.divisors) {
    const at = rest.indexOf(d);
    if (at >= 0) rest.splice(at, 1);
  }
  const notes = [];
  if (!divisors.length) {
    const input = scalars(spec, [["n", "Enter a number: ", 20], ["d", "Enter the divisor: ", 5]], { literals: rest });
    const main = [
      ...input.stmts,
      chainIf(
        [
          [I.eq("d", 0), [I.print("Cannot divide by zero.")]],
          [I.eq(I.mod("n", "d"), 0), [I.print(I.v("n"), " is divisible by ", I.v("d"), ".")]],
        ],
        [I.print(I.v("n"), " is not divisible by ", I.v("d"), ".")],
      ),
    ];
    return result(finish(spec, main), "checks whether one number is divisible by another", [input.note, "Checks for a zero divisor first."]);
  }
  const test = (n) => divisors.map((d) => I.eq(I.mod(n, d), 0)).reduce((acc, c) => (spec.any ? I.or(acc, c) : I.and(acc, c)));
  const by = list(divisors).replace(/ and (?=[^,]*$)/, ` ${joiner} `);
  if (spec.list) {
    const multiples = countOf(spec.ctx, /multiples?/);
    if (typeof multiples === "number" && divisors.length === 1) {
      const count = Math.min(Math.trunc(multiples), 1000);
      const main = [I.write(`First ${count} multiples of ${divisors[0]}:`), I.for_("i", 1, count, [I.write(" ", I.mul(divisors[0], "i"))], { primary: true }), I.print()];
      return result(finish(spec, main), `prints the first ${count} multiples of ${divisors[0]}`, [loopNote(spec)]);
    }
    const bounds = rangeOf(spec, { from: 1, to: 100 });
    const vars = rangeVars(spec, bounds);
    const main = [
      ...vars.stmts,
      I.print(...spanParts("Numbers from ", vars.start, vars.end, ` divisible by ${by}:`)),
      I.for_("i", vars.start, vars.end, [I.if_(test(I.v("i")), [I.write(I.v("i"), " ")])], { primary: true }),
      I.print(),
    ];
    return result(finish(spec, main), `prints the numbers divisible by ${by} in a range`, [...vars.notes, loopNote(spec)]);
  }
  const input = scalar(spec, "n", "Enter a number: ", divisors.reduce((acc, d) => acc * Math.abs(d), 1), { literals: rest });
  notes.push(input.note);
  const main = [...input.stmts, I.if_(test(I.v("n")), [I.print(I.v("n"), ` is divisible by ${by}.`)], [I.print(I.v("n"), ` is not divisible by ${by}.`)])];
  if (divisors.length > 1) notes.push(spec.any ? "Uses `||`: one matching divisor is enough." : "Uses `&&`: the number must be divisible by every divisor.");
  return result(finish(spec, main), `checks whether a number is divisible by ${by}`, notes);
}
