// A tiny language-neutral program tree. Recipes build it once and each
// emitter renders it as idiomatic source for one language.

export function E(x) {
  if (x === null || x === undefined) return x;
  if (typeof x === "string") return { k: "var", name: x };
  if (typeof x === "number") return num(x);
  if (typeof x === "boolean") return { k: "bool", value: x };
  return x;
}

export const v = (name) => ({ k: "var", name });
export const num = (value, type) => ({
  k: "num",
  value,
  type: type || (Number.isInteger(value) ? "int" : "double"),
});
export const dbl = (value) => num(value, "double");
export const str = (value) => ({ k: "str", value });
export const chr = (value) => ({ k: "char", value });
export const bool = (value) => ({ k: "bool", value });

const binary = (op) => (l, r) => ({ k: "bin", op, l: E(l), r: E(r) });
export const add = binary("+");
export const sub = binary("-");
export const mul = binary("*");
export const div = binary("/");
export const mod = binary("%");
export const eq = binary("==");
export const ne = binary("!=");
export const lt = binary("<");
export const le = binary("<=");
export const gt = binary(">");
export const ge = binary(">=");
export const and = binary("&&");
export const or = binary("||");
export const band = binary("&");
export const xor = binary("^");

export const not = (e) => ({ k: "not", e: E(e) });
export const neg = (e) => ({ k: "neg", e: E(e) });
export const call = (name, ...args) => ({ k: "call", name, args: args.map(E) });
export const idx = (a, i) => ({ k: "idx", a: E(a), i: E(i) });
export const len = (e) => ({ k: "len", e: E(e) });
export const at = (s, i) => ({ k: "at", s: E(s), i: E(i) });
export const cond = (c, t, f) => ({ k: "cond", c: E(c), t: E(t), f: E(f) });
export const fn = (name, ...args) => ({ k: "fn", name, args: args.map(E) });
export const toDouble = (e) => ({ k: "cast", to: "double", e: E(e) });
export const toInt = (e) => ({ k: "cast", to: "int", e: E(e) });
export const toLong = (e) => ({ k: "cast", to: "long", e: E(e) });
export const arr = (values, elem = "int") => ({ k: "arr", values: values.map(E), elem });
export const addr = (e) => ({ k: "addr", e: E(e) });
export const deref = (e) => ({ k: "deref", e: E(e) });
export const fmt = (e, dp = 2) => ({ k: "fmt", e: E(e), dp });

export const let_ = (name, type, value, extra = {}) => ({
  k: "let",
  name,
  type,
  value: value === undefined ? undefined : E(value),
  ...extra,
});
export const set = (target, value) => ({ k: "set", target: E(target), value: E(value) });
export const op = (target, operator, value) => ({ k: "op", target: E(target), op: operator, value: E(value) });
export const inc = (target, by = 1) => op(target, "+", by);
export const dec = (target, by = 1) => op(target, "-", by);
export const read = (name, type, prompt) => ({ k: "read", name, type, prompt });
export const readArray = (name, elem, size, label = "element") => ({
  k: "readArray",
  name,
  elem,
  size: E(size),
  label,
});
export const newArray = (name, elem, size) => ({ k: "newArray", name, elem, size: E(size) });
export const print = (...parts) => ({ k: "print", parts, newline: true });
export const write = (...parts) => ({ k: "print", parts, newline: false });
export const if_ = (c, then, otherwise) => ({ k: "if", c: E(c), then, otherwise });
export const for_ = (name, from, to, body, options = {}) => ({
  k: "for",
  name,
  from: E(from),
  to: E(to),
  body,
  step: options.step ?? 1,
  inclusive: options.inclusive ?? true,
  primary: Boolean(options.primary),
  fixed: Boolean(options.fixed),
});
export const each = (name, type, coll, body) => ({ k: "each", name, type, coll: E(coll), body });
export const while_ = (c, body) => ({ k: "while", c: E(c), body });
export const doWhile = (body, c) => ({ k: "do", body, c: E(c) });
export const ret = (e) => ({ k: "ret", e: E(e) });
export const brk = () => ({ k: "break" });
export const callStmt = (name, ...args) => ({ k: "expr", e: call(name, ...args) });
export const switch_ = (value, cases, otherwise) => ({ k: "switch", value: E(value), cases, otherwise });
export const kase = (values, body) => ({ values: values.map(E), body });
export const gap = () => ({ k: "gap" });
export const swap = (a, b, type = "int") => ({ k: "swap", a: E(a), b: E(b), type });
export const sortArray = (name, size, desc = false) => ({ k: "sort", arr: E(name), size: E(size), desc });

export const param = (name, type, extra = {}) => ({ name, type, ...extra });
export const func = (name, params, returns, body) => ({ name, params, returns, body });
export const program = (main, functions = [], extra = {}) => ({ main, functions, ...extra });

export const isArrayType = (type) => typeof type === "string" && type.endsWith("[]");
export const elemType = (type) => (isArrayType(type) ? type.slice(0, -2) : type);
export const isNumeric = (type) => type === "int" || type === "long" || type === "double";

export function walk(nodes, visit) {
  for (const node of nodes || []) {
    if (!node || typeof node !== "object") continue;
    visit(node);
    for (const key of ["then", "body", "otherwise"]) {
      const child = node[key];
      if (Array.isArray(child)) walk(child, visit);
      else if (child && typeof child === "object" && child.k) walk([child], visit);
    }
    if (node.k === "switch") for (const item of node.cases) walk(item.body, visit);
  }
}

export function programNodes(prog) {
  const nodes = [];
  const collect = (node) => nodes.push(node);
  walk(prog.main, collect);
  for (const fnDef of prog.functions) walk(fnDef.body, collect);
  return nodes;
}

export function exprNodes(root) {
  const found = [];
  const visit = (e) => {
    if (!e || typeof e !== "object") return;
    found.push(e);
    for (const key of ["l", "r", "e", "a", "b", "i", "s", "c", "t", "f", "value", "target", "from", "to", "coll", "size", "arr"]) {
      if (e[key] && typeof e[key] === "object") visit(e[key]);
    }
    for (const list of [e.args, e.values, e.parts]) {
      if (Array.isArray(list)) list.forEach(visit);
    }
    if (Array.isArray(e.prompt)) e.prompt.forEach(visit);
  };
  visit(root);
  return found;
}

export function usesExpr(prog, test) {
  return programNodes(prog).some((node) => exprNodes(node).some(test));
}
