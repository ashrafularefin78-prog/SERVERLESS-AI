import { ATOM, Emitter, negate, quote, snake } from "./base.js";

const STRING_TESTS = {
  isDigit: "isdigit",
  isAlpha: "isalpha",
  isUpper: "isupper",
  isLower: "islower",
  isSpace: "isspace",
  isAlnum: "isalnum",
};
const COMPARISON = new Set(["==", "!=", "<", "<=", ">", ">="]);
const atom = (t) => ({ t, p: ATOM });

export class PythonEmitter extends Emitter {
  constructor(prog, options) {
    super(prog, options);
    this.semi = "";
    this.increments = false;
    this.marks = [];
    this.inFString = false;
    this.notes = new Set();
  }

  name(n) {
    return snake(n);
  }

  fnName(n) {
    return this.name(n);
  }

  blockStart(head) {
    this.line(`${head}:`);
    this.depth += 1;
    this.push();
    this.marks.push(this.lines.length);
  }

  fillEmpty() {
    if (this.lines.length === this.marks.at(-1)) this.line("pass");
  }

  blockMid(head) {
    this.fillEmpty();
    this.pop();
    this.depth -= 1;
    this.line(`${head}:`);
    this.depth += 1;
    this.push();
    this.marks[this.marks.length - 1] = this.lines.length;
  }

  blockEnd() {
    this.fillEmpty();
    this.marks.pop();
    this.pop();
    this.depth -= 1;
  }

  condText(c) {
    return this.expr(c);
  }

  string(value) {
    return quote(value, this.inFString ? "'" : '"');
  }

  char(value) {
    return this.string(value);
  }

  boolean(value) {
    return value ? "True" : "False";
  }

  prec(op) {
    return COMPARISON.has(op) ? 3 : super.prec(op);
  }

  binaryOp(e) {
    if (e.op === "&&") return "and";
    if (e.op === "||") return "or";
    if (e.op === "/" && this.isIntegral(this.typeOf(e.l)) && this.isIntegral(this.typeOf(e.r))) return "//";
    return e.op;
  }

  render(e) {
    if (e.k === "not") return { t: `not ${this.expr(e.e, 2.5)}`, p: 2.5 };
    if (e.k === "addr" || e.k === "deref") throw new Error("Python has no pointers");
    return super.render(e);
  }

  conditional(e) {
    return { t: `${this.expr(e.t, 1)} if ${this.expr(e.c, 1)} else ${this.expr(e.f, 0.5)}`, p: 0.5 };
  }

  arrayLiteral(e) {
    return `[${e.values.map((x) => this.expr(x)).join(", ")}]`;
  }

  lengthOf(e) {
    return `len(${this.expr(e)})`;
  }

  charAt(s, i) {
    return `${this.expr(s, ATOM)}[${this.expr(i)}]`;
  }

  cast(e) {
    const inner = e.e;
    if (e.to === "char") return atom(`chr(${this.expr(inner)})`);
    if (e.to === "double") return atom(`float(${this.expr(inner)})`);
    if (e.to === "long" && this.isIntegral(this.typeOf(inner))) return this.render(inner);
    if (inner.k === "fn" && inner.name === "pow" && inner.args.every((x) => this.isIntegral(this.typeOf(x)))) {
      return this.render(inner);
    }
    return atom(`int(${this.expr(inner)})`);
  }

  builtin(e) {
    const [a, b] = e.args;
    const first = () => this.expr(a);
    const recv = () => this.expr(a, ATOM);
    switch (e.name) {
      case "sqrt":
        this.needs.add("math");
        return atom(`math.sqrt(${first()})`);
      case "pow":
      case "abs":
      case "max":
      case "min":
        return atom(`${e.name}(${e.args.map((x) => this.expr(x)).join(", ")})`);
      case "upper":
      case "lower":
        return atom(`${recv()}.${e.name}()`);
      case "isVowel":
        return { t: `${this.expr(a, 3, true)} in ${this.string("aeiouAEIOU")}`, p: 3 };
      case "code":
        return atom(`ord(${first()})`);
      case "char":
        return atom(`chr(${first()})`);
      case "digit":
        return atom(`int(${first()})`);
      case "reverse":
        return atom(`${recv()}[::-1]`);
      default:
        if (STRING_TESTS[e.name]) return atom(`${recv()}.${STRING_TESTS[e.name]}()`);
        throw new Error(`Python has no builtin ${e.name}`);
    }
  }

