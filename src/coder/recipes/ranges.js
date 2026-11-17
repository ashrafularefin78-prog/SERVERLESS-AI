import * as I from "../ir.js";
import { countOf } from "../spec/text.js";
import { chainIf } from "./basic.js";
import { finish, joinParts, loopNote, rangeOf, rangeVars, result, spanParts } from "./util.js";

const COUNT_NOUNS = /numbers?|terms?|integers?|values?/;
const PARITY = { even: (i) => I.eq(I.mod(i, 2), 0), odd: (i) => I.ne(I.mod(i, 2), 0) };
const WORD = { all: "", even: "even ", odd: "odd " };
const recursive = (spec) => spec.flags.recursion === true || spec.flags.loop === "none";
const RECURSION_NOTE = "Uses recursion: the function handles one number, then calls itself for the next.";

function aligned(value, filter, down) {
  if (filter === "all") return value;
  const even = ((value % 2) + 2) % 2 === 0;
  if (even === (filter === "even")) return value;
  return down ? value - 1 : value + 1;
}

// Where the numbers come from: the first N terms, a literal range, or a range read from input.
function span(spec, defaults = { from: 1, to: 10 }) {
  const { range, limit } = spec.ctx;
  const between =
    !range && !limit && spec.flags.input !== false &&
    /\bbetween\s+(?:two|2|the\s+(?:given\s+)?)\s*(?:numbers|values|integers|limits)\b|\b(?:a|the|given)\s+range\b|\b(?:start|starting)\s+and\s+end(?:ing)?\b/.test(spec.ctx.text);
  const count = between ? null : countOf(spec.ctx, COUNT_NOUNS);
  if (!range && !limit && count !== null) {
    if (count === "n") return { firstN: true, stmts: [I.read("n", "int", "Enter how many numbers: ")], n: I.v("n"), notes: [] };
    return { firstN: true, stmts: [], n: I.num(Math.min(Math.trunc(count), 100000)), notes: [] };
  }
  const vars = rangeVars(spec, between ? { from: null, to: null, fixed: false } : rangeOf(spec, defaults));
  const literal = vars.start.k === "num" && vars.end.k === "num";
  return { firstN: false, stmts: vars.stmts, start: vars.start, end: vars.end, literal, down: literal && vars.start.value > vars.end.value, notes: vars.notes };
}

const spanText = (where, from = where.start, to = where.end) =>
  where.literal ? `from ${from.value} to ${to.value}` : from.k === "num" ? `from ${from.value} up to a number you enter` : "in a range you enter";

// A recursive function that visits current..last, one step at a time.
function walker(name, body, { down = false, step = 1, extra = [] } = {}) {
  const next = down ? I.sub("current", step) : I.add("current", step);
  return I.func(name, [I.param("current", "int"), I.param("last", "int"), ...extra], "void", [
    I.if_(down ? I.ge("current", "last") : I.le("current", "last"), [...body(I.v("current")), I.callStmt(name, next, "last", ...extra.map((p) => I.v(p.name)))]),
  ]);
}

const nthOf = (filter, i) => (filter === "even" ? I.mul(2, i) : filter === "odd" ? I.sub(I.mul(2, i), 1) : I.v(i));

