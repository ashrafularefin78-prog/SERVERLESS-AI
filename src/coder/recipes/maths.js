import * as I from "../ir.js";
import { countOf } from "../spec/text.js";
import { NAMES, ORDINALS, WORDS } from "./basic.js";
import { recursive, RECURSION } from "./numbers.js";
import { finish, joinParts, literal, loopNote, numericLiterals, rangeOf, rangeVars, result, scalar, scalars, valueType, wantsInput, withArray } from "./util.js";

const GCD_SAMPLES = [12, 18, 30, 42, 54];
const NEWTON = "Uses Newton's method instead of a built-in function: it keeps improving the guess until it is accurate to about six significant digits.";

function nameList(names) {
  return names.flatMap((name, index) => (index === 0 ? [I.v(name)] : [index === names.length - 1 ? " and " : ", ", I.v(name)]));
}

// Rejects zero or negative inputs at run time unless every literal is already positive.
function positive(input, names, body) {
  if (!input.reading && input.used.every((value) => value > 0)) return body;
  const bad = names.map((name) => I.le(name, 0)).reduce((acc, test) => I.or(acc, test));
  return [I.if_(bad, [I.print("Please enter positive numbers.")], body)];
}

function euclid(spec, x, y, type) {
  const step = [I.let_("remainder", type, I.mod(x, y)), I.set(x, y), I.set(y, "remainder")];
  return spec.flags.loop === "do-while" ? I.doWhile(step, I.ne(y, 0)) : I.while_(I.ne(y, 0), step);
}

function trial(name, a, b, type) {
  return [
    I.let_(name, type, 1),
    I.let_("smaller", type, I.cond(I.lt(a, b), a, b)),
    I.for_("i", 1, "smaller", [I.if_(I.and(I.eq(I.mod(a, "i"), 0), I.eq(I.mod(b, "i"), 0)), [I.set(name, "i")])], { primary: true }),
  ];
}

function gcdFn(spec, type) {
  const params = [I.param("a", type), I.param("b", type)];
  if (recursive(spec)) return I.func("gcd", params, type, [I.if_(I.eq("b", 0), [I.ret("a")]), I.ret(I.call("gcd", "b", I.mod("a", "b")))]);
  if (spec.flags.loop === "for") return I.func("gcd", params, type, [...trial("result", "a", "b", type), I.ret("result")]);
  return I.func("gcd", params, type, [euclid(spec, "a", "b", type), I.ret("a")]);
}

const lcmFn = (type) =>
  I.func("lcm", [I.param("a", type), I.param("b", type)], "long", [I.ret(I.mul(I.div(type === "long" ? I.v("a") : I.toLong("a"), I.call("gcd", "a", "b")), "b"))]);

export function gcd(spec) {
  const { ctx, flags } = spec;
  const label = /\bhcf\b|\bhighest\s+common\s+factor\b/.test(ctx.text) ? "HCF" : "GCD";
  const what = spec.gcd && spec.lcm ? `${label} and LCM` : spec.gcd ? label : "LCM";
  const literals = numericLiterals(spec);
  const k = countOf(ctx, /numbers?|integers?|values?|elements?/);
  const arrayMode = flags.array || k === "n" || (typeof k === "number" && k > 5) || literals.length > 5;
  const count = arrayMode ? 0 : Math.min(Math.max(typeof k === "number" ? Math.trunc(k) : literals.length, 2), 5);
  const many = arrayMode || count > 2;
  const type = spec.lcm && many ? "long" : "int";
  const useFn = many || recursive(spec) || flags.func;
  const functions = useFn ? [gcdFn(spec, type), ...(spec.lcm ? [lcmFn(type)] : [])] : [];
  const notes = [];
  if (recursive(spec)) notes.push("Uses recursion with Euclid's rule gcd(a, b) = gcd(b, a mod b), stopping when b is 0.");
  else if (flags.loop === "for") notes.push("Tries every number from 1 up to the smaller value and keeps the largest one that divides both.");
  else notes.push("Uses Euclid's algorithm: the pair (a, b) becomes (b, a mod b) until the remainder is 0.", loopNote(spec));
  if (spec.lcm) notes.push("Computes the LCM as a / GCD × b, dividing first so the product stays small.");

  if (arrayMode) {
    const fold = (name, fnName, foldType) => [
      I.let_(name, foldType, I.idx("arr", 0)),
      I.for_("i", 1, "n", [I.set(name, I.call(fnName, name, I.idx("arr", "i")))], { inclusive: false, fixed: true }),
    ];
    const body = [
      ...(spec.gcd ? [...fold("divisor", "gcd", type), I.print(`${label} of the numbers = `, I.v("divisor"))] : []),
      ...(spec.lcm ? [...fold("multiple", "lcm", "long"), I.print("LCM of the numbers = ", I.v("multiple"))] : []),
    ];
    const arr = withArray(spec, body, { defaults: GCD_SAMPLES.slice(0, 4), literals });
    notes.unshift(arr.note);
    notes.push("Folds the list one number at a time and expects positive numbers.");
    return result(finish(spec, arr.stmts, functions), `finds the ${what} of a list of numbers`, notes);
  }

  const names = NAMES.slice(0, count);
  const input = scalars(spec, names.map((name, index) => [name, `Enter ${ORDINALS[index]} number: `, GCD_SAMPLES[index]]), { literals });
  const which = joinParts(" of ", ...nameList(names), " = ");
  const body = [];
  if (count > 2) {
    if (spec.gcd) {
      body.push(I.let_("divisor", type, I.call("gcd", "a", "b")), ...names.slice(2).map((name) => I.set("divisor", I.call("gcd", "divisor", name))));
      body.push(I.print(label, ...which, I.v("divisor")));
    }
    if (spec.lcm) {
      body.push(I.let_("multiple", "long", I.call("lcm", "a", "b")), ...names.slice(2).map((name) => I.set("multiple", I.call("lcm", "multiple", name))));
      body.push(I.print("LCM", ...which, I.v("multiple")));
    }
  } else if (useFn) {
    if (spec.gcd) body.push(I.print(label, ...which, I.call("gcd", "a", "b")));
    if (spec.lcm) body.push(I.print("LCM", ...which, I.call("lcm", "a", "b")));
  } else {
    if (flags.loop === "for") body.push(...trial("gcd", "a", "b", "int"));
    else body.push(I.let_("gcd", "int", "a"), I.let_("divisor", "int", "b"), euclid(spec, "gcd", "divisor", "int"));
    if (spec.gcd) body.push(I.print(label, ...which, I.v("gcd")));
    if (spec.lcm) body.push(I.let_("lcm", "long", I.mul(I.div(I.toLong("a"), "gcd"), "b")), I.print("LCM", ...which, I.v("lcm")));
  }
  notes.unshift(input.note);
  const main = [...input.stmts, ...positive(input, names, body)];
  return result(finish(spec, main, functions), `finds the ${what} of ${WORDS[count]} numbers`, notes);
}

