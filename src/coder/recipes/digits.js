import * as I from "../ir.js";
import { recursive, RECURSION } from "./numbers.js";
import { finish, loopNote, numericLiterals, result, scalar } from "./util.js";

const INT_MAX = 2147483647;
const SYMBOLS = "0123456789ABCDEF";
const BASE_NAMES = { 2: "binary", 8: "octal", 10: "decimal", 16: "hexadecimal" };

export function digitType(spec) {
  if (spec.flags.type === "long") return "long";
  return numericLiterals(spec).some((value) => Math.abs(value) > INT_MAX) ? "long" : "int";
}

export const wholeLiterals = (spec) => numericLiterals(spec).filter(Number.isInteger);

// Reads `n` or uses the request's whole number; `source` is |n| whenever n may be negative.
export function digitInput(spec, fallback) {
  const type = digitType(spec);
  const input = scalar(spec, "n", "Enter a number: ", fallback, {
    type,
    literals: wholeLiterals(spec),
  });
  const signed = input.reading || input.used[0] < 0;
  return { input, type, signed, source: signed ? I.fn("abs", "n") : I.v("n") };
}

export function digitNote(spec) {
  return spec.flags.loop === "for"
    ? "Uses a `while` loop, since the number of digits is not known in advance."
    : loopNote(spec);
}

// Visits each digit of `name` from the right, dividing it by 10 after `body`.
export function eachDigit(spec, body, name = "num") {
  const steps = [...body, I.op(name, "/", 10)];
  return spec.flags.loop === "do-while"
    ? I.doWhile(steps, I.gt(name, 0))
    : I.while_(I.gt(name, 0), steps);
}

const what = (input) => (input.reading ? "a number" : input.used[0]);

// Runs `steps` inline on a copy `num`, inside `name(num)` returning `out`, or through the recursive `rec` functions.
function shaped(spec, { name, type, returns, steps, out, rec, source }) {
  if (recursive(spec)) return { functions: rec.fns, pre: [], value: rec.call, notes: [RECURSION] };
  if (spec.flags.func) {
    return {
      functions: [I.func(name, [I.param("num", type)], returns, [...steps, I.ret(out)])],
      pre: [],
      value: I.call(name, source),
      notes: [digitNote(spec)],
    };
  }
  return {
    functions: [],
    pre: [I.let_("num", type, source), ...steps],
    value: I.v(out),
    notes: [digitNote(spec)],
  };
}

export const sumOfDigitsFn = (type) =>
  I.func("sumOfDigits", [I.param("num", type)], type, [
    I.if_(I.eq("num", 0), [I.ret(0)]),
    I.ret(I.add(I.mod("num", 10), I.call("sumOfDigits", I.div("num", 10)))),
  ]);

export const productOfDigitsFn = (type) =>
  I.func("productOfDigits", [I.param("num", type)], "long", [
    I.if_(I.lt("num", 10), [I.ret("num")]),
    I.ret(I.mul(I.mod("num", 10), I.call("productOfDigits", I.div("num", 10)))),
  ]);

const reverseStep = (num, reverse) => I.add(I.mul(reverse, 10), I.mod(num, 10));

export const reverseNumberFn = (type) =>
  I.func("reverseNumber", [I.param("num", type), I.param("reverse", "long")], "long", [
    I.if_(I.eq("num", 0), [I.ret("reverse")]),
    I.ret(I.call("reverseNumber", I.div("num", 10), reverseStep("num", "reverse"))),
  ]);

export const countDigitsFn = (type) =>
  I.func("countDigits", [I.param("num", type)], "int", [
    I.if_(I.lt("num", 10), [I.ret(1)]),
    I.ret(I.add(1, I.call("countDigits", I.div("num", 10)))),
  ]);

export function countDigits(spec) {
  const { input, type, signed, source } = digitInput(spec, 12345);
  const steps =
    spec.flags.loop === "do-while"
      ? [
          I.let_("count", "int", 0),
          I.doWhile([I.op("num", "/", 10), I.inc("count")], I.gt("num", 0)),
        ]
      : [
          I.let_("count", "int", 1),
          I.while_(I.ge("num", 10), [I.op("num", "/", 10), I.inc("count")]),
        ];
  const rec = { fns: [countDigitsFn(type)], call: I.call("countDigits", source) };
  const shape = shaped(spec, {
    name: "countDigits",
    type,
    returns: "int",
    steps,
    out: "count",
    rec,
    source,
  });
  const main = [
    ...input.stmts,
    ...shape.pre,
    I.print("Number of digits in ", I.v("n"), " = ", shape.value),
  ];
  const notes = [
    input.note,
    ...shape.notes,
    signed ? "Counts 0 as one digit and ignores a minus sign." : null,
  ];
  return result(finish(spec, main, shape.functions), `counts the digits in ${what(input)}`, notes);
}