export function printRange(spec) {
  const where = span(spec);
  const text = spec.ctx.text;
  const wantDown = Boolean(spec.descending) || spec.flags.order === "desc" || /\b(?:reverse|backwards?|descending|count\s*down)\b/.test(text);
  const filters = spec.filter === "both" ? ["even", "odd"] : [spec.filter];
  const main = [...where.stmts];
  const functions = [];
  const notes = [...where.notes];
  const rec = recursive(spec);
  const names = { all: "printNumbers", even: "printEvenNumbers", odd: "printOddNumbers" };
  let description;
  for (const filter of filters) {
    const show = (i) => [I.write(" ", i)];
    if (where.firstN) {
      const label = filter === "all" ? "natural" : filter;
      main.push(I.write(...joinParts("First ", where.n, ` ${label} numbers:`)));
      if (rec) {
        functions.push(walker(names[filter], (i) => show(nthOf(filter, i))));
        main.push(I.callStmt(names[filter], 1, where.n));
      } else {
        main.push(wantDown ? I.for_("i", where.n, 1, show(nthOf(filter, "i")), { step: -1, primary: true }) : I.for_("i", 1, where.n, show(nthOf(filter, "i")), { primary: true }));
      }
      description = `prints the first ${where.n.k === "num" ? where.n.value : "n"} ${filters.length > 1 ? "even and odd" : label} numbers`;
    } else {
      const down = where.down || wantDown;
      const [from, to] = wantDown && !where.down ? [where.end, where.start] : [where.start, where.end];
      main.push(I.write(...spanParts(`${filter === "all" ? "Numbers" : filter === "even" ? "Even numbers" : "Odd numbers"} from `, from, to, ":")));
      const first = where.literal ? I.num(aligned(from.value, filter, down)) : from;
      const step = where.literal && filter !== "all" ? 2 : 1;
      const body = (i) => (where.literal || filter === "all" ? show(i) : [I.if_(PARITY[filter](i), show(i))]);
      if (rec) {
        functions.push(walker(names[filter], body, { down, step }));
        main.push(I.callStmt(names[filter], first, to));
      } else {
        main.push(I.for_("i", first, to, body(I.v("i")), { step: down ? -step : step, primary: true }));
      }
      description = `prints the ${filters.length > 1 ? "even and odd " : WORD[filter]}numbers ${spanText(where, from, to)}`;
      if (step === 2) notes.push(`Starts at ${first.value} and steps by 2, so only ${filter} numbers are visited.`);
    }
    main.push(I.print());
  }
  notes.push(rec ? RECURSION_NOTE : loopNote(spec));
  return result(finish(spec, main, functions), description, notes);
}

