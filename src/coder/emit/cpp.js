import { elemType } from "../ir.js";
import { ATOM, UNARY, quote } from "./base.js";
import { CEmitter } from "./c.js";

const ORDER = ["iostream", "string", "vector", "algorithm", "functional", "utility", "cmath", "cstdlib", "cctype", "iomanip"];
const CTYPE = { isDigit: "isdigit", isAlpha: "isalpha", isUpper: "isupper", isLower: "islower", isSpace: "isspace", isAlnum: "isalnum" };
const atom = (t) => ({ t, p: ATOM });

export class CppEmitter extends CEmitter {
  constructor(prog, options) {
    super(prog, options);
    this.needs = new Set(["iostream"]);
    this.dropLengthParams = true;
    this.cStrings = false;
    this.printsDouble = false;
  }

  returnType(type) {
    return !type || type === "void" ? "void" : this.scalar(type);
  }

  name(n) {
    return n;
  }

  fnName(n) {
    return n;
  }

  scalar(type) {
    if (type === "long") return "long long";
    if (type === "string") {
      this.needs.add("string");
      return "std::string";
    }
    if (this.isArray(type)) {
      this.needs.add("vector");
      return `std::vector<${this.scalar(elemType(type))}>`;
    }
    if (type.endsWith("*")) return `${this.scalar(type.slice(0, -1))}*`;
    return type;
  }

  boolean(value) {
    return value ? "true" : "false";
  }

  declText(name, type, valueText, s = {}) {
    const init = valueText === null || valueText === undefined ? "" : ` = ${valueText}`;
    if (this.isArray(type) && !init && s.size) return `${this.scalar(type)} ${name}(${s.size})`;
    return `${this.scalar(type)} ${name}${init}`;
  }

  groupDecl(type, names) {
    return `${this.scalar(type)} ${names.join(", ")}`;
  }

  initText(type, value) {
    if (value.k === "len") return this.rawLength(value.e);
    return this.expr(value);
  }

  rawLength(e) {
    return `${this.expr(e, ATOM)}.${this.typeOf(e) === "string" ? "length" : "size"}()`;
  }

  render(e) {
    if (e.k === "len") return atom(`static_cast<int>(${this.rawLength(e.e)})`);
    return super.render(e);
  }

  cast(e) {
    return atom(`static_cast<${this.castType(e.to)}>(${this.expr(e.e)})`);
  }

  binary(e) {
    return Object.getPrototypeOf(CEmitter.prototype).binary.call(this, e);
  }

  builtin(e) {
    const [a, b] = e.args;
    const first = () => this.expr(a);
    switch (e.name) {
      case "sqrt":
      case "pow":
        this.needs.add("cmath");
        return atom(`std::${e.name}(${e.args.map((x) => this.expr(x)).join(", ")})`);
      case "abs":
        this.needs.add(this.typeOf(a) === "double" ? "cmath" : "cstdlib");
        return atom(`std::abs(${first()})`);
      case "upper":
      case "lower": {
        this.needs.add("cctype");
        if (this.typeOf(a) !== "string") return atom(`static_cast<char>(std::to${e.name}(${first()}))`);
        const helper = e.name === "upper" ? "toUpperCase" : "toLowerCase";
        this.needs.add("string");
        this.helper(helper, [
          `std::string ${helper}(std::string text) {`,
          "    for (char& ch : text) {",
          `        ch = static_cast<char>(std::to${e.name}(static_cast<unsigned char>(ch)));`,
          "    }",
          "    return text;",
          "}",
        ]);
        return atom(`${helper}(${first()})`);
      }
      case "isVowel":
        this.needs.add("string");
        return { t: `std::string("aeiouAEIOU").find(${first()}) != std::string::npos`, p: 3 };
      case "code":
        return atom(`static_cast<int>(${first()})`);
      case "char":
        return atom(`static_cast<char>(${first()})`);
      case "digit":
        return { t: `${this.expr(a, 5)} - '0'`, p: 5 };
      case "max":
      case "min":
        this.needs.add("algorithm");
        return atom(`std::${e.name}(${first()}, ${this.expr(b)})`);
      case "reverse":
        return atom(`std::string(${this.expr(a, ATOM)}.rbegin(), ${this.expr(a, ATOM)}.rend())`);
      default:
        if (CTYPE[e.name]) {
          this.needs.add("cctype");
          return atom(`std::${CTYPE[e.name]}(${first()})`);
        }
        throw new Error(`C++ has no builtin ${e.name}`);
    }
  }

  coutText(parts, newline) {
    const chain = [];
    let pending = "";
    const flush = () => {
      if (pending) chain.push(quote(pending));
      pending = "";
    };
    for (const part of this.printParts(parts)) {
      if (part.lit !== undefined) {
        pending += part.lit;
        continue;
      }
      flush();
      const type = this.typeOf(part.e);
      let text = this.expr(part.e, 4, true);
      if (type === "bool") text = `(${this.expr(part.e, 1, true)} ? "true" : "false")`;
      if (type === "double") {
        this.printsDouble = true;
        const dp = part.dp ?? 2;
        if (dp !== 2) {
          this.needs.add("iomanip");
          text = `std::setprecision(${dp}) << ${text} << std::setprecision(2)`;
        }
      }
      chain.push(text);
    }
    if (newline) {
      if (pending || !chain.length) pending += "\n";
      else {
        flush();
        chain.push("'\\n'");
      }
    }
    flush();
    return `std::cout << ${chain.join(" << ")};`;
  }

  s_print(s) {
    this.line(this.coutText(s.parts, s.newline));
  }

  prompt(prompt) {
    if (prompt) this.line(this.coutText(Array.isArray(prompt) ? prompt : [prompt], false));
  }

  s_readItem(s) {
    this.prompt(s.prompt);
    if (s.type === "string") this.line(`std::getline(std::cin >> std::ws, ${this.expr(s.target)});`);
    else this.line(`std::cin >> ${this.expr(s.target)};`);
  }

  declareArray(s) {
    this.line(`${this.scalar(`${s.elem}[]`)} ${s.name}(${this.expr(s.size)});`);
  }

  s_swap(s) {
    this.needs.add("utility");
    this.line(`std::swap(${this.expr(s.a)}, ${this.expr(s.b)});`);
  }

  s_sort(s) {
    this.needs.add("algorithm");
    const n = this.expr(s.arr, ATOM);
    if (s.desc) {
      this.needs.add("functional");
      const elem = this.scalar(elemType(this.typeOf(s.arr)));
      this.line(`std::sort(${n}.begin(), ${n}.end(), std::greater<${elem}>());`);
    } else {
      this.line(`std::sort(${n}.begin(), ${n}.end());`);
    }
  }

  paramText(p) {
    if (p.type === "string" || this.isArray(p.type)) {
      return `${p.mutates ? "" : "const "}${this.scalar(p.type)}& ${p.name}`;
    }
    return `${this.scalar(p.type)} ${p.name}`;
  }

  signature(f) {
    const params = this.visibleParams(f).map((p) => this.paramText(p)).join(", ");
    return `${this.returnType(f.returns)} ${f.name}(${params})`;
  }

  emitMain() {
    this.blockStart("int main()");
    const at = this.lines.length;
    this.emitMainBody();
    if (this.printsDouble) {
      this.needs.add("iomanip");
      this.lines.splice(at, 0, `${this.unit}std::cout << std::fixed << std::setprecision(2);`, "");
    }
    this.gap();
    this.line("return 0;");
    this.blockEnd();
  }

  header() {
    return ORDER.filter((h) => this.needs.has(h)).map((h) => `#include <${h}>`);
  }
}
