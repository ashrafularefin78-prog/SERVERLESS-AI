import { elemType } from "../ir.js";
import { ATOM, Emitter, UNARY, pascal, quote } from "./base.js";

const CHARS = {
  isDigit: "IsDigit",
  isAlpha: "IsLetter",
  isUpper: "IsUpper",
  isLower: "IsLower",
  isSpace: "IsWhiteSpace",
  isAlnum: "IsLetterOrDigit",
};
const PARSE = { int: "Convert.ToInt32", long: "Convert.ToInt64", double: "Convert.ToDouble" };
const atom = (t) => ({ t, p: ATOM });

export class CSharpEmitter extends Emitter {
  constructor(prog, options) {
    super(prog, options);
    this.allman = true;
    this.breakAfterDefault = true;
    this.needs.add("System");
  }

  fnName(n) {
    return pascal(n);
  }

  scalar(type) {
    if (this.isArray(type)) return `${this.scalar(elemType(type))}[]`;
    return type;
  }

  number(e) {
    const text = super.number(e);
    return e.type === "long" && Math.abs(e.value) > 2147483647 ? `${text}L` : text;
  }

  declText(name, type, valueText) {
    return `${this.scalar(type)} ${name}${valueText === null ? "" : ` = ${valueText}`}`;
  }

  arrayLiteral(e) {
    return `{ ${e.values.map((x) => this.expr(x)).join(", ")} }`;
  }

  initText(type, value) {
    if (value.k === "arr") return this.arrayLiteral(value);
    return this.expr(value);
  }

  lengthOf(e) {
    return `${this.expr(e, ATOM)}.Length`;
  }

  charAt(s, i) {
    return `${this.expr(s, ATOM)}[${this.expr(i)}]`;
  }

  cast(e) {
    return { t: `(${e.to})${this.expr(e.e, UNARY)}`, p: UNARY };
  }

  builtin(e) {
    const [a] = e.args;
    const first = () => this.expr(a);
    const string = () => this.typeOf(a) === "string";
    switch (e.name) {
      case "sqrt":
      case "pow":
      case "abs":
      case "max":
      case "min":
        return atom(`Math.${pascal(e.name)}(${e.args.map((x) => this.expr(x)).join(", ")})`);
      case "upper":
        return atom(string() ? `${this.expr(a, ATOM)}.ToUpper()` : `char.ToUpper(${first()})`);
      case "lower":
        return atom(string() ? `${this.expr(a, ATOM)}.ToLower()` : `char.ToLower(${first()})`);
      case "isVowel":
        return { t: `"aeiouAEIOU".IndexOf(${first()}) >= 0`, p: 3 };
      case "code":
        return { t: `(int)${this.expr(a, UNARY)}`, p: UNARY };
      case "char":
        return { t: `(char)${this.expr(a, UNARY)}`, p: UNARY };
      case "digit":
        return { t: `${this.expr(a, 5)} - '0'`, p: 5 };
      case "reverse":
        this.needs.add("System.Linq");
        return atom(`new string(${this.expr(a, ATOM)}.Reverse().ToArray())`);
      default:
        if (CHARS[e.name]) return atom(`char.${CHARS[e.name]}(${first()})`);
        throw new Error(`C# has no builtin ${e.name}`);
    }
  }

  interpolated(parts) {
    const items = this.printParts(parts);
    if (items.length === 1 && items[0].lit !== undefined) return quote(items[0].lit);
    if (items.length === 1 && this.typeOf(items[0].e) !== "double") return this.expr(items[0].e);
    let body = "";
    for (const part of items) {
      if (part.lit !== undefined) {
        body += quote(part.lit).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}");
        continue;
      }
      const type = this.typeOf(part.e);
      const text = this.expr(part.e, 1, true);
      body += type === "double" ? `{${text}:F${part.dp ?? 2}}` : `{${text}}`;
    }
    return `$"${body}"`;
  }

  s_print(s) {
    const text = s.parts.length ? this.interpolated(s.parts) : "";
    this.line(`Console.${s.newline ? "WriteLine" : "Write"}(${text});`);
  }

  prompt(prompt) {
    if (prompt)
      this.line(`Console.Write(${this.interpolated(Array.isArray(prompt) ? prompt : [prompt])});`);
  }

  readText(type) {
    if (type === "string") return 'Console.ReadLine() ?? ""';
    if (type === "char") return "Console.ReadLine()!.Trim()[0]";
    return `${PARSE[type]}(Console.ReadLine())`;
  }

  s_read(s) {
    this.prompt(s.prompt);
    if (this.lookup(s.name)) this.line(`${s.name} = ${this.readText(s.type)};`);
    else {
      this.line(`${this.declText(s.name, s.type, this.readText(s.type))};`);
      this.declare(s.name, s.type);
    }
  }

  s_readItem(s) {
    this.prompt(s.prompt);
    this.line(`${this.expr(s.target)} = ${this.readText(s.type)};`);
  }

  declareArray(s) {
    const type = this.scalar(s.elem);
    this.line(`${type}[] ${s.name} = new ${type}[${this.expr(s.size)}];`);
  }

  s_sort(s) {
    const n = this.expr(s.arr);
    this.line(`Array.Sort(${n});`);
    if (s.desc) this.line(`Array.Reverse(${n});`);
  }

  signature(f) {
    const params = this.visibleParams(f)
      .map((p) => `${this.scalar(p.type)} ${p.name}`)
      .join(", ");
    const returns = !f.returns || f.returns === "void" ? "void" : this.scalar(f.returns);
    return `static ${returns} ${this.fnName(f.name)}(${params})`;
  }

  emit() {
    this.depth = 1;
    this.blockStart("static void Main()");
    this.emitMainBody();
    this.blockEnd();
    this.gap();
    this.prog.functions.forEach((f) => this.emitFunction(f));
    const body = this.lines;
    const usings = [...this.needs].sort().map((name) => `using ${name};`);
    this.lines = [...usings, "", "class Program", "{", ...body, "}"];
    return this.text();
  }
}