export function seriesSum(spec) {
  const where = span(spec);
  const { filter } = spec;
  const power = { n: 1, square: 2, cube: 3 }[spec.term];
  const termWord = { 1: "", 2: "squares of ", 3: "cubes of " }[power];
  const endValue = where.firstN ? where.n.value : where.end.value;
  const type = power > 1 || (typeof endValue === "number" && Math.abs(endValue) > 60000) ? "long" : "int";
  // Widen the first factor so C-family languages multiply in 64 bits instead of overflowing int.
  const wide = (x) => (type === "long" ? I.toLong(x) : I.E(x));
  const raise = (x) => (power === 1 ? I.E(x) : power === 2 ? I.mul(wide(x), x) : I.mul(I.mul(wide(x), x), x));
  const main = [...where.stmts];
  const functions = [];
  const notes = [...where.notes];
  const what = where.firstN
    ? `${termWord ? `the ${termWord}` : ""}the first ${where.n.k === "num" ? where.n.value : "n"} ${filter === "all" ? "natural" : filter} numbers`
    : `the ${termWord}${WORD[filter]}numbers ${spanText(where)}`;
  const label = where.firstN
    ? joinParts(`Sum of ${termWord ? `the ${termWord}` : ""}the first `, where.n, ` ${filter === "all" ? "natural" : filter} numbers = `)
    : spanParts(`Sum of ${termWord}${WORD[filter]}numbers from `, where.start, where.end, " = ");
  const wantsFormula = spec.flags.formula || spec.flags.loop === "none";
  let formula = null;
  if (wantsFormula && where.firstN) {
    const n = where.n;
    const half = I.div(I.mul(wide(n), I.add(n, 1)), 2);
    if (filter === "all" && power === 1) formula = half;
    else if (filter === "all" && power === 2) formula = I.div(I.mul(I.mul(wide(n), I.add(n, 1)), I.add(I.mul(2, n), 1)), 6);
    else if (filter === "all" && power === 3) {
      main.push(I.let_("naturalSum", type, half));
      formula = I.mul("naturalSum", "naturalSum");
    } else if (filter === "even" && power === 1) formula = I.mul(wide(n), I.add(n, 1));
    else if (filter === "odd" && power === 1) formula = I.mul(wide(n), n);
  } else if (wantsFormula && filter === "all" && power === 1 && !where.down) {
    const fromOne = where.start.k === "num" && where.start.value === 1;
    let { start, end } = where;
    if (where.literal) {
      main.push(...(fromOne ? [I.let_("n", "int", end.value)] : [I.let_("first", "int", start.value), I.let_("last", "int", end.value)]));
      [start, end] = fromOne ? [start, I.v("n")] : [I.v("first"), I.v("last")];
    }
    formula = fromOne ? I.div(I.mul(wide(end), I.add(end, 1)), 2) : I.div(I.mul(wide(I.add(I.sub(end, start), 1)), I.add(start, end)), 2);
  }
  if (formula) {
    main.push(I.let_("total", type, formula), I.print(...label, I.v("total")));
    notes.push("Uses a closed-form formula instead of a loop.");
    return result(finish(spec, main), `finds the sum of ${what}`, notes);
  }
  if (wantsFormula) notes.push("There is no simple formula for this series, so it uses a loop.");
  if (spec.flags.recursion === true) {
    if (where.firstN) {
      functions.push(I.func("sumSeries", [I.param("count", "int")], type, [I.if_(I.le("count", 0), [I.ret(0)]), I.ret(I.add(raise(nthOf(filter, "count")), I.call("sumSeries", I.sub("count", 1))))]));
      main.push(I.print(...label, I.call("sumSeries", where.n)));
    } else {
      const rest = I.call("sumRange", I.add("current", 1), "last");
      const body =
        filter === "all"
          ? [I.ret(I.add(raise("current"), rest))]
          : [I.if_(PARITY[filter]("current"), [I.ret(I.add(raise("current"), rest))]), I.ret(rest)];
      functions.push(I.func("sumRange", [I.param("current", "int"), I.param("last", "int")], type, [I.if_(I.gt("current", "last"), [I.ret(0)]), ...body]));
      main.push(I.print(...label, I.call("sumRange", where.start, where.end)));
    }
    notes.push("Uses recursion: each call adds one term and calls itself for the rest.");
    return result(finish(spec, main, functions), `finds the sum of ${what}`, notes);
  }
  main.push(I.let_("total", type, 0));
  if (where.firstN) {
    const body = filter === "all" ? [I.op("total", "+", raise("i"))] : [I.let_("term", "int", nthOf(filter, "i")), I.op("total", "+", raise("term"))];
    main.push(I.for_("i", 1, where.n, body, { primary: true }));
  } else if (where.literal && filter !== "all") {
    const down = where.down;
    main.push(I.for_("i", aligned(where.start.value, filter, down), where.end, [I.op("total", "+", raise("i"))], { step: down ? -2 : 2, primary: true }));
  } else {
    const add = [I.op("total", "+", raise("i"))];
    main.push(I.for_("i", where.start, where.end, filter === "all" ? add : [I.if_(PARITY[filter]("i"), add)], { step: where.down ? -1 : 1, primary: true }));
  }
  main.push(I.print(...label, I.v("total")));
  notes.push(loopNote(spec));
  if (type === "long") notes.push("Keeps the total in a 64-bit integer so large sums do not overflow.");
  return result(finish(spec, main), `finds the sum of ${what}`, notes);
}

function tableNumber(spec) {
  const rest = [...spec.ctx.values];
  for (const used of [spec.ctx.range?.from, spec.ctx.range?.to, spec.ctx.limit?.value]) {
    const at = used === undefined ? -1 : rest.indexOf(used);
    if (at >= 0) rest.splice(at, 1);
  }
  return typeof rest[0] === "number" ? rest[0] : null;
}

