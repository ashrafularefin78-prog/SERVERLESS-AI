import { chr, elemType, sub } from "../ir.js";
import { ATOM, COMPARE, Emitter, PREC, negate, quote } from "./base.js";

const UNICODE = {
  isDigit: "IsDigit",
  isAlpha: "IsLetter",
  isUpper: "IsUpper",
  isLower: "IsLower",
  isSpace: "IsSpace",
};
const ARITH = new Set(["+", "-", "*", "/", "%"]);
const GO_PREC = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
  "%": 5,
  "&": 5,
  "^": 4,
};
const atom = (t) => ({ t, p: ATOM });
const negative = (x) => x.k === "neg" || (x.k === "num" && x.value < 0);

function formatText(text) {
  return quote(text).slice(1, -1).replace(/%/g, "%%");
}

export class GoEmitter extends Emitter {
  constructor(prog, options) {
    super(prog, options);
    this.unit = "\t";
    this.semi = "";
    this.helpers = new Map();
    this.goDepth = 1;
    this.lineInput = this.readsType((type) => type === "string" || type === "char");
    this.groupReads = !this.lineInput;
    this.needs.add("fmt");
  }

  goType(type) {
    if (this.isArray(type)) return `[]${this.goType(elemType(type))}`;
    return { long: "int", double: "float64", char: "rune" }[type] || type;
  }

  condText(c) {
    return this.expr(c);
  }

  // gofmt drops the blanks around tighter operators once an expression is nested.
  at(depth, fn) {
    const saved = this.goDepth;
    this.goDepth = Math.max(1, depth);
    try {
      return fn();
    } finally {
      this.goDepth = saved;
    }
  }

  args(count, fn) {
    return count > 1 ? this.at(this.goDepth + 1, fn) : fn();
  }

  expr(e, min = 0, strict = false) {
    const out = this.render(e);
    if (!(out.p < min || (strict && out.p === min))) return out.t;
    return `(${this.at(this.goDepth - 1, () => this.render(e).t)})`;
  }

  operands(e) {
    let { l, r } = e;
    const lt = this.typeOf(l);
    const rt = this.typeOf(r);
    const wrap = (x, type, to) => ({ k: "cast", to, e: x, type });
    if (lt === "double" || rt === "double") {
      if (this.isIntegral(lt) && l.k !== "num") l = wrap(l, lt, "double");
      if (this.isIntegral(rt) && r.k !== "num") r = wrap(r, rt, "double");
    } else if (e.op === "+" && (lt === "string" || rt === "string")) {
      if (lt === "char") l = wrap(l, lt, "string");
      if (rt === "char") r = wrap(r, rt, "string");
    } else if (ARITH.has(e.op) && (lt === "char") !== (rt === "char")) {
      if (lt === "char" && r.k !== "num") l = wrap(l, lt, "int");
      if (rt === "char" && l.k !== "num") r = wrap(r, rt, "int");
    }
    return { l, r };
  }

  leftWrapped(e, l) {
    return (
      l.k === "bin" && (PREC[l.op] < PREC[e.op] || (COMPARE.has(e.op) && PREC[l.op] === PREC[e.op]))
    );
  }

  walkBinary(e) {
    const prec = GO_PREC[e.op];
    const { l, r } = this.operands(e);
    let has4 = prec === 4;
    let has5 = prec === 5;
    let problem = 0;
    const merge = (x) => {
      const sub = this.walkBinary(x);
      has4 ||= sub.has4;
      has5 ||= sub.has5;
      problem = Math.max(problem, sub.problem);
    };
    if (l.k === "bin" && !this.leftWrapped(e, l)) merge(l);
    if (r.k === "bin" && PREC[r.op] > PREC[e.op]) merge(r);
    if (e.op === "-" && negative(r)) problem = Math.max(problem, 4);
    return { has4, has5, problem };
  }

  cutoff(e) {
    const { has4, has5, problem } = this.walkBinary(e);
    if (problem > 0) return problem + 1;
    if (has4 && has5) return this.goDepth === 1 ? 5 : 4;
    return this.goDepth === 1 ? 6 : 4;
  }

