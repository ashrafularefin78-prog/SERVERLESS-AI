import * as I from "../ir.js";
import {
  finish,
  list,
  loopNote,
  numericLiterals,
  result,
  scalar,
  scalars,
  valueType,
  wantsInput,
} from "./util.js";

export const NAMES = ["a", "b", "c", "d", "e"];
export const ORDINALS = ["first", "second", "third", "fourth", "fifth"];
const SAMPLES = [10, 20, 30, 40, 50];
export const WORDS = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

export const numberFields = (k, names = NAMES) =>
  names
    .slice(0, k)
    .map((name, index) => [name, `Enter ${ORDINALS[index]} number: `, SAMPLES[index]]);

// fields: [name, prompt, fallback]; uses quoted text from the request when there is enough of it.
export function textFields(spec, fields) {
  const quoted = spec.ctx.quoted;
  const reading = wantsInput(spec, quoted.length, fields.length);
  const used = fields.map((field, index) => quoted[index] ?? field[2]);
  const stmts = fields.map(([name, prompt], index) =>
    reading ? I.read(name, "string", prompt) : I.let_(name, "string", I.str(used[index])),
  );
  const note = reading
    ? null
    : `Uses ${list(used.map((text) => `"${text}"`))}${quoted.length >= fields.length ? " from your request" : " as sample text"}.`;
  return { stmts, reading, used, note };
}

export function chainIf(branches, otherwise) {
  return branches.reduceRight((rest, [c, body]) => I.if_(c, body, rest), otherwise);
}

export function hello(spec) {
  const times =
    typeof spec.times === "number" && spec.times > 1
      ? Math.min(Math.trunc(spec.times), 1000)
      : null;
  const say = I.print(spec.message);
  if (!times) return result(finish(spec, [say]), `prints "${spec.message}"`);
  const program = finish(spec, [I.for_("i", 1, times, [say], { primary: true })]);
  return result(program, `prints "${spec.message}" ${times} times`, [
    `Repeats the message ${times} times with a loop.`,
    loopNote(spec),
  ]);
}

const OPS = {
  "+": { word: "Sum", fn: "add", noun: "addition", build: I.add },
  "-": { word: "Difference", fn: "subtract", noun: "subtraction", build: I.sub },
  "*": { word: "Product", fn: "multiply", noun: "multiplication", build: I.mul },
  "/": { word: "Quotient", fn: "divide", noun: "division", build: I.div },
  "%": { word: "Remainder", fn: "remainder", noun: "remainder", build: I.mod },
};

export function arithmetic(spec) {
  const literals = numericLiterals(spec);
  const type = valueType(spec, literals);
  const k = spec.k;
  const names = spec.ctx.names.length === k ? spec.ctx.names : NAMES.slice(0, k);
  const input = scalars(spec, numberFields(k, names), { type, literals });
  const notes = [input.note];
  let ops = spec.ops;
  if (type === "double" && ops.includes("%")) {
    ops = ops.filter((op) => op !== "%");
    notes.push(
      "The remainder operator `%` needs whole numbers, so it is left out for decimal values.",
    );
    if (!ops.length) ops = ["/"];
  }
  const whole = ops.includes("%") || /\bquotient\b|\binteger\s+division\b/.test(spec.ctx.text);
  const pairOnly = (op) => op === "/" || op === "%";
  const operands = (op) => (pairOnly(op) ? names.slice(0, 2) : names);
  const exprFor = (op, vars) => {
    if (op === "/" && !whole && type !== "double") return I.div(I.toDouble(vars[0]), vars[1]);
    return vars.slice(1).reduce((acc, name) => OPS[op].build(acc, name), I.v(vars[0]));
  };
  const functions = [];
  const valueOf = (op) => {
    if (!spec.flags.func) return exprFor(op, operands(op));
    const params = operands(op).map((name) => I.param(name, type));
    functions.push(
      I.func(OPS[op].fn, params, op === "/" && !whole ? "double" : type, [
        I.ret(exprFor(op, operands(op))),
      ]),
    );
    return I.call(OPS[op].fn, ...operands(op));
  };
  const single = ops.length === 1 && k === 2;
  const line = (op) =>
    single
      ? I.print(`${OPS[op].word} of `, I.v(names[0]), " and ", I.v(names[1]), " = ", valueOf(op))
      : I.print(`${OPS[op].word} = `, valueOf(op));
  const main = [...input.stmts, ...ops.filter((op) => !pairOnly(op)).map(line)];
  const risky = ops.filter(pairOnly);
  if (risky.length) {
    const zero = !input.reading && input.used[1] === 0;
    if (input.reading)
      main.push(I.if_(I.eq(names[1], 0), [I.print("Cannot divide by zero.")], risky.map(line)));
    else if (zero) main.push(I.print("Cannot divide by zero."));
    else main.push(...risky.map(line));
    if (input.reading || zero) notes.push("Checks for division by zero before dividing.");
  }
  if (type === "double")
    notes.push("Works with decimal numbers; results print with 2 decimal places.");
  if (ops.includes("/") && !whole && type !== "double")
    notes.push("Converts to a decimal before dividing, so 7 / 2 gives 3.50.");
  if (spec.flags.func)
    notes.push(
      ops.length > 1
        ? "Each operation is its own function."
        : "The calculation is done in a separate function.",
    );
  const what = input.reading
    ? `${WORDS[k]} ${type === "double" ? "decimal " : ""}numbers`
    : list(input.used);
  const description =
    ops.length === 1
      ? `finds the ${OPS[ops[0]].word.toLowerCase()} of ${what}`
      : `performs ${list(ops.map((op) => OPS[op].noun))} on ${what}`;
  return result(finish(spec, main, functions), description, notes);
}