function generalPower(spec) {
  const { flags } = spec;
  const literals = numericLiterals(spec);
  const reading = wantsInput(spec, literals.length, 2);
  const [baseValue, expValue] = [literals[0] ?? 2, literals[1] ?? 10];
  const fractional = !reading && !Number.isInteger(expValue);
  const floaty = fractional || (!reading && expValue < 0);
  const baseType = flags.type === "double" || floaty || (!reading && !Number.isInteger(baseValue)) ? "double" : flags.type === "long" ? "long" : "int";
  const expType = fractional ? "double" : "int";
  const type = baseType === "double" ? "double" : "long";
  const rec = recursive(spec) && !floaty;
  const builtin = floaty || (flags.builtin === true && !rec);
  const powExpr = type === "long" ? I.toLong(I.fn("pow", "base", "exponent")) : I.fn("pow", "base", "exponent");
  const loop = [I.let_("result", type, literal(1, type)), I.for_("i", 1, "exponent", [I.op("result", "*", "base")], { primary: true })];
  const params = [I.param("base", baseType), I.param("exponent", expType)];
  let fnDef = null;
  if (rec) {
    fnDef = I.func("power", params, type, [I.if_(I.eq("exponent", 0), [I.ret(literal(1, type))]), I.ret(I.mul("base", I.call("power", "base", I.sub("exponent", 1))))]);
  } else if (flags.func) {
    fnDef = I.func("power", params, type, builtin ? [I.ret(powExpr)] : [...loop, I.ret("result")]);
  }
  const value = fnDef ? I.call("power", "base", "exponent") : builtin ? powExpr : I.v("result");
  const shown = reading ? [I.v("base"), "^", I.v("exponent")] : [`${baseValue}^${expValue}`];
  const body = [...(fnDef || builtin ? [] : loop), I.print(...shown, " = ", type === "double" ? I.fmt(value, 4) : value)];
  const needsGuard = reading && !(builtin && type === "double");
  const stmts = reading
    ? [I.read("base", baseType, "Enter the base: "), I.read("exponent", expType, "Enter the exponent: ")]
    : [I.let_("base", baseType, literal(baseValue, baseType)), I.let_("exponent", expType, literal(expValue, expType))];
  const main = [...stmts, ...(needsGuard ? [I.if_(I.lt("exponent", 0), [I.print("Please enter an exponent of 0 or more.")], body)] : body)];
  const notes = [
    reading ? null : literals.length >= 2 ? `Uses ${baseValue} and ${expValue} from your request.` : `Uses sample values ${baseValue} and ${expValue} instead of reading input.`,
    rec ? RECURSION : builtin ? "Uses the built-in pow function." : "Multiplies the base by itself `exponent` times.",
    rec || builtin ? null : loopNote(spec),
    builtin && type === "long" ? "pow works with doubles, so the result is converted back to a whole number." : null,
    type === "long" ? "Uses a 64-bit integer, so very large powers will overflow." : null,
  ];
  return result(finish(spec, main, fnDef ? [fnDef] : []), "raises a number to a power", notes);
}

