import { elemType } from "../ir.js";
import { ATOM, Emitter, UNARY, snake } from "./base.js";

const SCAN = { int: "%d", long: "%lld", double: "%lf", char: " %c" };
const ORDER = ["stdio.h", "stdlib.h", "string.h", "ctype.h", "math.h", "stdbool.h"];
const CTYPE = { isDigit: "isdigit", isAlpha: "isalpha", isUpper: "isupper", isLower: "islower", isSpace: "isspace", isAlnum: "isalnum" };

export function formatText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "%%")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

const atom = (t) => ({ t, p: ATOM });

export class CEmitter extends Emitter {
  constructor(prog, options) {
    super(prog, options);
    this.groupReads = true;
    this.dropLengthParams = false;
    this.breakAfterDefault = true;
    this.cStrings = true;
    this.helpers = new Map();
    this.needs.add("stdio.h");
  }

  s_let(s) {
    const copy = this.cStrings && s.type === "string" && s.value !== undefined && s.value.k !== "str";
    if (copy && !this.lookup(s.name)) {
      super.s_let({ ...s, value: undefined });
      this.s_set({ target: { k: "var", name: s.name }, value: s.value });
      return;
    }
    super.s_let(s);
  }

  s_set(s) {
    if (this.cStrings && this.typeOf(s.target) === "string") {
      this.needs.add("string.h");
      this.line(`strcpy(${this.expr(s.target)}, ${this.expr(s.value)});`);
      return;
    }
    super.s_set(s);
  }

  name(n) {
    return snake(n);
  }

  fnName(n) {
    return snake(n);
  }

  scalar(type) {
    if (type === "long") return "long long";
    if (type === "bool") {
      this.needs.add("stdbool.h");
      return "bool";
    }
    if (type === "string") return "char";
    return type;
  }

  boolean(value) {
    this.needs.add("stdbool.h");
    return value ? "true" : "false";
  }

  number(e) {
    const text = super.number(e);
    return e.type === "long" && Math.abs(e.value) > 2147483647 ? `${text}LL` : text;
  }

  declText(name, type, valueText, s = {}) {
    const n = this.name(name);
    const init = valueText === null || valueText === undefined ? "" : ` = ${valueText}`;
    if (type === "string" || this.isArray(type)) {
      const base = this.scalar(elemType(type === "string" ? "char[]" : type));
      if (s.size) return `${base} ${n}[${s.size}]${init}`;
      if (init && (s.value?.k === "str" || s.value?.k === "arr")) return `${base} ${n}[]${init}`;
      return `${base} ${n}[100]`;
    }
    if (type.endsWith("*")) return `${this.scalar(type.slice(0, -1))} *${n}${init}`;
    return `${this.scalar(type)} ${n}${init}`;
  }

  groupDecl(type, names) {
    if (type === "string") return `char ${names.map((n) => `${this.name(n)}[100]`).join(", ")}`;
    return `${this.scalar(type)} ${names.map((n) => this.name(n)).join(", ")}`;
  }

  arrayLiteral(e) {
    return `{${e.values.map((x) => this.expr(x)).join(", ")}}`;
  }

  render(e) {
    if (e.k === "len") {
      const t = this.lengthOf(e.e);
      return { t, p: t.includes(" / ") ? 6 : ATOM };
    }
    return super.render(e);
  }

  lengthOf(e) {
    if (this.typeOf(e) === "string") {
      this.needs.add("string.h");
      return `strlen(${this.expr(e)})`;
    }
    if (e.k === "var") {
      const lengthParam = this.currentFn?.params.find((p) => p.lengthOf === e.name);
      if (lengthParam) return this.name(lengthParam.name);
      const info = this.lookup(e.name);
      if (info?.size) return this.expr(info.size);
    }
    const n = this.expr(e, ATOM);
    return `sizeof(${n}) / sizeof(${n}[0])`;
  }

  charAt(s, i) {
    return `${this.expr(s, ATOM)}[${this.expr(i)}]`;
  }

  castType(to) {
    return to === "long" ? "long long" : to;
  }

  cast(e) {
    return { t: `(${this.castType(e.to)}) ${this.expr(e.e, UNARY)}`, p: UNARY };
  }

  binary(e) {
    if ((e.op === "==" || e.op === "!=") && this.typeOf(e.l) === "string") {
      this.needs.add("string.h");
      return { t: `strcmp(${this.expr(e.l)}, ${this.expr(e.r)}) ${e.op} 0`, p: 3 };
    }
    return super.binary(e);
  }

  minMax(e, op) {
    const [a, b] = e.args.map((x) => this.expr(x, 5));
    return atom(`(${a} ${op} ${b} ? ${a} : ${b})`);
  }