  binary(e) {
    const { l, r } = this.operands(e);
    const depth = this.goDepth;
    const p = PREC[e.op];
    const blank = GO_PREC[e.op] < this.cutoff(e) ? " " : "";
    const same = l.k === "bin" && !this.leftWrapped(e, l) && GO_PREC[l.op] === GO_PREC[e.op];
    const bytes = this.rawBytes;
    this.rawBytes = COMPARE.has(e.op) && l.k === "at" && (r.k === "at" || r.k === "char");
    const left = this.at(depth + (same ? 0 : 1), () => this.expr(l, p, COMPARE.has(e.op)));
    const right = this.at(depth + 1, () => this.expr(r, p, true));
    this.rawBytes = bytes;
    return { t: `${left}${blank}${e.op}${blank}${right}`, p };
  }

  index(i) {
    return this.at(this.goDepth + 1, () => this.expr(i));
  }

  render(e) {
    if (e.k === "idx") return atom(`${this.expr(e.a, ATOM)}[${this.index(e.i)}]`);
    if (e.k === "cond") throw new Error("Go has no ternary operator");
    if (e.k === "addr" || e.k === "deref") throw new Error("Pointers are not generated for Go");
    return super.render(e);
  }

  callText(e) {
    const list = this.callArgs(e);
    return `${this.fnName(e.name)}(${this.args(list.length, () => list.map((arg) => this.expr(arg)).join(", "))})`;
  }

  typeOf(e) {
    if (e.k === "bin" && ARITH.has(e.op)) {
      const lt = super.typeOf(e.l);
      const rt = super.typeOf(e.r);
      if (
        (lt === "char" && (rt === "char" || e.r.k === "num")) ||
        (rt === "char" && e.l.k === "num")
      )
        return "char";
    }
    return super.typeOf(e);
  }

  arrayLiteral(e) {
    return `${this.goType(`${e.elem}[]`)}{${e.values.map((x) => this.expr(x)).join(", ")}}`;
  }

  lengthOf(e) {
    return `len(${this.expr(e)})`;
  }

  charAt(s, i) {
    const bytes = this.rawBytes;
    this.rawBytes = false;
    const text = `${this.expr(s, ATOM)}[${this.index(i)}]`;
    this.rawBytes = bytes;
    return bytes ? text : `rune(${text})`;
  }

  cast(e) {
    if (e.to === "long" && this.isIntegral(this.typeOf(e.e))) return this.render(e.e);
    const type = { double: "float64", int: "int", long: "int", char: "rune", string: "string" }[
      e.to
    ];
    return atom(`${type}(${this.expr(e.e)})`);
  }

  float(x) {
    return this.isIntegral(this.typeOf(x)) && x.k !== "num"
      ? `float64(${this.expr(x)})`
      : this.expr(x);
  }

  helper(name, lines, ...packages) {
    packages.forEach((p) => this.needs.add(p));
    if (!this.helpers.has(name)) this.helpers.set(name, lines);
  }

  builtin(e) {
    const [a, b] = e.args;
    const first = () => this.expr(a);
    const string = () => this.typeOf(a) === "string";
    switch (e.name) {
      case "sqrt":
        this.needs.add("math");
        return atom(`math.Sqrt(${this.float(a)})`);
      case "pow":
        this.needs.add("math");
        return atom(`math.Pow(${this.args(2, () => `${this.float(a)}, ${this.float(b)}`)})`);
      case "abs":
        if (this.typeOf(a) === "double") {
          this.needs.add("math");
          return atom(`math.Abs(${first()})`);
        }
        this.helper("abs", [
          "func abs(x int) int {",
          "\tif x < 0 {",
          "\t\treturn -x",
          "\t}",
          "\treturn x",
          "}",
        ]);
        return atom(`abs(${first()})`);
      case "upper":
      case "lower": {
        const fnName = e.name === "upper" ? "ToUpper" : "ToLower";
        this.needs.add(string() ? "strings" : "unicode");
        return atom(`${string() ? "strings" : "unicode"}.${fnName}(${first()})`);
      }
      case "isAlnum":
        this.needs.add("unicode");
        return { t: `unicode.IsLetter(${first()}) || unicode.IsDigit(${first()})`, p: 1 };
      case "isVowel":
        this.needs.add("strings");
        return atom(`strings.ContainsRune("aeiouAEIOU", ${this.args(2, first)})`);
      case "code":
        return atom(`int(${first()})`);
      case "char":
        return atom(`rune(${first()})`);
      case "digit":
        return atom(`int(${this.expr(sub(a, chr("0")))})`);
      case "max":
      case "min":
        return atom(`${e.name}(${this.args(2, () => `${first()}, ${this.expr(b)}`)})`);
      case "reverse":
        this.helper("reverseString", [
          "func reverseString(s string) string {",
          "\trunes := []rune(s)",
          "\tfor i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {",
          "\t\trunes[i], runes[j] = runes[j], runes[i]",
          "\t}",
          "\treturn string(runes)",
          "}",
        ]);
        return atom(`reverseString(${first()})`);
      default:
        if (UNICODE[e.name]) {
          this.needs.add("unicode");
          return atom(`unicode.${UNICODE[e.name]}(${first()})`);
        }
        throw new Error(`Go has no builtin ${e.name}`);
    }
  }

