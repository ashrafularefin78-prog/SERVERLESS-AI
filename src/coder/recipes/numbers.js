import * as I from "../ir.js";
import {
  finish,
  joinParts,
  loopNote,
  rangeOf,
  rangeVars,
  result,
  scalar,
  spanParts,
} from "./util.js";

export const recursive = (spec) => spec.flags.recursion === true || spec.flags.loop === "none";
export const RECURSION =
  "Uses recursion: the function calls itself with a smaller value until it reaches the base case.";
const DO_WHILE_NOTE =
  "A do-while loop would test the first divisor even for tiny numbers, so this uses a `while` loop.";

// Reads `n` (or uses the number from the request) and rejects values below `min` at run time when needed.
function single(spec, prompt, fallback, min, message) {
  const input = scalar(spec, "n", prompt, fallback);
  const literalOk = !input.reading && input.used[0] >= min;
  const wrap = (body) => (literalOk ? body : [I.if_(I.lt("n", min), [I.print(message)], body)]);
  return { input, wrap, notes: [input.note] };
}

export function factorial(spec) {
  const rec = recursive(spec);
  const loopBody = (name) => [
    I.let_("fact", "long", 1),
    I.for_("i", 1, name, [I.op("fact", "*", "i")], { primary: true }),
  ];
  const fnDef = rec
    ? I.func("factorial", [I.param("n", "int")], "long", [
        I.if_(I.le("n", 1), [I.ret(1)]),
        I.ret(I.mul("n", I.call("factorial", I.sub("n", 1)))),
      ])
    : I.func("factorial", [I.param("n", "int")], "long", [...loopBody("n"), I.ret("fact")]);
  const notes = [
    rec ? RECURSION : loopNote(spec),
    "Uses a 64-bit integer, so results are exact up to 20!.",
  ];
  if (spec.list) {
    const vars = rangeVars(spec, rangeOf(spec, { from: 1, to: 10 }));
    const main = [
      ...vars.stmts,
      I.for_("i", vars.start, vars.end, [I.print(I.v("i"), "! = ", I.call("factorial", "i"))], {
        primary: true,
      }),
    ];
    return result(finish(spec, main, [fnDef]), "prints the factorial of each number in a range", [
      ...vars.notes,
      ...notes,
    ]);
  }
  const {
    input,
    wrap,
    notes: inputNotes,
  } = single(spec, "Enter a number: ", 5, 0, "Factorial is not defined for negative numbers.");
  const useFn = rec || spec.flags.func;
  const body = useFn
    ? [I.print("Factorial of ", I.v("n"), " = ", I.call("factorial", "n"))]
    : [...loopBody("n"), I.print("Factorial of ", I.v("n"), " = ", I.v("fact"))];
  const main = [...input.stmts, ...wrap(body)];
  const what = input.reading ? "a number" : input.used[0];
  return result(finish(spec, main, useFn ? [fnDef] : []), `finds the factorial of ${what}`, [
    ...inputNotes,
    ...notes,
  ]);
}

const advance = () => [
  I.let_("term", "long", I.add("a", "b")),
  I.set("a", "b"),
  I.set("b", "term"),
];
const pair = () => [I.let_("a", "long", 0), I.let_("b", "long", 1)];
const fibFn = () =>
  I.func("fibonacci", [I.param("n", "int")], "long", [
    I.if_(I.le("n", 1), [I.ret("n")]),
    I.ret(I.add(I.call("fibonacci", I.sub("n", 1)), I.call("fibonacci", I.sub("n", 2)))),
  ]);
const SLOW = "Plain recursion recomputes the same terms, so it gets slow beyond about 35 terms.";