function calcCases(type, key) {
  const quotient = type === "int" ? I.div(I.toDouble("a"), "b") : I.div("a", "b");
  const cases = [
    ["+", 1, [I.print("Result = ", I.add("a", "b"))]],
    ["-", 2, [I.print("Result = ", I.sub("a", "b"))]],
    ["*", 3, [I.print("Result = ", I.mul("a", "b"))]],
    [
      "/",
      4,
      [
        I.if_(
          I.eq("b", 0),
          [I.print("Error: division by zero.")],
          [I.print("Result = ", quotient)],
        ),
      ],
    ],
  ];
  return cases.map(([symbol, number, body]) => [
    key === "symbol" ? I.chr(symbol) : I.num(number),
    body,
  ]);
}

export function calculator(spec) {
  const useIf = !spec.flags.switch && (spec.flags.ifElse || /\bif\b/.test(spec.ctx.text));
  const type = spec.flags.type === "int" ? "int" : "double";
  const branch = (key, cases, otherwise) =>
    useIf
      ? chainIf(
          cases.map(([value, body]) => [I.eq(key, value), body]),
          otherwise,
        )
      : I.switch_(
          I.v(key),
          cases.map(([value, body]) => I.kase([value], body)),
          otherwise,
        );
  const notes = [
    useIf
      ? "Picks the operation with an if-else chain."
      : "Picks the operation with a switch statement.",
  ];
  if (spec.repeat) {
    const cases = [...calcCases(type, "choice"), [I.num(5), [I.print("Goodbye!")]]];
    const main = [
      I.let_("choice", "int", 0),
      I.let_("a", type, type === "double" ? I.dbl(0) : 0),
      I.let_("b", type, type === "double" ? I.dbl(0) : 0),
      I.doWhile(
        [
          I.print("1. Add"),
          I.print("2. Subtract"),
          I.print("3. Multiply"),
          I.print("4. Divide"),
          I.print("5. Exit"),
          I.read("choice", "int", "Enter your choice: "),
          I.if_(I.and(I.ge("choice", 1), I.le("choice", 4)), [
            I.read("a", type, "Enter first number: "),
            I.read("b", type, "Enter second number: "),
          ]),
          branch("choice", cases, [I.print("Invalid choice.")]),
        ],
        I.ne("choice", 5),
      ),
    ];
    notes.push("Shows a menu and repeats until you choose 5 (Exit).");
    return result(finish(spec, main), "runs a menu-driven calculator until the user exits", notes);
  }
  const main = [
    I.read("a", type, "Enter first number: "),
    I.read("symbol", "char", "Enter an operator (+, -, *, /): "),
    I.read("b", type, "Enter second number: "),
    branch("symbol", calcCases(type, "symbol"), [I.print("Invalid operator.")]),
  ];
  notes.push("Checks for division by zero.");
  return result(finish(spec, main), "works as a simple calculator for +, -, * and /", notes);
}

