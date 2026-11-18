import { elemType, programNodes } from "../ir.js";
import { ATOM, Emitter, quote } from "./base.js";

const TESTS = {
  isDigit: "/\\d/",
  isAlpha: "/[a-z]/i",
  isUpper: "/[A-Z]/",
  isLower: "/[a-z]/",
  isSpace: "/\\s/",
  isAlnum: "/[a-z0-9]/i",
};
const atom = (t) => ({ t, p: ATOM });

function templateText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

export class JsEmitter extends Emitter {
  constructor(prog, options = {}) {
    super(prog, options);
    this.unit = "  ";
    this.ts = Boolean(options.typescript);
    this.mutable = this.findMutable();
  }

  findMutable() {
    const counts = new Map();
    const mutable = new Set();
    for (const s of programNodes(this.prog)) {
      if (s.k === "let" || s.k === "read") counts.set(s.name, (counts.get(s.name) || 0) + 1);
      if ((s.k === "set" || s.k === "op") && s.target.k === "var") mutable.add(s.target.name);
      if (s.k === "swap") [s.a, s.b].forEach((x) => x.k === "var" && mutable.add(x.name));
      if (s.k === "for") mutable.add(s.name);
    }
    for (const [name, count] of counts) if (count > 1) mutable.add(name);
    return mutable;
  }

  tsType(type) {
    if (this.isArray(type)) return `${this.tsType(elemType(type))}[]`;
    if (type === "string" || type === "char") return "string";
    if (type === "bool") return "boolean";
    if (type === "void") return "void";
    return "number";
  }

  number(e) {
    return String(e.value);
  }

  char(value) {
    return quote(value);
  }

  binaryOp(e) {
    if (e.op === "==") return "===";
    if (e.op === "!=") return "!==";
    return e.op;
  }

  binary(e) {
    if (e.op === "/" && this.isIntegral(this.typeOf(e.l)) && this.isIntegral(this.typeOf(e.r))) {
      return atom(`Math.trunc(${super.binary(e).t})`);
    }
    return super.binary(e);
  }

  declText(name, type, valueText) {
    const keyword = this.mutable.has(name) || valueText === null ? "let" : "const";
    const annotate = this.ts && (valueText === null || valueText === "[]");
    return `${keyword} ${name}${annotate ? `: ${this.tsType(type)}` : ""}${valueText === null ? "" : ` = ${valueText}`}`;
  }

  loopVarDecl(name) {
    return `let ${name}`;
  }

  arrayLiteral(e) {
    return `[${e.values.map((x) => this.expr(x)).join(", ")}]`;
  }

  lengthOf(e) {
    return `${this.expr(e, ATOM)}.length`;
  }

  charAt(s, i) {
    return `${this.expr(s, ATOM)}[${this.expr(i)}]`;
  }

  cast(e) {
    const inner = e.e;
    if (e.to === "double") return this.render(inner);
    if (e.to === "long" && this.isIntegral(this.typeOf(inner))) return this.render(inner);
    if (e.to === "char") return atom(`String.fromCharCode(${this.expr(inner)})`);
    if (
      inner.k === "fn" &&
      inner.name === "pow" &&
      inner.args.every((x) => this.isIntegral(this.typeOf(x)))
    ) {
      return this.render(inner);
    }
    return atom(`Math.trunc(${this.expr(inner)})`);
  }

  builtin(e) {
    const [a] = e.args;
    const recv = () => this.expr(a, ATOM);
    switch (e.name) {
      case "sqrt":
      case "pow":
      case "abs":
      case "max":
      case "min":
        return atom(`Math.${e.name}(${e.args.map((x) => this.expr(x)).join(", ")})`);
      case "upper":
        return atom(`${recv()}.toUpperCase()`);
      case "lower":
        return atom(`${recv()}.toLowerCase()`);
      case "isVowel":
        return atom(`"aeiouAEIOU".includes(${this.expr(a)})`);
      case "code":
        return atom(`${recv()}.charCodeAt(0)`);
      case "char":
        return atom(`String.fromCharCode(${this.expr(a)})`);
      case "digit":
        return atom(`Number(${this.expr(a)})`);
      case "reverse":
        return atom(`[...${recv()}].reverse().join("")`);
      default:
        if (TESTS[e.name]) return atom(`${TESTS[e.name]}.test(${this.expr(a)})`);
        throw new Error(`JavaScript has no builtin ${e.name}`);
    }
  }

