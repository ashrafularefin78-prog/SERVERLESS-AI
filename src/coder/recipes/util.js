import * as I from "../ir.js";

export const DEFAULT_ARRAY = [12, 45, 7, 23, 56, 89, 34];

export const numericLiterals = (spec) =>
  spec.ctx.values.filter((value) => typeof value === "number");

export const literal = (value, type = "int") =>
  type === "double" ? I.dbl(value) : I.num(value, type);

export function valueType(spec, literals = numericLiterals(spec), fallback = "int") {
  if (spec.flags.type) return spec.flags.type;
  if (literals.some((value) => !Number.isInteger(value))) return "double";
  return fallback;
}

export function wantsInput(spec, have, need) {
  if (spec.flags.input === true) return true;
  if (spec.flags.input === false) return false;
  return have < need;
}

export function list(items) {
  const parts = items.map(String);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// fields: [name, prompt, fallback]
export function scalars(
  spec,
  fields,
  { type = "int", literals = numericLiterals(spec), input } = {},
) {
  const reading = input ?? wantsInput(spec, literals.length, fields.length);
  const used = fields.map((field, index) => literals[index] ?? field[2]);
  const stmts = fields.map(([name, prompt], index) =>
    reading ? I.read(name, type, prompt) : I.let_(name, type, literal(used[index], type)),
  );
  const note = reading
    ? null
    : literals.length >= fields.length
      ? `Uses the value${fields.length > 1 ? "s" : ""} from your request: ${list(used)}.`
      : `Uses sample value${fields.length > 1 ? "s" : ""} ${list(used)} instead of reading input.`;
  return { stmts, reading, used, note };
}

export function scalar(spec, name, prompt, fallback, options = {}) {
  return scalars(spec, [[name, prompt, fallback]], options);
}

export const guard = (body, size = "n", label = "elements") =>
  I.if_(
    I.or(I.lt(size, 1), I.gt(size, 100)),
    [I.print(`Please enter between 1 and 100 ${label}.`)],
    body,
  );

// Gives `name` and `n` to the body, from literals, a fixed count, or user input.
export function withArray(spec, body, options = {}) {
  const {
    name = "arr",
    elem = "int",
    label = "element",
    count = null,
    defaults = DEFAULT_ARRAY,
  } = options;
  const literals = options.literals ?? numericLiterals(spec);
  const literalArray =
    spec.flags.input !== true && (literals.length >= 2 || spec.flags.input === false);
  if (literalArray) {
    const values = literals.length >= 2 ? literals : defaults;
    const note =
      literals.length >= 2
        ? `Uses the values from your request: ${list(values)}.`
        : `Uses a sample array (${values.join(", ")}) instead of reading input.`;
    return {
      stmts: [
        I.let_(
          name,
          `${elem}[]`,
          I.arr(
            values.map((value) => literal(value, elem)),
            elem,
          ),
        ),
        I.let_("n", "int", I.len(name)),
        ...body,
      ],
      reading: false,
      values,
      note,
    };
  }
  if (typeof count === "number" && count >= 1) {
    const size = Math.min(Math.trunc(count), 100);
    return {
      stmts: [I.let_("n", "int", size), I.readArray(name, elem, "n", label), ...body],
      reading: true,
      note: `Reads exactly ${plural(size, label)}, as requested.`,
    };
  }
  return {
    stmts: [
      I.read("n", "int", `Enter the number of ${label}s: `),
      guard([I.readArray(name, elem, "n", label), ...body], "n", `${label}s`),
    ],
    reading: true,
    note: `Reads how many ${label}s to use, then each ${label}.`,
  };
}

export function loopStyle(spec) {
  const style = spec.flags.loop;
  return style === "while" || style === "do-while" ? style : undefined;
}

export function finish(spec, main, functions = [], extra = {}) {
  const style = loopStyle(spec);
  return I.program(main, functions, style ? { loopStyle: style, ...extra } : extra);
}

export function loopNote(spec) {
  if (spec.flags.loop === "while") return "Uses a `while` loop, as requested.";
  if (spec.flags.loop === "do-while") return "Uses a `do-while` loop, as requested.";
  if (spec.flags.loop === "for") return "Uses a `for` loop, as requested.";
  return null;
}

export function result(program, description, notes = []) {
  return { program, description, notes: notes.filter(Boolean) };
}

// Range endpoints from the request: "1 to 100", "up to 50", "first 10", or input.
export function rangeOf(spec, { from = 1, to = 10, count = null } = {}) {
  const { range, limit } = spec.ctx;
  if (range) {
    const ends = [range.from, range.to];
    if (ends.every((x) => typeof x === "number"))
      return { from: ends[0], to: ends[1], fixed: true };
    return {
      from: typeof ends[0] === "number" ? ends[0] : null,
      to: typeof ends[1] === "number" ? ends[1] : null,
      fixed: false,
    };
  }
  if (limit && typeof limit.value === "number")
    return { from, to: limit.exclusive ? limit.value - 1 : limit.value, fixed: true };
  if (typeof count === "number") return { from, to: from + count - 1, fixed: true };
  if (spec.flags.input === false) return { from, to, fixed: true };
  return { from, to: null, fixed: false };
}

// Print parts with literal numbers folded into the neighbouring text.
export function joinParts(...pieces) {
  return pieces.reduce((parts, piece) => {
    const part =
      piece && typeof piece === "object" && piece.k === "num" ? String(piece.value) : piece;
    if (typeof part === "string" && typeof parts.at(-1) === "string")
      parts[parts.length - 1] += part;
    else parts.push(part);
    return parts;
  }, []);
}

export const spanParts = (prefix, start, end, suffix = "") =>
  joinParts(prefix, start, " to ", end, suffix);

// Statements that set `start`/`end` (or just `n`) from a range, reading what is missing.
export function rangeVars(
  spec,
  bounds,
  { startName = "start", endName = "end", label = "number" } = {},
) {
  const stmts = [];
  const notes = [];
  if (bounds.from === 1 && bounds.to === null) {
    stmts.push(I.read(endName, "int", `Enter the last ${label}: `));
    return {
      stmts,
      start: I.num(1),
      end: I.v(endName),
      notes: [`Reads the last ${label} from the user.`],
    };
  }
  if (bounds.from === null) stmts.push(I.read(startName, "int", `Enter the starting ${label}: `));
  if (bounds.to === null) stmts.push(I.read(endName, "int", `Enter the ending ${label}: `));
  if (bounds.fixed) notes.push(`Uses the range ${bounds.from} to ${bounds.to} from your request.`);
  return {
    stmts,
    start: bounds.from === null ? I.v(startName) : I.num(bounds.from),
    end: bounds.to === null ? I.v(endName) : I.num(bounds.to),
    notes,
  };
}