function productDigits(spec) {
  const { input, type, source } = digitInput(spec, 1234);
  const start = spec.flags.loop === "do-while" ? I.num(1) : I.cond(I.eq("num", 0), 0, 1);
  const steps = [
    I.let_("product", "long", start),
    eachDigit(spec, [I.op("product", "*", I.mod("num", 10))]),
  ];
  const rec = { fns: [productOfDigitsFn(type)], call: I.call("productOfDigits", source) };
  const shape = shaped(spec, {
    name: "productOfDigits",
    type,
    returns: "long",
    steps,
    out: "product",
    rec,
    source,
  });
  const main = [
    ...input.stmts,
    ...shape.pre,
    I.print("Product of digits of ", I.v("n"), " = ", shape.value),
  ];
  return result(finish(spec, main, shape.functions), `multiplies the digits of ${what(input)}`, [
    input.note,
    ...shape.notes,
    "Uses a 64-bit result, since digit products grow quickly.",
  ]);
}

function firstLast(spec) {
  const { input, type, source } = digitInput(spec, 12345);
  const doLoop = spec.flags.loop === "do-while";
  const leading = doLoop
    ? [
        I.let_("first", type, 0),
        I.doWhile([I.set("first", "num"), I.op("num", "/", 10)], I.gt("num", 0)),
      ]
    : [I.while_(I.ge("num", 10), [I.op("num", "/", 10)])];
  const steps = [
    I.let_("last", type, I.mod("num", 10)),
    ...leading,
    I.let_("total", type, I.add(doLoop ? "first" : "num", "last")),
  ];
  const fn = I.func("firstDigit", [I.param("num", type)], type, [
    I.if_(I.lt("num", 10), [I.ret("num")]),
    I.ret(I.call("firstDigit", I.div("num", 10))),
  ]);
  const rec = { fns: [fn], call: I.add(I.call("firstDigit", source), I.mod(source, 10)) };
  const shape = shaped(spec, {
    name: "sumFirstLast",
    type,
    returns: type,
    steps,
    out: "total",
    rec,
    source,
  });
  const main = [
    ...input.stmts,
    ...shape.pre,
    I.print("Sum of first and last digits of ", I.v("n"), " = ", shape.value),
  ];
  const notes = [
    input.note,
    "The last digit is the number mod 10; dividing by 10 until one digit is left gives the first digit.",
    ...shape.notes,
  ];
  return result(
    finish(spec, main, shape.functions),
    `adds the first and last digits of ${what(input)}`,
    notes,
  );
}

function digitalRoot(spec) {
  const { input, type, source } = digitInput(spec, 9875);
  if (spec.flags.formula) {
    const main = [
      ...input.stmts,
      I.let_("num", type, source),
      I.let_("root", type, I.cond(I.eq("num", 0), 0, I.add(1, I.mod(I.sub("num", 1), 9)))),
      I.print("Digital root of ", I.v("n"), " = ", I.v("root")),
    ];
    return result(finish(spec, main), `finds the digital root of ${what(input)}`, [
      input.note,
      "Uses the formula 1 + (n - 1) mod 9, which gives the digital root without looping.",
    ]);
  }
  const inner = [
    I.let_("total", type, 0),
    eachDigit(spec, [I.op("total", "+", I.mod("num", 10))]),
    I.set("num", "total"),
  ];
  const fn = I.func("digitalRoot", [I.param("num", type)], type, [
    I.if_(I.lt("num", 10), [I.ret("num")]),
    I.ret(I.call("digitalRoot", I.call("sumOfDigits", "num"))),
  ]);
  const rec = { fns: [sumOfDigitsFn(type), fn], call: I.call("digitalRoot", source) };
  const shape = shaped(spec, {
    name: "digitalRoot",
    type,
    returns: type,
    steps: [I.while_(I.ge("num", 10), inner)],
    out: "num",
    rec,
    source,
  });
  const main = [
    ...input.stmts,
    ...shape.pre,
    I.print("Digital root of ", I.v("n"), " = ", shape.value),
  ];
  const notes = [
    input.note,
    "Keeps adding the digits until a single digit is left (9875 → 29 → 11 → 2).",
    ...shape.notes,
  ];
  return result(
    finish(spec, main, shape.functions),
    `finds the digital root of ${what(input)}`,
    notes,
  );
}