export function swap(spec, lang) {
  const strings = spec.strings;
  const literals = strings ? spec.ctx.quoted : numericLiterals(spec);
  const type = strings ? "string" : valueType(spec, literals);
  const [x, y] = spec.names.length === 2 ? spec.names : ["a", "b"];
  const fields = [
    [x, strings ? "Enter first string: " : `Enter ${x}: `, strings ? "Hello" : 10],
    [y, strings ? "Enter second string: " : `Enter ${y}: `, strings ? "World" : 20],
  ];
  const input = strings ? textFields(spec, fields) : scalars(spec, fields, { type, literals });
  const show = (label) => I.print(`${label}: ${x} = `, I.v(x), `, ${y} = `, I.v(y));
  const notes = [input.note];
  const functions = [];
  let steps;
  const pointers =
    (spec.flags.pointer || spec.flags.byRef) && (lang === "c" || lang === "cpp") && !strings;
  if (pointers) {
    functions.push(
      I.func("swapValues", [I.param("first", `${type}*`), I.param("second", `${type}*`)], "void", [
        I.let_("temp", type, I.deref("first")),
        I.set(I.deref("first"), I.deref("second")),
        I.set(I.deref("second"), "temp"),
      ]),
    );
    steps = [I.callStmt("swapValues", I.addr(x), I.addr(y))];
    notes.push(
      "Passes the addresses of both variables to a function, which swaps them through pointers.",
    );
  } else if (
    (spec.flags.temp === false || (spec.flags.bitwise && spec.flags.temp !== true)) &&
    !strings
  ) {
    if (spec.flags.bitwise && type !== "double") {
      steps = [I.op(x, "^", y), I.op(y, "^", x), I.op(x, "^", y)];
      notes.push("Swaps with XOR, so no third variable is needed.");
    } else {
      steps = [I.set(x, I.add(x, y)), I.set(y, I.sub(x, y)), I.set(x, I.sub(x, y))];
      notes.push("Swaps with addition and subtraction, so no third variable is needed.");
    }
  } else {
    const temp =
      spec.flags.temp === true || !["python", "javascript", "typescript", "go"].includes(lang);
    steps = [{ ...I.swap(x, y, type), temp }];
    notes.push(
      temp
        ? "Uses a temporary variable to hold one value during the swap."
        : "Uses tuple assignment, the idiomatic swap in this language.",
    );
    if (spec.flags.temp === false && strings)
      notes.push(
        "Strings are swapped with a temporary variable; arithmetic tricks only work for numbers.",
      );
  }
  if ((spec.flags.pointer || spec.flags.byRef) && !pointers && !strings) {
    notes.push(
      "This language has no pointers to plain variables, so the swap happens directly in the main code.",
    );
  }
  const main = [...input.stmts, show("Before swapping"), ...steps, show("After swapping")];
  return result(
    finish(spec, main, functions),
    `swaps two ${strings ? "strings" : "numbers"}`,
    notes,
  );
}

export function evenOdd(spec) {
  const input = scalar(spec, "n", "Enter a number: ", 7, { type: "int" });
  const noMod = /\bwithout\s+(?:using\s+)?(?:the\s+)?(?:%|modulus|modulo|mod)\b/.test(
    spec.ctx.text,
  );
  const notes = [input.note];
  let test = I.eq(I.mod("n", 2), 0);
  if (spec.flags.bitwise) {
    test = I.eq(I.band("n", 1), 0);
    notes.push("Uses bitwise AND: the last bit of an even number is 0.");
  } else if (noMod) {
    test = I.eq(I.mul(I.div("n", 2), 2), "n");
    notes.push(
      "Avoids `%`: integer division by 2 and back gives the same number only when it is even.",
    );
  }
  const functions = [];
  if (spec.flags.func) {
    functions.push(I.func("isEven", [I.param("n", "int")], "bool", [I.ret(test)]));
    test = I.call("isEven", "n");
    notes.push("The check is done in a separate function that returns true or false.");
  }
  let main;
  if (spec.flags.ternary) {
    main = [
      ...input.stmts,
      I.let_("kind", "string", I.cond(test, I.str("even"), I.str("odd"))),
      I.print(I.v("n"), " is ", I.v("kind"), "."),
    ];
    notes.push("Uses the ternary (conditional) operator to choose the word.");
  } else if (spec.flags.switch && !spec.flags.bitwise && !noMod && !spec.flags.func) {
    main = [
      ...input.stmts,
      I.switch_(
        I.mod("n", 2),
        [I.kase([I.num(0)], [I.print(I.v("n"), " is even.")])],
        [I.print(I.v("n"), " is odd.")],
      ),
    ];
    notes.push("Uses a switch on `n % 2`.");
  } else {
    main = [
      ...input.stmts,
      I.if_(test, [I.print(I.v("n"), " is even.")], [I.print(I.v("n"), " is odd.")]),
    ];
  }
  return result(finish(spec, main, functions), "checks whether a number is even or odd", notes);
}

export function positiveNegative(spec) {
  const literals = numericLiterals(spec).filter(
    (value) => value !== 0 || !/\bzero\b/.test(spec.ctx.text),
  );
  const type = valueType(spec, literals);
  const input = scalar(spec, "n", "Enter a number: ", -5, { type, literals });
  const main = [
    ...input.stmts,
    chainIf(
      [
        [I.gt("n", 0), [I.print(I.v("n"), " is positive.")]],
        [I.lt("n", 0), [I.print(I.v("n"), " is negative.")]],
      ],
      [I.print("The number is zero.")],
    ),
  ];
  return result(finish(spec, main), "checks whether a number is positive, negative or zero", [
    input.note,
  ]);
}