export function fibonacci(spec) {
  const rec = recursive(spec);
  if (spec.mode === "check") {
    const input = scalar(spec, "n", "Enter a number: ", 21);
    const main = [
      ...input.stmts,
      ...pair(),
      I.while_(I.lt("a", "n"), advance()),
      I.if_(
        I.eq("a", "n"),
        [I.print(I.v("n"), " is a Fibonacci number.")],
        [I.print(I.v("n"), " is not a Fibonacci number.")],
      ),
    ];
    const notes = [
      input.note,
      "Generates Fibonacci numbers until it reaches or passes the number.",
    ];
    return result(
      finish(spec, main),
      "checks whether a number is in the Fibonacci sequence",
      notes,
    );
  }
  if (spec.mode === "nth") {
    const fixed = typeof spec.n === "number";
    const read = [I.read("n", "int", "Enter the position (0 for the first term): ")];
    const label = ["Fibonacci number at position ", I.v("n"), " = "];
    const body = rec
      ? [I.print(...label, I.call("fibonacci", "n"))]
      : [...pair(), I.for_("i", 1, "n", advance(), { primary: true }), I.print(...label, I.v("a"))];
    const main = fixed
      ? [I.let_("n", "int", spec.n), ...body]
      : [...read, I.if_(I.lt("n", 0), [I.print("Please enter a position of 0 or more.")], body)];
    const notes = [
      fixed ? `Uses position ${spec.n} from your request.` : null,
      "Counts positions from 0, so F(0) = 0, F(1) = 1, F(2) = 1.",
      rec ? RECURSION : loopNote(spec),
      rec ? SLOW : null,
    ];
    return result(
      finish(spec, main, rec ? [fibFn()] : []),
      `finds the Fibonacci number at ${fixed ? `position ${spec.n}` : "a position you enter"}`,
      notes,
    );
  }
  const notes = [];
  const body = [];
  const sum = spec.sum ? [I.op("total", "+", rec ? I.call("fibonacci", "i") : I.v("a"))] : [];
  if (spec.sum) body.push(I.let_("total", "long", 0));
  let terms = null;
  if (spec.limit) {
    const { value, exclusive } = spec.limit;
    const within = (x) => (exclusive ? I.lt(x, value) : I.le(x, value));
    body.push(I.write(`Fibonacci numbers ${exclusive ? "below" : "up to"} ${value}:`));
    if (rec) {
      const step = [
        I.write(" ", I.v("value")),
        ...(spec.sum ? [I.op("total", "+", "value")] : []),
        I.inc("i"),
        I.set("value", I.call("fibonacci", "i")),
      ];
      body.push(
        I.let_("i", "int", 0),
        I.let_("value", "long", I.call("fibonacci", 0)),
        I.while_(within("value"), step),
      );
    } else {
      body.push(...pair(), I.while_(within("a"), [I.write(" ", I.v("a")), ...sum, ...advance()]));
    }
    body.push(I.print());
    notes.push(`Stops at ${value}, as requested.`);
  } else {
    terms = typeof spec.terms === "number" ? Math.min(Math.trunc(spec.terms), 90) : null;
    const count = terms === null ? I.v("terms") : I.num(terms);
    if (!rec) body.push(...pair());
    body.push(
      I.write(...joinParts("First ", count, " Fibonacci numbers:")),
      rec
        ? I.for_("i", 0, count, [I.write(" ", I.call("fibonacci", "i")), ...sum], {
            inclusive: false,
            primary: true,
          })
        : I.for_("i", 1, count, [I.write(" ", I.v("a")), ...sum, ...advance()], { primary: true }),
      I.print(),
    );
    if (terms === null) notes.push("Reads how many terms to print.");
    else
      notes.push(
        spec.terms > 90
          ? "Stops at 90 terms, since later terms overflow a 64-bit integer."
          : `Prints ${terms} terms, as requested.`,
      );
  }
  if (spec.sum) body.push(I.print("Sum = ", I.v("total")));
  const reading = !spec.limit && terms === null;
  const main = reading
    ? [
        I.read("terms", "int", "Enter the number of terms: "),
        I.if_(I.lt("terms", 1), [I.print("Please enter a positive number of terms.")], body),
      ]
    : body;
  notes.push("Starts the series at 0, 1.", rec ? RECURSION : loopNote(spec), rec ? SLOW : null);
  return result(
    finish(spec, main, rec ? [fibFn()] : []),
    `prints the Fibonacci series${spec.sum ? " and its sum" : ""}`,
    notes,
  );
}

// Trial division up to the square root; `number` is the parameter name inside isPrime.
function isPrimeFn(spec) {
  if (recursive(spec)) {
    return I.func("isPrime", [I.param("number", "int"), I.param("divisor", "int")], "bool", [
      I.if_(I.lt("number", 2), [I.ret(false)]),
      I.if_(I.gt(I.mul("divisor", "divisor"), "number"), [I.ret(true)]),
      I.if_(I.eq(I.mod("number", "divisor"), 0), [I.ret(false)]),
      I.ret(I.call("isPrime", "number", I.add("divisor", 1))),
    ]);
  }
  const test = [I.if_(I.eq(I.mod("number", "divisor"), 0), [I.ret(false)])];
  const loop =
    spec.flags.loop === "for"
      ? [I.for_("divisor", 2, I.div("number", 2), test, { fixed: true })]
      : [
          I.let_("divisor", "int", 2),
          I.while_(I.le(I.mul("divisor", "divisor"), "number"), [...test, I.inc("divisor")]),
        ];
  return I.func("isPrime", [I.param("number", "int")], "bool", [
    I.if_(I.lt("number", 2), [I.ret(false)]),
    ...loop,
    I.ret(true),
  ]);
}