export function sumDigits(spec) {
  if (spec.op === "product") return productDigits(spec);
  if (spec.op === "first-last") return firstLast(spec);
  if (spec.repeat) return digitalRoot(spec);
  const { input, type, source } = digitInput(spec, 12345);
  const steps = [I.let_("total", type, 0), eachDigit(spec, [I.op("total", "+", I.mod("num", 10))])];
  const shape = shaped(spec, {
    name: "sumOfDigits",
    type,
    returns: type,
    steps,
    out: "total",
    rec: { fns: [sumOfDigitsFn(type)], call: I.call("sumOfDigits", source) },
    source,
  });
  const main = [
    ...input.stmts,
    ...shape.pre,
    I.print("Sum of digits of ", I.v("n"), " = ", shape.value),
  ];
  return result(finish(spec, main, shape.functions), `adds the digits of ${what(input)}`, [
    input.note,
    ...shape.notes,
  ]);
}

export function reverseNumber(spec) {
  const { input, type, signed, source } = digitInput(spec, 12345);
  const steps = [
    I.let_("reverse", "long", 0),
    eachDigit(spec, [I.set("reverse", reverseStep("num", "reverse"))]),
  ];
  const rec = { fns: [reverseNumberFn(type)], call: I.call("reverseNumber", source, 0) };
  const shape = shaped(spec, {
    name: "reverseNumber",
    type,
    returns: "long",
    steps,
    out: "reverse",
    rec,
    source,
  });
  const main = [...input.stmts, ...shape.pre];
  if (shape.value.k !== "var") main.push(I.let_("reverse", "long", shape.value));
  if (signed) main.push(I.if_(I.lt("n", 0), [I.set("reverse", I.neg("reverse"))]));
  main.push(I.print("Reverse of ", I.v("n"), " = ", I.v("reverse")));
  const notes = [
    input.note,
    "Builds the reverse one digit at a time: reverse = reverse × 10 + last digit.",
    ...shape.notes,
    signed ? "Keeps the minus sign of a negative number." : null,
    input.reading || input.used[0] % 10 === 0
      ? "Trailing zeros disappear, so 1200 becomes 21."
      : null,
  ];
  return result(
    finish(spec, main, shape.functions),
    `reverses the digits of ${what(input)}`,
    notes,
  );
}

// A literal like "1010" or "1A" written in the source base, from quotes or next to the base name.
function digitsLiteral(spec, base) {
  const ok = (token) =>
    /^[0-9a-f]+$/i.test(token) &&
    token !== "a" &&
    [...token].every((ch) => parseInt(ch, 16) < base);
  const quoted = spec.ctx.quoted.find(ok);
  if (quoted) return quoted;
  const near = spec.ctx.numeric.match(
    /\b(?:binary|octal|hex(?:a(?:decimal)?)?)\s+(?:numbers?\s+|values?\s+)?([0-9a-f]+)\b|\b([0-9a-f]*\d[0-9a-f]*)\s+(?:from\s+|in\s+)?(?:binary|octal|hex)/,
  );
  const token = near ? near[1] || near[2] : wholeLiterals(spec).map(String).find(ok);
  if (!token || !ok(token)) return null;
  return spec.ctx.original.match(new RegExp(`\\b${token}\\b`, "i"))?.[0] ?? token;
}