  coerce(type, value) {
    const valueType = this.typeOf(value);
    if (type === "double" && value.k === "num") return this.number({ ...value, type: "double" });
    if (type === "double" && this.isIntegral(valueType)) return `float64(${this.expr(value)})`;
    if (
      this.isIntegral(type) &&
      (valueType === "double" || valueType === "char") &&
      value.k !== "num"
    ) {
      return `int(${this.expr(value)})`;
    }
    if (type === "string" && valueType === "char") return `string(${this.expr(value)})`;
    return this.expr(value);
  }

  initText(type, value) {
    return this.coerce(type, value);
  }

  declText(name, type, valueText) {
    return valueText === null ? `var ${name} ${this.goType(type)}` : `${name} := ${valueText}`;
  }

  groupDecl(type, names) {
    return `var ${names.join(", ")} ${this.goType(type)}`;
  }

  condIf(target, c) {
    const assign = (x) =>
      x.k === "cond" ? [this.condIf(target, x)] : [{ k: "set", target, value: x }];
    return {
      k: "if",
      c: c.c,
      then: assign(c.t),
      otherwise: c.f.k === "cond" ? this.condIf(target, c.f) : assign(c.f),
    };
  }

  s_let(s) {
    if (s.value?.k === "cond" && !this.lookup(s.name)) {
      this.line(this.declText(s.name, s.type, null));
      this.declare(s.name, s.type);
      this.stmt(this.condIf({ k: "var", name: s.name }, s.value));
      return;
    }
    super.s_let(s);
  }

  s_set(s) {
    if (s.value.k === "cond") {
      this.stmt(this.condIf(s.target, s.value));
      return;
    }
    this.line(`${this.expr(s.target)} = ${this.coerce(this.typeOf(s.target), s.value)}`);
  }

  s_op(s) {
    const one = s.value.k === "num" && s.value.value === 1 && (s.op === "+" || s.op === "-");
    if (one) this.line(`${this.expr(s.target)}${s.op}${s.op}`);
    else
      this.line(`${this.expr(s.target)} ${s.op}= ${this.coerce(this.typeOf(s.target), s.value)}`);
  }

  printText(parts, newline) {
    const items = this.printParts(parts);
    if (items.every((part) => part.lit !== undefined)) {
      const text = items.map((part) => part.lit).join("");
      if (!text) return newline ? "fmt.Println()" : null;
      return `fmt.${newline ? "Println" : "Print"}(${quote(text)})`;
    }
    const single = items.length === 1 && !["double", "char"].includes(this.typeOf(items[0].e));
    if (single && newline) return `fmt.Println(${this.expr(items[0].e)})`;
    let format = "";
    const exprs = [];
    for (const part of items) {
      if (part.lit !== undefined) {
        format += formatText(part.lit);
        continue;
      }
      const type = this.typeOf(part.e);
      format +=
        type === "double"
          ? `%.${part.dp ?? 2}f`
          : { char: "%c", string: "%s", bool: "%t" }[type] || "%d";
      exprs.push(part.e);
    }
    const args = this.args(exprs.length + 1, () => exprs.map((x) => this.expr(x)).join(", "));
    return `fmt.Printf("${format}${newline ? "\\n" : ""}", ${args})`;
  }

  s_print(s) {
    const text = this.printText(s.parts, s.newline);
    if (text) this.line(text);
  }

  prompt(prompt) {
    const text = prompt ? this.printText(Array.isArray(prompt) ? prompt : [prompt], false) : null;
    if (text) this.line(text);
  }

  lineRead(type) {
    this.helper(
      "readLine",
      [
        "func readLine(reader *bufio.Reader) string {",
        "\tline, _ := reader.ReadString('\\n')",
        "\treturn strings.TrimSpace(line)",
        "}",
      ],
      "bufio",
      "os",
      "strings",
    );
    if (type === "int" || type === "long") {
      this.needs.add("strconv");
      return { pair: true, text: "strconv.Atoi(readLine(reader))" };
    }
    if (type === "double") {
      this.needs.add("strconv");
      return { pair: true, text: "strconv.ParseFloat(readLine(reader), 64)" };
    }
    if (type === "char") return { pair: false, text: "[]rune(readLine(reader))[0]" };
    return { pair: false, text: "readLine(reader)" };
  }