function squareCube(spec) {
  const { flags } = spec;
  const kinds = spec.both ? ["square", "cube"] : [spec.exponent === 3 ? "cube" : "square"];
  const type = spec.list ? "int" : valueType(spec);
  const resultType = type === "double" ? "double" : "long";
  const wide = (x) => (type === "int" ? I.toLong(x) : I.E(x));
  const raise = (kind, x) => {
    if (flags.builtin === true) {
      const call = I.fn("pow", x, kind === "cube" ? 3 : 2);
      return resultType === "long" ? I.toLong(call) : call;
    }
    return kind === "cube" ? I.mul(I.mul(wide(x), x), x) : I.mul(wide(x), x);
  };
  const title = (kind) => (kind === "cube" ? "Cube" : "Square");
  const functions = flags.func ? kinds.map((kind) => I.func(kind, [I.param("n", type)], resultType, [I.ret(raise(kind, "n"))])) : [];
  const notes = [flags.builtin === true ? "Uses the built-in pow function." : null, flags.func ? `Each calculation is a separate function.` : null];
  if (resultType === "long") notes.push("Uses a 64-bit result so large values do not overflow.");
  const what = kinds.length === 2 ? "square and cube" : kinds[0];
  if (spec.list) {
    const vars = rangeVars(spec, rangeOf(spec, { from: 1, to: 10 }));
    const valueOf = (kind) => (flags.func ? I.call(kind, "i") : raise(kind, "i"));
    const line = spec.both ? I.print(I.v("i"), ": square = ", valueOf("square"), ", cube = ", valueOf("cube")) : I.print(`${title(kinds[0])} of `, I.v("i"), " = ", valueOf(kinds[0]));
    const main = [...vars.stmts, I.for_("i", vars.start, vars.end, [line], { primary: true })];
    return result(finish(spec, main, functions), `prints the ${what} of each number in a range`, [...vars.notes, loopNote(spec), ...notes]);
  }
  const input = scalar(spec, "n", "Enter a number: ", 5, { type });
  const main = [
    ...input.stmts,
    ...(flags.func ? [] : kinds.map((kind) => I.let_(kind, resultType, raise(kind, "n")))),
    ...kinds.map((kind) => I.print(`${title(kind)} of `, I.v("n"), " = ", flags.func ? I.call(kind, "n") : I.v(kind))),
  ];
  return result(finish(spec, main, functions), `finds the ${what} of ${input.reading ? "a number" : input.used[0]}`, [input.note, ...notes]);
}

export function power(spec) {
  return spec.exponent === null && !spec.both ? generalPower(spec) : squareCube(spec);
}

export function root(spec) {
  const cube = spec.kind === "cube";
  const manual = spec.flags.builtin === false;
  const input = scalar(spec, "x", "Enter a number: ", cube ? 27 : 25, { type: "double" });
  const tolerance = (value) => I.mul(I.dbl(0.000001), value);
  const say = I.print(`${cube ? "Cube" : "Square"} root of `, input.reading ? I.v("x") : String(input.used[0]), " = ", I.fmt("root", 4));
  const notes = [input.note];
  let main;
  if (cube) {
    const compute = manual
      ? [
          I.let_("value", "double", I.cond(I.lt("x", 0), I.neg("x"), "x")),
          I.let_("root", "double", I.cond(I.gt("value", 1), "value", I.dbl(1))),
          I.while_(I.gt(I.sub(I.mul(I.mul("root", "root"), "root"), "value"), tolerance("value")), [
            I.set("root", I.div(I.add(I.mul(2, "root"), I.div("value", I.mul("root", "root"))), 3)),
          ]),
        ]
      : [I.let_("root", "double", I.fn("pow", I.fn("abs", "x"), I.div(I.dbl(1), 3)))];
    main = [...input.stmts, ...compute, I.if_(I.lt("x", 0), [I.set("root", I.neg("root"))]), say];
    notes.push(manual ? NEWTON : "Raises |x| to the power 1/3 and restores the sign, since pow cannot take fractional powers of negative numbers.");
  } else {
    const compute = manual
      ? [
          I.let_("root", "double", I.cond(I.gt("x", 1), "x", I.dbl(1))),
          I.while_(I.gt(I.sub(I.mul("root", "root"), "x"), tolerance("x")), [I.set("root", I.div(I.add("root", I.div("x", "root")), 2))]),
        ]
      : [I.let_("root", "double", I.fn("sqrt", "x"))];
    const body = [...compute, say];
    const safe = !input.reading && input.used[0] >= 0;
    main = [...input.stmts, ...(safe ? body : [I.if_(I.lt("x", 0), [I.print("A negative number has no real square root.")], body)])];
    notes.push(manual ? NEWTON : "Uses the built-in sqrt function.");
  }
  notes.push("Prints the root to 4 decimal places.");
  return result(finish(spec, main), `finds the ${cube ? "cube" : "square"} root of ${input.reading ? "a number" : input.used[0]}`, notes);
}