function toDecimal(spec) {
  const base = spec.from;
  const word = BASE_NAMES[base];
  const given = digitsLiteral(spec, base);
  const within = (lo, hi) => I.and(I.ge("c", I.chr(lo)), I.le("c", I.chr(hi)));
  const letter = (from) => I.add(I.sub(I.fn("code", "c"), I.fn("code", I.chr(from))), 10);
  const reject = [I.set("valid", false), I.brk()];
  const body =
    base === 16
      ? [
          I.let_("c", "char", I.at("text", "i")),
          I.let_("digit", "int", 0),
          I.if_(
            within("0", "9"),
            [I.set("digit", I.fn("digit", "c"))],
            I.if_(
              within("A", "F"),
              [I.set("digit", letter("A"))],
              I.if_(within("a", "f"), [I.set("digit", letter("a"))], reject),
            ),
          ),
          I.set("value", I.add(I.mul("value", 16), "digit")),
        ]
      : [
          I.let_("c", "char", I.at("text", "i")),
          I.if_(I.or(I.lt("c", I.chr("0")), I.gt("c", I.chr(String(base - 1)))), reject),
          I.set("value", I.add(I.mul("value", base), I.fn("digit", "c"))),
        ];
  const main = [
    given
      ? I.let_("text", "string", I.str(given))
      : I.read("text", "string", `Enter a ${word} number: `),
    I.let_("length", "int", I.len("text")),
    I.let_("value", "long", 0),
    I.let_("valid", "bool", I.gt("length", 0)),
    I.for_("i", 0, "length", body, { inclusive: false, primary: true }),
    I.if_(
      "valid",
      [I.print(I.v("text"), ` in decimal = `, I.v("value"))],
      [I.print(I.v("text"), ` is not a valid ${word} number.`)],
    ),
  ];
  const notes = [
    given ? `Uses the ${word} number ${given} from your request.` : null,
    `Reads the digits from left to right: value = value × ${base} + digit.`,
    `Stops with an error message at the first character that is not a ${word} digit.`,
  ];
  return result(
    finish(spec, main),
    `converts ${given ? `the ${word} number ${given}` : `a ${word} number`} to decimal`,
    notes,
  );
}

function fromDecimal(spec) {
  const base = spec.to;
  const word = BASE_NAMES[base];
  const fnName = `print${base === 16 ? "Hex" : word[0].toUpperCase() + word.slice(1)}`;
  const input = scalar(spec, "n", "Enter a decimal number: ", 25, {
    literals: wholeLiterals(spec),
  });
  const rec = recursive(spec);
  const shown = (d) => (base === 16 ? I.at(rec ? I.str(SYMBOLS) : "symbols", d) : d);
  const doLoop = spec.flags.loop === "do-while";
  const extract = [
    I.set(I.idx("digits", "count"), I.mod("num", base)),
    I.op("num", "/", base),
    I.inc("count"),
  ];
  const collect = [
    I.newArray("digits", "int", 32),
    I.let_("count", "int", 0),
    doLoop ? I.doWhile(extract, I.gt("num", 0)) : I.while_(I.gt("num", 0), extract),
  ];
  const zero =
    !doLoop && (input.reading || input.used[0] === 0)
      ? [I.if_(I.eq("count", 0), [I.write("0")])]
      : [];
  const symbols = base === 16 ? [I.let_("symbols", "string", I.str(SYMBOLS))] : [];
  const emitDigits = [
    ...symbols,
    ...zero,
    I.for_("i", I.sub("count", 1), 0, [I.write(shown(I.idx("digits", "i")))], { step: -1 }),
  ];
  const header = I.write(I.v("n"), ` in ${word} = `);
  let functions = [];
  let body;
  if (rec) {
    functions = [
      I.func(fnName, [I.param("num", "int")], "void", [
        I.if_(I.ge("num", base), [I.callStmt(fnName, I.div("num", base))]),
        I.write(shown(I.mod("num", base))),
      ]),
    ];
    body = [header, I.callStmt(fnName, "n"), I.print()];
  } else if (spec.flags.func) {
    functions = [I.func(fnName, [I.param("num", "int")], "void", [...collect, ...emitDigits])];
    body = [header, I.callStmt(fnName, "n"), I.print()];
  } else {
    body = [I.let_("num", "int", "n"), ...collect, header, ...emitDigits, I.print()];
  }
  const guarded =
    input.reading || input.used[0] < 0
      ? [I.if_(I.lt("n", 0), [I.print("Please enter a number of 0 or more.")], body)]
      : body;
  const notes = [
    input.note,
    rec
      ? `Uses recursion: the function prints the higher ${word} digits of n / ${base} first, then the last digit n mod ${base}.`
      : `Divides by ${base} repeatedly and stores each remainder; printing the remainders in reverse gives the ${word} digits.`,
    base === 16 ? "Digits 10 to 15 are written as A to F." : null,
    rec ? null : digitNote(spec),
  ];
  return result(
    finish(spec, [...input.stmts, ...guarded], functions),
    `converts ${input.reading ? "a decimal number" : input.used[0]} to ${word}`,
    notes,
  );
}

export function baseConvert(spec) {
  return spec.from === 10 ? fromDecimal(spec) : toDecimal(spec);
}