const primeCall = (spec, x) => (recursive(spec) ? I.call("isPrime", x, 2) : I.call("isPrime", x));

function sieve(spec, lang) {
  const { range, limit: cap, values } = spec.ctx;
  const limit =
    range?.to ?? (typeof cap?.value === "number" ? cap.value - (cap.exclusive ? 1 : 0) : values[0]);
  const fixed = typeof limit === "number" && limit >= 2;
  const body = [
    I.newArray("isPrime", "bool", I.add("limit", 1)),
    I.for_("i", 2, "limit", [I.set(I.idx("isPrime", "i"), true)], { fixed: true }),
    I.let_("p", "int", 2),
    I.while_(I.le(I.mul("p", "p"), "limit"), [
      I.if_(I.idx("isPrime", "p"), [
        I.let_("multiple", "int", I.mul("p", "p")),
        I.while_(I.le("multiple", "limit"), [
          I.set(I.idx("isPrime", "multiple"), false),
          I.op("multiple", "+", "p"),
        ]),
      ]),
      I.inc("p"),
    ]),
    I.write(
      ...joinParts(
        "Prime numbers up to ",
        fixed ? I.num(Math.min(Math.trunc(limit), 1000000)) : I.v("limit"),
        ":",
      ),
    ),
    I.for_("i", 2, "limit", [I.if_(I.idx("isPrime", "i"), [I.write(" ", I.v("i"))])], {
      fixed: true,
    }),
    I.print(),
  ];
  const main = fixed
    ? [I.let_("limit", "int", Math.min(Math.trunc(limit), 1000000)), ...body]
    : [
        I.read("limit", "int", "Enter the upper limit: "),
        I.if_(I.lt("limit", 2), [I.print("Please enter a limit of 2 or more.")], body),
      ];
  const notes = [
    "Uses the Sieve of Eratosthenes: each prime crosses out its multiples, starting from its square.",
  ];
  if (lang === "c")
    notes.push(
      "The array lives on the stack; for limits in the millions, allocate it with malloc instead.",
    );
  return result(
    finish(spec, main),
    `lists primes up to ${fixed ? limit : "a limit you enter"} with the Sieve of Eratosthenes`,
    notes,
  );
}