export function table(spec) {
  const notes = [];
  const functions = [];
  const row = (t, i) => I.print(t, " x ", i, " = ", I.mul(t, i));
  if (spec.many) {
    const vars = rangeVars(spec, rangeOf(spec, { from: 1, to: 10 }));
    const main = [
      ...vars.stmts,
      I.for_("t", vars.start, vars.end, [I.print("Multiplication table of ", I.v("t"), ":"), I.for_("i", 1, 10, [row(I.v("t"), I.v("i"))]), I.print()], { primary: true }),
    ];
    notes.push(...vars.notes, "Uses nested loops: the outer loop picks the table, the inner loop prints its rows.", loopNote(spec));
    return result(finish(spec, main), `prints the multiplication tables ${vars.start.k === "num" && vars.end.k === "num" ? `from ${vars.start.value} to ${vars.end.value}` : "for a range of numbers"}`, notes);
  }
  const number = tableNumber(spec);
  const reading = spec.flags.input === true || (number === null && spec.flags.input !== false);
  const used = number ?? 5;
  const main = [reading ? I.read("number", "int", "Enter a number: ") : I.let_("number", "int", used)];
  if (!reading) notes.push(number === null ? "Uses 5 as a sample number instead of reading input." : `Uses ${number} from your request.`);
  const range = spec.ctx.range;
  const from = typeof range?.from === "number" ? range.from : 1;
  const to = typeof range?.to === "number" ? range.to : typeof spec.ctx.limit?.value === "number" ? spec.ctx.limit.value : 10;
  main.push(I.print("Multiplication table of ", I.v("number"), ":"));
  if (recursive(spec)) {
    functions.push(walker("printTable", (i) => [row(I.v("number"), i)], { extra: [I.param("number", "int")] }));
    main.push(I.callStmt("printTable", from, to, "number"));
    notes.push(RECURSION_NOTE);
  } else if (spec.flags.func) {
    functions.push(I.func("printTable", [I.param("number", "int")], "void", [I.for_("i", from, to, [row(I.v("number"), I.v("i"))], { primary: true })]));
    main.push(I.callStmt("printTable", "number"));
    notes.push("The table is printed by a separate function.", loopNote(spec));
  } else {
    main.push(I.for_("i", from, to, [row(I.v("number"), I.v("i"))], { primary: true }));
    notes.push(loopNote(spec));
  }
  if (from !== 1 || to !== 10) notes.push(`Prints rows ${from} to ${to}, as requested.`);
  return result(finish(spec, main, functions), `prints the multiplication table of ${reading ? "a number" : used}`, notes);
}

export function fizzbuzz(spec) {
  const bounds = spec.ctx.range || spec.ctx.limit ? rangeOf(spec) : spec.flags.input === true ? { from: 1, to: null, fixed: false } : { from: 1, to: 100, fixed: true };
  const vars = rangeVars(spec, bounds);
  const say = (i) => [
    chainIf(
      [
        [I.and(I.eq(I.mod(i, 3), 0), I.eq(I.mod(i, 5), 0)), [I.print("FizzBuzz")]],
        [I.eq(I.mod(i, 3), 0), [I.print("Fizz")]],
        [I.eq(I.mod(i, 5), 0), [I.print("Buzz")]],
      ],
      [I.print(i)],
    ),
  ];
  const functions = [];
  const notes = [...vars.notes];
  const main = [...vars.stmts];
  if (recursive(spec)) {
    functions.push(walker("fizzBuzz", say));
    main.push(I.callStmt("fizzBuzz", vars.start, vars.end));
    notes.push(RECURSION_NOTE);
  } else {
    main.push(I.for_("i", vars.start, vars.end, say(I.v("i")), { primary: true }));
    notes.push(loopNote(spec));
  }
  notes.push("Checks 3 and 5 together first, so multiples of 15 print FizzBuzz.");
  const ends = vars.start.k === "num" && vars.end.k === "num" ? `from ${vars.start.value} to ${vars.end.value}` : "up to a number you enter";
  return result(finish(spec, main, functions), `plays FizzBuzz ${ends}`, notes);
}
