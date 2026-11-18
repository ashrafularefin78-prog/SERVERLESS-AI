import {
  add,
  elemType,
  exprNodes,
  idx,
  isArrayType,
  isNumeric,
  num,
  programNodes,
  v,
} from "../ir.js";

export const PREC = {
  "||": 1,
  "&&": 2,
  "^": 2.5,
  "&": 2.75,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};
export const COMPARE = new Set(["==", "!=", "<", "<=", ">", ">="]);
const FLIP = { "==": "!=", "!=": "==", "<": ">=", "<=": ">", ">": "<=", ">=": "<" };
export const ATOM = 10;
export const UNARY = 8;

export function negate(c) {
  if (c.k === "bin" && FLIP[c.op]) return { ...c, op: FLIP[c.op] };
  if (c.k === "not") return c.e;
  return { k: "not", e: c };
}

export function quote(text, q = '"') {
  return (
    q +
    String(text)
      .replace(/\\/g, "\\\\")
      .replace(q === '"' ? /"/g : /'/g, `\\${q}`)
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t") +
    q
  );
}

export function snake(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function pascal(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export class Emitter {
  constructor(prog, options = {}) {
    this.prog = prog;
    this.options = options;
    this.unit = "    ";
    this.lines = [];
    this.depth = 0;
    this.needs = new Set();
    this.scopes = [new Map()];
    this.fns = new Map(prog.functions.map((f) => [f.name, f]));
    this.loopStyle = prog.loopStyle || "for";
    this.allman = false;
    this.semi = ";";
    this.dropLengthParams = true;
    this.currentFn = null;
  }

  // ---- naming
  name(n) {
    return n;
  }

  fnName(n) {
    return n;
  }

  // ---- output
  line(text = "") {
    this.lines.push(text === "" ? "" : this.unit.repeat(this.depth) + text);
  }

  gap() {
    const last = this.lines.at(-1);
    if (last === undefined || last === "" || /[{:]\s*$/.test(last)) return;
    this.lines.push("");
  }

  text() {
    const out = [];
    this.lines.forEach((item, index) => {
      if (item === "") {
        const next = this.lines.slice(index + 1).find((entry) => entry !== "");
        if (!out.length || out.at(-1) === "" || next === undefined) return;
        if (/^\s*(?:[}\])]|else\b|elif\b|case\b|default\b)/.test(next)) return;
      }
      out.push(item.replace(/\s+$/, ""));
    });
    return out.join("\n");
  }

  // ---- scopes
  push() {
    this.scopes.push(new Map());
  }

  pop() {
    this.scopes.pop();
  }

  declare(name, type, info = {}) {
    this.scopes.at(-1).set(name, { type, ...info });
  }

  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i -= 1) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }

  declaredHere(name) {
    return this.scopes.at(-1).has(name);
  }

  // ---- types
  typeOf(e) {
    switch (e.k) {
      case "num":
        return e.type;
      case "str":
        return "string";
      case "char":
        return "char";
      case "bool":
        return "bool";
      case "var":
        return this.lookup(e.name)?.type || "int";
      case "bin": {
        if (COMPARE.has(e.op) || e.op === "&&" || e.op === "||") return "bool";
        const a = this.typeOf(e.l);
        const b = this.typeOf(e.r);
        if (a === "string" || b === "string") return "string";
        if (a === "double" || b === "double") return "double";
        if (a === "long" || b === "long") return "long";
        return "int";
      }
      case "not":
        return "bool";
      case "neg":
        return this.typeOf(e.e);
      case "call":
        return this.fns.get(e.name)?.returns || "int";
      case "idx": {
        const type = this.typeOf(e.a);
        return type === "string" ? "char" : elemType(type);
      }
      case "len":
        return "int";
      case "at":
        return "char";
      case "cond":
        return this.typeOf(e.t);
      case "cast":
        return e.to;
      case "arr":
        return `${e.elem}[]`;
      case "addr":
        return `${this.typeOf(e.e)}*`;
      case "deref":
        return this.typeOf(e.e).replace(/\*$/, "");
      case "fmt":
        return this.typeOf(e.e);
      case "fn":
        return this.builtinType(e);
      default:
        return "int";
    }
  }

  builtinType(e) {
    switch (e.name) {
      case "sqrt":
      case "pow":
        return "double";
      case "abs":
      case "upper":
      case "lower":
      case "max":
      case "min":
        return this.typeOf(e.args[0]);
      case "code":
      case "digit":
        return "int";
      case "char":
      case "shift":
        return "char";
      case "reverse":
        return "string";
      default:
        return "bool";
    }
  }

  isIntegral(type) {
    return type === "int" || type === "long";
  }

  // ---- expressions
  expr(e, min = 0, strict = false) {
    const { t, p } = this.render(e);
    return p < min || (strict && p === min) ? `(${t})` : t;
  }

  prec(op) {
    return PREC[op];
  }

  render(e) {
    switch (e.k) {
      case "num":
        return { t: this.number(e), p: e.value < 0 ? UNARY : ATOM };
      case "str":
        return { t: this.string(e.value), p: ATOM };
      case "char":
        return { t: this.char(e.value), p: ATOM };
      case "bool":
        return { t: this.boolean(e.value), p: ATOM };
      case "var":
        return { t: this.name(e.name), p: ATOM };
      case "bin":
        return this.binary(e);
      case "not":
        return { t: `!${this.expr(e.e, UNARY)}`, p: UNARY };
      case "neg":
        return { t: `-${this.expr(e.e, UNARY)}`, p: UNARY };
      case "call":
        return { t: this.callText(e), p: ATOM };
      case "idx":
        return { t: `${this.expr(e.a, ATOM)}[${this.expr(e.i)}]`, p: ATOM };
      case "len":
        return { t: this.lengthOf(e.e), p: ATOM };
      case "at":
        return { t: this.charAt(e.s, e.i), p: ATOM };
      case "cond":
        return this.conditional(e);
      case "cast":
        return this.cast(e);
      case "arr":
        return { t: this.arrayLiteral(e), p: ATOM };
      case "addr":
        return { t: `&${this.expr(e.e, UNARY)}`, p: UNARY };
      case "deref":
        return { t: `*${this.expr(e.e, UNARY)}`, p: UNARY };
      case "fn":
        return this.builtin(e);
      default:
        throw new Error(`Unknown expression ${e.k}`);
    }
  }

  number(e) {
    if (e.type === "double")
      return Number.isInteger(e.value) ? e.value.toFixed(1) : String(e.value);
    return String(e.value);
  }

  string(value) {
    return quote(value);
  }

  char(value) {
    return quote(value, "'");
  }

  boolean(value) {
    return value ? "true" : "false";
  }

  binaryOp(e) {
    return e.op;
  }

  binary(e) {
    const p = this.prec(e.op);
    const compare = COMPARE.has(e.op);
    // Parenthesize `&&` inside `||` so the grouping is explicit (and compilers don't warn).
    const side = (child, strict) =>
      e.op === "||" && child.k === "bin" && child.op === "&&"
        ? this.expr(child, this.prec("&&"), true)
        : this.expr(child, p, strict);
    const left = side(e.l, compare);
    const right = side(e.r, true);
    return { t: `${left} ${this.binaryOp(e)} ${right}`, p };
  }

  conditional(e) {
    return { t: `${this.expr(e.c, 1)} ? ${this.expr(e.t, 1)} : ${this.expr(e.f, 0.5)}`, p: 0.5 };
  }

  callArgs(e) {
    const def = this.fns.get(e.name);
    return e.args.filter((_, index) => !(this.dropLengthParams && def?.params[index]?.lengthOf));
  }

  callText(e) {
    return `${this.fnName(e.name)}(${this.callArgs(e)
      .map((arg) => this.expr(arg))
      .join(", ")})`;
  }

  // ---- blocks
  blockStart(head) {
    if (this.allman) {
      this.line(head);
      this.line("{");
    } else {
      this.line(`${head} {`);
    }
    this.depth += 1;
    this.push();
  }

  blockMid(head) {
    this.pop();
    this.depth -= 1;
    if (this.allman) {
      this.line("}");
      this.line(head);
      this.line("{");
    } else {
      this.line(`} ${head} {`);
    }
    this.depth += 1;
    this.push();
  }

  blockEnd(suffix = "") {
    this.pop();
    this.depth -= 1;
    this.line(`}${suffix}`);
  }

  block(stmts) {
    const list = stmts || [];
    list.forEach((s, index) => {
      if (this.groupReads && s.k === "read" && list[index - 1]?.k !== "read")
        this.declareReads(list, index);
      this.stmt(s);
    });
  }

  declareReads(list, start) {
    const byType = new Map();
    for (let j = start; j < list.length && list[j].k === "read"; j += 1) {
      const s = list[j];
      if (this.lookup(s.name) || [...byType.values()].some((names) => names.includes(s.name)))
        continue;
      if (!byType.has(s.type)) byType.set(s.type, []);
      byType.get(s.type).push(s.name);
    }
    for (const [type, names] of byType) {
      this.line(`${this.groupDecl(type, names)}${this.semi}`);
      names.forEach((name) => this.declare(name, type));
    }
  }

  stmt(s) {
    if (s.k === "print" && s.parts.every((part) => part === "")) {
      if (!s.newline) return;
      s = { ...s, parts: [] };
    }
    const handler = this[`s_${s.k}`];
    if (!handler) throw new Error(`${this.constructor.name} cannot emit ${s.k}`);
    handler.call(this, s);
  }

  condText(c) {
    return `(${this.expr(c)})`;
  }

  s_gap() {
    this.gap();
  }

  s_let(s) {
    if (this.lookup(s.name)) {
      if (s.value !== undefined) this.s_set({ target: { k: "var", name: s.name }, value: s.value });
      return;
    }
    const valueText = s.value === undefined ? null : this.initText(s.type, s.value);
    this.line(`${this.declText(s.name, s.type, valueText, s)}${this.semi}`);
    this.declare(s.name, s.type, { size: s.size });
  }

  initText(type, value) {
    return this.expr(value);
  }

  s_set(s) {
    this.line(`${this.expr(s.target)} = ${this.expr(s.value)}${this.semi}`);
  }

  s_op(s) {
    const one = s.value.k === "num" && s.value.value === 1 && (s.op === "+" || s.op === "-");
    if (one && this.increments !== false) {
      this.line(`${this.expr(s.target)}${s.op}${s.op}${this.semi}`);
      return;
    }
    this.line(`${this.expr(s.target)} ${s.op}= ${this.expr(s.value)}${this.semi}`);
  }

  s_expr(s) {
    this.line(`${this.expr(s.e)}${this.semi}`);
  }

  s_ret(s) {
    this.line(s.e ? `return ${this.expr(s.e)}${this.semi}` : `return${this.semi}`);
  }

  s_break() {
    this.line(`break${this.semi}`);
  }

  s_if(s) {
    this.blockStart(`if ${this.condText(s.c)}`);
    this.block(s.then);
    let other = s.otherwise;
    while (other) {
      if (!Array.isArray(other) && other.k === "if") {
        this.blockMid(`else if ${this.condText(other.c)}`);
        this.block(other.then);
        other = other.otherwise;
      } else {
        this.blockMid("else");
        this.block(other);
        other = null;
      }
    }
    this.blockEnd();
  }

  s_while(s) {
    this.blockStart(`while ${this.condText(s.c)}`);
    this.block(s.body);
    this.blockEnd();
  }

  s_do(s) {
    this.blockStart("do");
    this.block(s.body);
    this.blockEnd(` while ${this.condText(s.c)}${this.semi}`);
  }

  loopCondition(s) {
    const v = { k: "var", name: s.name };
    const op = s.step > 0 ? (s.inclusive ? "<=" : "<") : s.inclusive ? ">=" : ">";
    return { k: "bin", op, l: v, r: s.to };
  }

  loopUpdate(s) {
    const v = { k: "var", name: s.name };
    const by = Math.abs(s.step);
    return {
      k: "op",
      target: v,
      op: s.step > 0 ? "+" : "-",
      value: { k: "num", value: by, type: "int" },
    };
  }

  styleFor(s) {
    if (s.fixed) return "for";
    if (this.loopStyle === "while") return "while";
    if (this.loopStyle === "do-while" && s.primary) return "do-while";
    return "for";
  }

  s_for(s) {
    const style = this.styleFor(s);
    if (style === "for") {
      this.forLoop(s);
      return;
    }
    const init = { k: "num", value: 0 };
    if (this.lookup(s.name)) this.s_set({ target: { k: "var", name: s.name }, value: s.from });
    else this.s_let({ name: s.name, type: "int", value: s.from ?? init });
    const body = [...s.body, this.loopUpdate(s)];
    if (style === "while") {
      this.s_while({ c: this.loopCondition(s), body });
      return;
    }
    // A do-while always runs once, so guard it unless the literal bounds make the first pass certain.
    const { from, to } = s;
    const certain =
      from?.k === "num" &&
      to?.k === "num" &&
      (s.step > 0 ? from.value <= to.value : from.value >= to.value) &&
      (s.inclusive || from.value !== to.value);
    const loop = { k: "do", c: this.loopCondition(s), body };
    if (certain) this.s_do(loop);
    else this.stmt({ k: "if", c: this.loopCondition(s), then: [loop] });
  }

  updateText(s) {
    const by = Math.abs(s.step);
    const name = this.name(s.name);
    if (by === 1) return `${name}${s.step > 0 ? "++" : "--"}`;
    return `${name} ${s.step > 0 ? "+" : "-"}= ${by}`;
  }

  forLoop(s) {
    const start = this.lookup(s.name) ? this.name(s.name) : this.loopVarDecl(s.name);
    const head = `for (${start} = ${this.expr(s.from)}; ${this.expr(this.loopCondition(s))}; ${this.updateText(s)})`;
    this.blockStart(head);
    this.declare(s.name, "int");
    this.block(s.body);
    this.blockEnd();
  }

  loopVarDecl(name) {
    return `int ${this.name(name)}`;
  }

  s_swap(s) {
    const temp = "temp";
    if (this.lookup(temp)) this.s_set({ target: { k: "var", name: temp }, value: s.a });
    else this.s_let({ name: temp, type: s.type, value: s.a });
    this.s_set({ target: s.a, value: s.b });
    this.s_set({ target: s.b, value: { k: "var", name: temp } });
  }

  s_switch(s) {
    this.blockStart(`switch ${this.condText(s.value)}`);
    for (const item of s.cases) {
      for (const value of item.values) this.line(`case ${this.expr(value)}:`);
      this.depth += 1;
      this.push();
      this.block(item.body);
      this.line(`break${this.semi}`);
      this.pop();
      this.depth -= 1;
    }
    if (s.otherwise) {
      this.line("default:");
      this.depth += 1;
      this.push();
      this.block(s.otherwise);
      if (this.breakAfterDefault) this.line(`break${this.semi}`);
      this.pop();
      this.depth -= 1;
    }
    this.blockEnd();
  }

  // ---- functions
  functionPrologue(f) {
    if (!this.dropLengthParams) return;
    for (const p of f.params) {
      if (p.lengthOf) {
        this.s_let({
          name: p.name,
          type: "int",
          value: { k: "len", e: { k: "var", name: p.lengthOf } },
        });
      }
    }
  }

  visibleParams(f) {
    return f.params.filter((p) => !(this.dropLengthParams && p.lengthOf));
  }

  emitFunction(f) {
    this.currentFn = f;
    this.blockStart(this.signature(f));
    for (const p of this.visibleParams(f))
      this.declare(p.name, p.type, { param: true, mutates: p.mutates });
    this.functionPrologue(f);
    this.block(f.body);
    this.blockEnd();
    this.currentFn = null;
    this.gap();
  }

  emitMainBody() {
    this.block(this.prog.main);
  }

  stmtsWhere(test) {
    return programNodes(this.prog).filter(test);
  }

  hasInput() {
    return this.stmtsWhere((s) => s.k === "read" || s.k === "readArray").length > 0;
  }

  readsType(test) {
    return (
      this.stmtsWhere(
        (s) => (s.k === "read" && test(s.type)) || (s.k === "readArray" && test(s.elem)),
      ).length > 0
    );
  }

  usesNode(test) {
    return programNodes(this.prog).some((s) => exprNodes(s).some(test));
  }

  s_newArray(s) {
    this.declareArray(s, true);
    this.declare(s.name, `${s.elem}[]`, { size: s.size });
  }

  s_readArray(s) {
    this.declareArray(s);
    this.declare(s.name, `${s.elem}[]`, { size: s.size });
    const item = {
      k: "readItem",
      target: idx(v(s.name), v("i")),
      type: s.elem,
      array: s.name,
      prompt: [`Enter ${s.label} `, add(v("i"), num(1)), ": "],
    };
    this.s_for({
      k: "for",
      name: "i",
      from: num(0),
      to: s.size,
      body: [item],
      step: 1,
      inclusive: false,
      fixed: true,
    });
  }

  printParts(parts) {
    return parts.map((part) =>
      typeof part === "string"
        ? { lit: part }
        : part.k === "fmt"
          ? { e: part.e, dp: part.dp }
          : { e: part },
    );
  }

  promptParts(prompt) {
    return Array.isArray(prompt) ? this.printParts(prompt) : [{ lit: prompt }];
  }

  numericType(type) {
    return isNumeric(type);
  }

  isArray(type) {
    return isArrayType(type);
  }
}