  template(parts, forceString = false) {
    const items = this.printParts(parts);
    if (items.every((part) => part.lit !== undefined))
      return quote(items.map((part) => part.lit).join(""));
    if (!forceString && items.length === 1 && this.typeOf(items[0].e) !== "double")
      return this.expr(items[0].e);
    let body = "";
    for (const part of items) {
      if (part.lit !== undefined) body += templateText(part.lit);
      else if (this.typeOf(part.e) === "double") {
        const value = part.e.k === "num" ? `(${this.expr(part.e)})` : this.expr(part.e, ATOM);
        body += `\${${value}.toFixed(${part.dp ?? 2})}`;
      } else body += `\${${this.expr(part.e)}}`;
    }
    return `\`${body}\``;
  }

  s_print(s) {
    if (s.newline) this.line(`console.log(${s.parts.length ? this.template(s.parts) : ""});`);
    else this.line(`process.stdout.write(${this.template(s.parts, true)});`);
  }

  inputText(type, prompt) {
    const call = `await ask(${this.template(Array.isArray(prompt) ? prompt : [prompt], true)})`;
    if (type === "int" || type === "long") return `parseInt(${call}, 10)`;
    if (type === "double") return `parseFloat(${call})`;
    if (type === "char") return `(${call}).trim()[0]`;
    return call;
  }

  s_read(s) {
    if (this.lookup(s.name)) this.line(`${s.name} = ${this.inputText(s.type, s.prompt)};`);
    else {
      this.line(`${this.declText(s.name, s.type, this.inputText(s.type, s.prompt))};`);
      this.declare(s.name, s.type);
    }
  }

  s_readItem(s) {
    this.line(`${s.array}.push(${this.inputText(s.type, s.prompt)});`);
  }

  s_op(s) {
    const target = this.expr(s.target);
    if (
      s.op === "/" &&
      this.isIntegral(this.typeOf(s.target)) &&
      this.isIntegral(this.typeOf(s.value))
    ) {
      this.line(`${target} = Math.trunc(${target} / ${this.expr(s.value, 6, true)});`);
      return;
    }
    super.s_op(s);
  }

  declareArray(s, sized = false) {
    const type = this.ts ? `: ${this.tsType(s.elem)}[]` : "";
    if (!sized) {
      this.line(`const ${s.name}${type} = [];`);
      return;
    }
    const zero = { bool: "false", string: '""', char: '""' }[s.elem] ?? "0";
    this.line(`const ${s.name}${type} = new Array(${this.expr(s.size)}).fill(${zero});`);
  }

  s_swap(s) {
    if (s.temp) {
      super.s_swap(s);
      return;
    }
    const a = this.expr(s.a);
    const b = this.expr(s.b);
    this.line(`[${a}, ${b}] = [${b}, ${a}];`);
  }

  s_sort(s) {
    this.line(`${this.expr(s.arr, ATOM)}.sort((a, b) => ${s.desc ? "b - a" : "a - b"});`);
  }

  signature(f) {
    const params = this.visibleParams(f).map(
      (p) => `${p.name}${this.ts ? `: ${this.tsType(p.type)}` : ""}`,
    );
    const returns = this.ts ? `: ${this.tsType(f.returns || "void")}` : "";
    return `function ${f.name}(${params.join(", ")})${returns}`;
  }

  header() {
    const ts = this.ts;
    return [
      ts
        ? 'import * as readline from "node:readline";'
        : 'const readline = require("node:readline");',
      "",
      "const rl = readline.createInterface({ input: process.stdin });",
      "const inputLines = rl[Symbol.asyncIterator]();",
      "",
      `async function ask(question${ts ? ": string" : ""})${ts ? ": Promise<string>" : ""} {`,
      "  process.stdout.write(question);",
      "  const { value } = await inputLines.next();",
      '  return value ?? "";',
      "}",
      "",
    ];
  }

  emit() {
    const input = this.hasInput();
    this.prog.functions.forEach((f) => this.emitFunction(f));
    const functions = this.lines;
    this.lines = [];
    if (input) {
      this.blockStart(`async function main()${this.ts ? ": Promise<void>" : ""}`);
      this.emitMainBody();
      this.gap();
      this.line("rl.close();");
      this.blockEnd();
      this.gap();
      this.line("main();");
    } else {
      this.emitMainBody();
    }
    const main = this.lines;
    this.lines = [...(input ? this.header() : []), ...functions, "", ...main];
    return this.text();
  }
}