  fstring(parts) {
    const items = this.printParts(parts);
    if (items.every((part) => part.lit !== undefined)) return quote(items.map((part) => part.lit).join(""));
    if (items.length === 1 && this.typeOf(items[0].e) !== "double") return this.expr(items[0].e);
    let body = "";
    for (const part of items) {
      if (part.lit !== undefined) {
        body += quote(part.lit).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}");
        continue;
      }
      this.inFString = true;
      const text = this.expr(part.e);
      this.inFString = false;
      body += this.typeOf(part.e) === "double" ? `{${text}:.${part.dp ?? 2}f}` : `{${text}}`;
    }
    return `f"${body}"`;
  }

  s_print(s) {
    const args = s.parts.length ? [this.fstring(s.parts)] : [];
    if (!s.newline) args.push('end=""');
    this.line(`print(${args.join(", ")})`);
  }

  inputText(type, prompt) {
    const call = `input(${prompt ? this.fstring(Array.isArray(prompt) ? prompt : [prompt]) : ""})`;
    if (type === "int" || type === "long") return `int(${call})`;
    if (type === "double") return `float(${call})`;
    if (type === "char") return `${call}.strip()[0]`;
    return call;
  }

  s_read(s) {
    this.line(`${this.name(s.name)} = ${this.inputText(s.type, s.prompt)}`);
    if (!this.lookup(s.name)) this.declare(s.name, s.type);
  }

  s_readItem(s) {
    this.line(`${this.expr(s.target)} = ${this.inputText(s.type, s.prompt)}`);
  }

  s_readArray(s) {
    const prompt = [`Enter ${s.label} `, { k: "bin", op: "+", l: { k: "var", name: "i" }, r: { k: "num", value: 1, type: "int" } }, ": "];
    this.line(`${this.name(s.name)} = [${this.inputText(s.elem, prompt)} for i in range(${this.expr(s.size)})]`);
    this.declare(s.name, `${s.elem}[]`);
  }

  declareArray(s) {
    const zero = { bool: "False", double: "0.0", string: '""', char: '""' }[s.elem] ?? "0";
    this.line(`${this.name(s.name)} = [${zero}] * ${this.expr(s.size, this.prec("*"), true)}`);
  }

  declText(name, type, valueText) {
    return `${this.name(name)} = ${valueText}`;
  }

  s_let(s) {
    if (s.value === undefined) {
      if (!this.lookup(s.name)) this.declare(s.name, s.type);
      return;
    }
    super.s_let(s);
  }

  s_op(s) {
    const integral = this.isIntegral(this.typeOf(s.target)) && this.isIntegral(this.typeOf(s.value));
    const operator = s.op === "/" && integral ? "//" : s.op;
    this.line(`${this.expr(s.target)} ${operator}= ${this.expr(s.value)}`);
  }

  s_if(s) {
    this.blockStart(`if ${this.expr(s.c)}`);
    this.block(s.then);
    let other = s.otherwise;
    while (other) {
      if (!Array.isArray(other) && other.k === "if") {
        this.blockMid(`elif ${this.expr(other.c)}`);
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

  rangeEnd(to, delta) {
    if (to.k === "num") return String(to.value + delta);
    if (to.k === "bin" && to.r.k === "num" && to.r.value === 1) {
      if ((to.op === "-" && delta === 1) || (to.op === "+" && delta === -1)) return this.expr(to.l);
    }
    return `${this.expr(to, 5)} ${delta > 0 ? "+" : "-"} 1`;
  }

  forLoop(s) {
    const end = s.inclusive ? this.rangeEnd(s.to, s.step > 0 ? 1 : -1) : this.expr(s.to);
    const from = this.expr(s.from);
    let args = `${from}, ${end}`;
    if (s.step !== 1) args += `, ${s.step}`;
    else if (from === "0") args = end;
    this.blockStart(`for ${this.name(s.name)} in range(${args})`);
    this.declare(s.name, "int");
    this.block(s.body);
    this.blockEnd();
  }

  s_do(s) {
    this.blockStart("while True");
    this.block(s.body);
    this.blockStart(`if ${this.expr(negate(s.c))}`);
    this.line("break");
    this.blockEnd();
    this.blockEnd();
  }

  s_switch(s) {
    this.notes.add("`match`/`case` needs Python 3.10 or newer.");
    this.blockStart(`match ${this.expr(s.value)}`);
    for (const item of s.cases) {
      this.blockStart(`case ${item.values.map((x) => this.expr(x)).join(" | ")}`);
      this.block(item.body);
      this.blockEnd();
    }
    if (s.otherwise) {
      this.blockStart("case _");
      this.block(s.otherwise);
      this.blockEnd();
    }
    this.blockEnd();
  }

  s_swap(s) {
    if (s.temp) {
      super.s_swap(s);
      return;
    }
    const a = this.expr(s.a);
    const b = this.expr(s.b);
    this.line(`${a}, ${b} = ${b}, ${a}`);
  }

  s_sort(s) {
    this.line(`${this.expr(s.arr, ATOM)}.sort(${s.desc ? "reverse=True" : ""})`);
  }

  signature(f) {
    return `def ${this.fnName(f.name)}(${this.visibleParams(f).map((p) => this.name(p.name)).join(", ")})`;
  }

  emit() {
    const sections = [];
    for (const f of this.prog.functions) {
      this.lines = [];
      this.emitFunction(f);
      sections.push({ fn: true, text: this.text() });
    }
    this.lines = [];
    this.emitMainBody();
    sections.push({ fn: false, text: this.text() });
    if (this.needs.size) sections.unshift({ fn: false, text: [...this.needs].sort().map((m) => `import ${m}`).join("\n") });
    return sections
      .filter((section) => section.text)
      .map((section, index, list) => (index === 0 ? "" : section.fn || list[index - 1].fn ? "\n\n\n" : "\n\n") + section.text)
      .join("");
  }
}