  s_read(s) {
    if (!this.lineInput) {
      if (!this.lookup(s.name)) this.s_let({ name: s.name, type: s.type });
      this.s_readItem({ target: { k: "var", name: s.name }, type: s.type, prompt: s.prompt });
      return;
    }
    this.prompt(s.prompt);
    const { pair, text } = this.lineRead(s.type);
    const declared = Boolean(this.lookup(s.name));
    this.line(`${s.name}${pair ? ", _" : ""} ${declared ? "=" : ":="} ${text}`);
    if (!declared) this.declare(s.name, s.type);
  }

  s_readItem(s) {
    this.prompt(s.prompt);
    if (!this.lineInput) {
      this.line(`fmt.Scan(&${this.expr(s.target)})`);
      return;
    }
    const { pair, text } = this.lineRead(s.type);
    this.line(`${this.expr(s.target)}${pair ? ", _" : ""} = ${text}`);
  }

  declareArray(s) {
    this.line(
      `${s.name} := make(${this.goType(`${s.elem}[]`)}, ${this.args(2, () => this.expr(s.size))})`,
    );
  }

  loopVarDecl(name) {
    return name;
  }

  forLoop(s) {
    const declared = Boolean(this.lookup(s.name));
    const update = this.updateText(s);
    this.blockStart(
      `for ${s.name} ${declared ? "=" : ":="} ${this.expr(s.from)}; ${this.expr(this.loopCondition(s))}; ${update}`,
    );
    this.declare(s.name, "int");
    this.block(s.body);
    this.blockEnd();
  }

  s_while(s) {
    this.blockStart(`for ${this.expr(s.c)}`);
    this.block(s.body);
    this.blockEnd();
  }

  s_do(s) {
    this.blockStart("for");
    this.block(s.body);
    this.blockStart(`if ${this.expr(negate(s.c))}`);
    this.line("break");
    this.blockEnd();
    this.blockEnd();
  }

  s_switch(s) {
    this.line(`switch ${this.expr(s.value)} {`);
    const section = (head, body) => {
      this.line(head);
      this.depth += 1;
      this.push();
      this.block(body);
      this.pop();
      this.depth -= 1;
    };
    s.cases.forEach((item) =>
      section(`case ${item.values.map((x) => this.expr(x)).join(", ")}:`, item.body),
    );
    if (s.otherwise) section("default:", s.otherwise);
    this.line("}");
  }

  s_swap(s) {
    if (s.temp) {
      super.s_swap(s);
      return;
    }
    const [a, b] = this.at(2, () => [this.expr(s.a), this.expr(s.b)]);
    this.line(`${a}, ${b} = ${b}, ${a}`);
  }

  s_sort(s) {
    this.needs.add("sort");
    const n = this.expr(s.arr);
    const double = elemType(this.typeOf(s.arr)) === "double";
    if (s.desc)
      this.line(`sort.Sort(sort.Reverse(sort.${double ? "Float64Slice" : "IntSlice"}(${n})))`);
    else this.line(`sort.${double ? "Float64s" : "Ints"}(${n})`);
  }

  signature(f) {
    const params = this.visibleParams(f)
      .map((p) => `${p.name} ${this.goType(p.type)}`)
      .join(", ");
    const returns = !f.returns || f.returns === "void" ? "" : ` ${this.goType(f.returns)}`;
    return `func ${f.name}(${params})${returns}`;
  }

  emit() {
    this.prog.functions.forEach((f) => this.emitFunction(f));
    const functions = this.lines;
    this.lines = [];
    this.blockStart("func main()");
    if (this.lineInput && this.hasInput()) {
      this.line("reader := bufio.NewReader(os.Stdin)");
      this.gap();
    }
    this.emitMainBody();
    this.blockEnd();
    const main = this.lines;
    const packages = [...this.needs].sort();
    const imports =
      packages.length === 1
        ? [`import "${packages[0]}"`]
        : ["import (", ...packages.map((p) => `\t"${p}"`), ")"];
    const helpers = [...this.helpers.values()].flatMap((lines) => [...lines, ""]);
    this.lines = ["package main", "", ...imports, "", ...helpers, ...functions, "", ...main];
    return this.text();
  }
}