export function prime(spec, lang) {
  if (spec.sieve) return sieve(spec, lang);
  const notes = [];
  if (spec.mode === "check") {
    if (spec.flags.loop === "do-while") notes.push(DO_WHILE_NOTE);
    const input = scalar(spec, "n", "Enter a number: ", 29);
    const say = (test) =>
      I.if_(
        test,
        [I.print(I.v("n"), " is a prime number.")],
        [I.print(I.v("n"), " is not a prime number.")],
      );
    notes.push(
      input.note,
      "Only tests divisors up to the square root, since a larger factor would pair with a smaller one.",
    );
    if (recursive(spec) || spec.flags.func) {
      notes.push(recursive(spec) ? RECURSION : "The check is done in a separate isPrime function.");
      return result(
        finish(spec, [...input.stmts, say(primeCall(spec, "n"))], [isPrimeFn(spec)]),
        "checks whether a number is prime",
        notes,
      );
    }
    const found = [I.if_(I.eq(I.mod("n", "i"), 0), [I.set("isPrime", false), I.brk()])];
    const loop =
      spec.flags.loop === "for"
        ? [I.for_("i", 2, I.div("n", 2), found, { fixed: true })]
        : [I.let_("i", "int", 2), I.while_(I.le(I.mul("i", "i"), "n"), [...found, I.inc("i")])];
    const main = [
      ...input.stmts,
      I.let_("isPrime", "bool", I.ge("n", 2)),
      ...loop,
      say(I.v("isPrime")),
    ];
    return result(finish(spec, main), "checks whether a number is prime", notes);
  }
  const sumStep = spec.sum ? [I.op("total", "+", "i")] : [];
  const totals = spec.sum ? [I.let_("total", "long", 0)] : [];
  const sumLine = spec.sum ? [I.print("Sum = ", I.v("total"))] : [];
  const tested = recursive(spec)
    ? RECURSION
    : "Each number is tested by an isPrime function that tries divisors up to its square root.";
  if (spec.count !== null && spec.count !== undefined && !spec.ctx.range && !spec.ctx.limit) {
    const fixed = typeof spec.count === "number";
    const count = fixed ? I.num(Math.min(Math.trunc(spec.count), 10000)) : I.v("count");
    const step = [
      I.if_(primeCall(spec, "i"), [I.write(" ", I.v("i")), I.inc("found"), ...sumStep]),
      I.inc("i"),
    ];
    const style = spec.flags.loop;
    const doLoop = style === "do-while" && (!fixed || count.value >= 1);
    const body = [
      ...totals,
      I.let_("found", "int", 0),
      I.let_("i", "int", 2),
      I.write(...joinParts("First ", count, " prime numbers:")),
      doLoop ? I.doWhile(step, I.lt("found", count)) : I.while_(I.lt("found", count), step),
      I.print(),
      ...sumLine,
    ];
    const main = fixed
      ? body
      : [
          I.read("count", "int", "Enter how many primes to print: "),
          I.if_(I.lt("count", 1), [I.print("Please enter a positive count.")], body),
        ];
    const loopText =
      style === "for"
        ? "Uses a `while` loop, since the number of candidates to test is not known in advance."
        : style !== "do-while" || doLoop
          ? loopNote(spec)
          : null;
    return result(
      finish(spec, main, [isPrimeFn(spec)]),
      `prints the first ${fixed ? count.value : "n"} prime numbers${spec.sum ? " and their sum" : ""}`,
      [loopText, tested],
    );
  }
  const vars = rangeVars(spec, rangeOf(spec, { from: 1, to: 100 }));
  const main = [
    ...vars.stmts,
    ...totals,
    ...(spec.tally ? [I.let_("found", "int", 0)] : []),
    I.write(...spanParts("Prime numbers from ", vars.start, vars.end, ":")),
    I.for_(
      "i",
      vars.start,
      vars.end,
      [
        I.if_(primeCall(spec, "i"), [
          I.write(" ", I.v("i")),
          ...(spec.tally ? [I.inc("found")] : []),
          ...sumStep,
        ]),
      ],
      { primary: true },
    ),
    I.print(),
    ...(spec.tally ? [I.print("Count = ", I.v("found"))] : []),
    ...sumLine,
  ];
  return result(finish(spec, main, [isPrimeFn(spec)]), "prints the prime numbers in a range", [
    ...vars.notes,
    loopNote(spec),
    tested,
  ]);
}

export function primeFactors(spec) {
  const { input, wrap, notes } = single(
    spec,
    "Enter a number: ",
    60,
    2,
    "Please enter a number greater than 1.",
  );
  const body = [
    I.write("Prime factors of ", I.v("n"), ":"),
    I.let_("num", "int", "n"),
    I.let_("divisor", "int", 2),
    I.while_(I.le(I.mul("divisor", "divisor"), "num"), [
      I.while_(I.eq(I.mod("num", "divisor"), 0), [
        I.write(" ", I.v("divisor")),
        I.op("num", "/", "divisor"),
      ]),
      I.inc("divisor"),
    ]),
    I.if_(I.gt("num", 1), [I.write(" ", I.v("num"))]),
    I.print(),
  ];
  notes.push(
    "Divides out each factor as many times as it appears; whatever is left above 1 is also prime.",
  );
  return result(
    finish(spec, [...input.stmts, ...wrap(body)]),
    `finds the prime factors of ${input.reading ? "a number" : input.used[0]}`,
    notes,
  );
}

export function factors(spec) {
  const { input, wrap, notes } = single(
    spec,
    "Enter a number: ",
    12,
    1,
    "Please enter a positive number.",
  );
  const body = [
    ...(spec.sum ? [I.let_("total", "int", 0)] : []),
    I.write("Factors of ", I.v("n"), ":"),
    I.for_(
      "i",
      1,
      "n",
      [
        I.if_(I.eq(I.mod("n", "i"), 0), [
          I.write(" ", I.v("i")),
          ...(spec.sum ? [I.op("total", "+", "i")] : []),
        ]),
      ],
      { primary: true },
    ),
    I.print(),
    ...(spec.sum ? [I.print("Sum of factors = ", I.v("total"))] : []),
  ];
  notes.push(loopNote(spec));
  return result(
    finish(spec, [...input.stmts, ...wrap(body)]),
    `prints the factors of ${input.reading ? "a number" : input.used[0]}${spec.sum ? " and their sum" : ""}`,
    notes,
  );
}
