import { elemType } from "../ir.js";
import { ATOM, Emitter, UNARY, quote } from "./base.js";
import { identifierNames } from "./names.js";

const CHARS = {
  isDigit: "isDigit",
  isAlpha: "isLetter",
  isUpper: "isUpperCase",
  isLower: "isLowerCase",
  isSpace: "isWhitespace",
  isAlnum: "isLetterOrDigit",
};
const SCAN = {
  int: "nextInt()",
  long: "nextLong()",
  double: "nextDouble()",
  char: "next().charAt(0)",
  string: "nextLine()",
};
const atom = (t) => ({ t, p: ATOM });

export class JavaEmitter extends Emitter {
  constructor(prog, options) {
    super(prog, options);
    this.breakAfterDefault = true;
    this.tokenRead = false;
  }

  scalar(type) {
    if (this.isArray(type)) return `${this.scalar(elemType(type))}[]`;
    return { bool: "boolean", string: "String" }[type] || type;
  }

  number(e) {
    const text = super.number(e);
    return e.type === "long" && Math.abs(e.value) > 2147483647 ? `${text}L` : text;
  }

  declText(name, type, valueText) {
    return `${this.scalar(type)} ${name}${valueText === null ? "" : ` = ${valueText}`}`;
  }

  arrayLiteral(e) {
    return `{${e.values.map((x) => this.expr(x)).join(", ")}}`;
  }

  initText(type, value) {
    if (value.k === "arr") return this.arrayLiteral(value);
    return this.expr(value);
  }

  lengthOf(e) {
    return `${this.expr(e, ATOM)}.${this.typeOf(e) === "string" ? "length()" : "length"}`;
  }

  charAt(s, i) {
    return `${this.expr(s, ATOM)}.charAt(${this.expr(i)})`;
  }

  cast(e) {
    return { t: `(${this.scalar(e.to)}) ${this.expr(e.e, UNARY)}`, p: UNARY };
  }

  binary(e) {
    if ((e.op === "==" || e.op === "!=") && this.typeOf(e.l) === "string") {
      const test = `${this.expr(e.l, ATOM)}.equals(${this.expr(e.r)})`;
      return e.op === "==" ? atom(test) : { t: `!${test}`, p: UNARY };
    }
    return super.binary(e);
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
        return atom(`Math.${e.name}(${e.args.map((x) => this.expr(x)).join(", ")})`);
      case "upper":
        return atom(
          string() ? `${this.expr(a, ATOM)}.toUpperCase()` : `Character.toUpperCase(${first()})`,
        );
      case "lower":
        return atom(
          string() ? `${this.expr(a, ATOM)}.toLowerCase()` : `Character.toLowerCase(${first()})`,
        );
      case "isVowel":
        return { t: `"aeiouAEIOU".indexOf(${first()}) != -1`, p: 3 };
      case "code":
        return { t: `(int) ${this.expr(a, UNARY)}`, p: UNARY };
      case "char":
        return { t: `(char) ${this.expr(a, UNARY)}`, p: UNARY };
      case "digit":
        return { t: `${this.expr(a, 5)} - '0'`, p: 5 };
      case "reverse":
        return atom(`new StringBuilder(${first()}).reverse().toString()`);
      default:
        if (CHARS[e.name]) return atom(`Character.${CHARS[e.name]}(${first()})`);
        throw new Error(`Java has no builtin ${e.name}`);
    }
  }

  printText(parts, newline) {
    const items = this.printParts(parts);
    if (items.some((part) => part.e && this.typeOf(part.e) === "double")) {
      let format = "";
      const args = [];
      for (const part of items) {
        if (part.lit !== undefined) {
          format += part.lit.replace(/%/g, "%%");
          continue;
        }
        const type = this.typeOf(part.e);
        format +=
          { double: `%.${part.dp ?? 2}f`, char: "%c", string: "%s", bool: "%b" }[type] || "%d";
        args.push(this.expr(part.e));
      }
      if (newline) format += "%n";
      return `System.out.printf(${[quote(format), ...args].join(", ")});`;
    }
    const pieces = items.map((part) =>
      part.lit !== undefined ? quote(part.lit) : this.expr(part.e, ATOM),
    );
    if (items.length > 1 && items[0].e && items[1].e) pieces.unshift('""');
    return `System.out.${newline ? "println" : "print"}(${pieces.join(" + ")});`;
  }

  s_print(s) {
    this.line(this.printText(s.parts, s.newline));
  }

  prompt(prompt) {
    if (prompt) this.line(this.printText(Array.isArray(prompt) ? prompt : [prompt], false));
  }

  scanText(type) {
    if (type === "string" && this.tokenRead) {
      this.line("scanner.nextLine();");
      this.tokenRead = false;
    }
    if (type !== "string") this.tokenRead = true;
    return `scanner.${SCAN[type]}`;
  }

  s_read(s) {
    this.prompt(s.prompt);
    const reading = this.scanText(s.type);
    if (this.lookup(s.name)) this.line(`${s.name} = ${reading};`);
    else {
      this.line(`${this.declText(s.name, s.type, reading)};`);
      this.declare(s.name, s.type);
    }
  }

  s_readItem(s) {
    this.prompt(s.prompt);
    this.line(`${this.expr(s.target)} = ${this.scanText(s.type)};`);
  }

  declareArray(s) {
    const type = this.scalar(s.elem);
    this.line(`${type}[] ${s.name} = new ${type}[${this.expr(s.size)}];`);
  }

  s_sort(s) {
    this.needs.add("java.util.Arrays");
    const n = this.expr(s.arr);
    this.line(`Arrays.sort(${n});`);
    if (!s.desc) return;
    const elem = this.scalar(elemType(this.typeOf(s.arr)));
    const [left, right, temp] = ["left", "right", "temp"].map((name) => this.unused(name));
    this.blockStart(
      `for (int ${left} = 0, ${right} = ${n}.length - 1; ${left} < ${right}; ${left}++, ${right}--)`,
    );
    this.line(`${elem} ${temp} = ${n}[${left}];`);
    this.line(`${n}[${left}] = ${n}[${right}];`);
    this.line(`${n}[${right}] = ${temp};`);
    this.blockEnd();
  }

  unused(base) {
    this.taken ||= new Set(identifierNames(this.prog).keys());
    let name = base;
    for (let n = 2; this.taken.has(name); n++) name = `${base}${n}`;
    return name;
  }

  signature(f) {
    const params = this.visibleParams(f)
      .map((p) => `${this.scalar(p.type)} ${p.name}`)
      .join(", ");
    const returns = !f.returns || f.returns === "void" ? "void" : this.scalar(f.returns);
    return `static ${returns} ${f.name}(${params})`;
  }

  emit() {
    const input = this.hasInput();
    this.depth = 1;
    this.blockStart("public static void main(String[] args)");
    if (input) {
      this.needs.add("java.util.Scanner");
      this.line("Scanner scanner = new Scanner(System.in);");
      this.gap();
    }
    this.emitMainBody();
    if (input) {
      this.gap();
      this.line("scanner.close();");
    }
    this.blockEnd();
    this.gap();
    this.prog.functions.forEach((f) => this.emitFunction(f));
    const body = this.lines;
    const imports = [...this.needs].sort().map((name) => `import ${name};`);
    this.lines = [...imports, "", "public class Main {", ...body, "}"];
    return this.text();
  }
}