  builtin(e) {
    const [a, b] = e.args;
    const first = () => this.expr(a);
    switch (e.name) {
      case "sqrt":
        this.needs.add("math.h");
        return atom(`sqrt(${first()})`);
      case "pow":
        this.needs.add("math.h");
        return atom(`pow(${first()}, ${this.expr(b)})`);
      case "abs": {
        const type = this.typeOf(a);
        this.needs.add(type === "double" ? "math.h" : "stdlib.h");
        return atom(`${type === "double" ? "fabs" : type === "long" ? "llabs" : "abs"}(${first()})`);
      }
      case "upper":
      case "lower":
        if (this.typeOf(a) === "string") throw new Error("C converts strings one character at a time");
        this.needs.add("ctype.h");
        return atom(`to${e.name}(${first()})`);
      case "isVowel":
        this.needs.add("string.h");
        return { t: `strchr("aeiouAEIOU", ${first()}) != NULL`, p: 3 };
      case "code":
        return { t: `(int) ${this.expr(a, UNARY)}`, p: UNARY };
      case "char":
        return { t: `(char) ${this.expr(a, UNARY)}`, p: UNARY };
      case "digit":
        return { t: `${this.expr(a, 5)} - '0'`, p: 5 };
      case "max":
        return this.minMax(e, ">");
      case "min":
        return this.minMax(e, "<");
      default:
        if (CTYPE[e.name]) {
          this.needs.add("ctype.h");
          return atom(`${CTYPE[e.name]}(${first()})`);
        }
        throw new Error(`C has no builtin ${e.name}`);
    }
  }

  printfText(parts, newline) {
    let format = "";
    const args = [];
    for (const part of this.printParts(parts)) {
      if (part.lit !== undefined) {
        format += formatText(part.lit);
        continue;
      }
      const type = this.typeOf(part.e);
      if (type === "bool") {
        format += "%s";
        args.push(`${this.expr(part.e, 1, true)} ? "true" : "false"`);
        continue;
      }
      format += { double: `%.${part.dp ?? 2}f`, long: "%lld", char: "%c", string: "%s" }[type] || "%d";
      args.push(this.expr(part.e));
    }
    if (newline) format += "\\n";
    return `printf("${format}"${args.map((arg) => `, ${arg}`).join("")});`;
  }

  s_print(s) {
    this.line(this.printfText(s.parts, s.newline));
  }

  prompt(prompt) {
    if (prompt) this.line(this.printfText(Array.isArray(prompt) ? prompt : [prompt], false));
  }

  s_read(s) {
    if (!this.lookup(s.name)) this.s_let({ name: s.name, type: s.type });
    this.s_readItem({ target: { k: "var", name: s.name }, type: s.type, prompt: s.prompt });
  }

  s_readItem(s) {
    this.prompt(s.prompt);
    if (s.type === "string") this.line(`scanf(" %99[^\\n]", ${this.expr(s.target)});`);
    else this.line(`scanf("${SCAN[s.type]}", &${this.expr(s.target, UNARY)});`);
  }

  declareArray(s, sized = false) {
    this.line(`${this.scalar(s.elem)} ${this.name(s.name)}[${sized ? this.expr(s.size) : 100}];`);
  }

  helper(name, lines) {
    if (!this.helpers.has(name)) this.helpers.set(name, lines);
  }

  s_sort(s) {
    this.needs.add("stdlib.h");
    const elem = elemType(this.typeOf(s.arr));
    const ctype = this.scalar(elem);
    const cmp = `compare_${elem === "double" ? "doubles" : "ints"}${s.desc ? "_desc" : ""}`;
    this.helper(cmp, [
      `int ${cmp}(const void *a, const void *b) {`,
      `    ${ctype} x = *(const ${ctype} *)a;`,
      `    ${ctype} y = *(const ${ctype} *)b;`,
      s.desc ? "    return (x < y) - (x > y);" : "    return (x > y) - (x < y);",
      "}",
    ]);
    const n = this.expr(s.arr, ATOM);
    this.line(`qsort(${n}, ${this.expr(s.size)}, sizeof(${n}[0]), ${cmp});`);
  }

  paramText(p) {
    const n = this.name(p.name);
    if (p.type === "string") return p.mutates ? `char ${n}[]` : `const char *${n}`;
    if (this.isArray(p.type)) return `${this.scalar(elemType(p.type))} ${n}[]`;
    if (p.type.endsWith("*")) return `${this.scalar(p.type.slice(0, -1))} *${n}`;
    return `${this.scalar(p.type)} ${n}`;
  }

  returnType(type) {
    if (type === "string") return "const char *";
    return !type || type === "void" ? "void" : this.scalar(type);
  }

  signature(f) {
    const params = f.params.map((p) => this.paramText(p)).join(", ") || "void";
    const returns = this.returnType(f.returns);
    return `${returns}${returns.endsWith("*") ? "" : " "}${this.fnName(f.name)}(${params})`;
  }

  emitMain() {
    this.blockStart("int main(void)");
    this.emitMainBody();
    this.gap();
    this.line("return 0;");
    this.blockEnd();
  }

  header() {
    return ORDER.filter((h) => this.needs.has(h)).map((h) => `#include <${h}>`);
  }

  emit() {
    this.prog.functions.forEach((f) => this.emitFunction(f));
    const functions = this.lines;
    this.lines = [];
    this.emitMain();
    const main = this.lines;
    const helpers = [...this.helpers.values()].flatMap((lines) => [...lines, ""]);
    this.lines = [...this.header(), "", ...helpers, ...functions, "", ...main];
    return this.text();
  }
}
