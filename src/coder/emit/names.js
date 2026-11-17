import { pascal, snake } from "./base.js";

const words = (...lists) => new Set(lists.join(" ").trim().split(/\s+/));

const C_WORDS =
  "auto break case char const continue default do double else enum extern float for goto if inline int long register " +
  "restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false main " +
  "printf scanf puts strlen strcpy strcmp strcat qsort abs pow sqrt exp log floor ceil round toupper tolower " +
  "isdigit isalpha isupper islower isspace isalnum malloc free exit compare_ints compare_doubles compare_ints_desc compare_doubles_desc";
const CPP_WORDS =
  "alignas alignof and and_eq asm bitand bitor catch char8_t char16_t char32_t class compl concept consteval constexpr " +
  "constinit const_cast co_await co_return co_yield decltype delete dynamic_cast explicit export friend mutable namespace " +
  "new noexcept not not_eq nullptr operator or or_eq private protected public reinterpret_cast requires static_assert " +
  "static_cast template this thread_local throw try typeid typename using virtual wchar_t xor xor_eq std toUpperCase toLowerCase";
const JAVA_WORDS =
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final " +
  "finally float for goto if implements import instanceof int interface long native new package private protected public " +
  "return short static strictfp super switch synchronized this throw throws transient try void volatile while true false " +
  "null var yield record sealed permits main args scanner Scanner Main Math String System Arrays Character Integer Double";
const CSHARP_WORDS =
  "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else " +
  "enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long " +
  "namespace new null object operator out override params private protected public readonly ref return sbyte sealed short " +
  "sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual " +
  "void volatile while var dynamic await async yield nameof Main Program Console Math Convert Array String Char";
const PYTHON_WORDS =
  "False None True and as assert async await break class continue def del elif else except finally for from global if " +
  "import in is lambda nonlocal not or pass raise return try while with yield match case abs all any bin bool chr dict dir " +
  "divmod enumerate eval exec exit filter float format hash help hex id input int isinstance iter len list map max min next " +
  "object oct open ord pow print quit range repr reversed round set slice sorted str sum super tuple type vars zip math";
const JS_WORDS =
  "break case catch class const continue debugger default delete do else enum export extends false finally for function " +
  "if import in instanceof new null return super switch this throw true try typeof var void while with yield let static " +
  "implements interface package private protected public await async arguments eval undefined NaN Infinity require " +
  "process console Math String Number Symbol readline rl inputLines ask main";
const GO_WORDS =
  "break case chan const continue default defer else fallthrough for func go goto if import interface map package range " +
  "return select struct switch type var bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 " +
  "rune string uint uint8 uint16 uint32 uint64 uintptr true false iota nil append cap clear close complex copy delete imag " +
  "len make max min new panic print println real recover fmt math strings sort slices bufio os strconv unicode reader " +
  "readLine abs reverseString main";

const RESERVED = {
  c: words(C_WORDS),
  cpp: words(C_WORDS, CPP_WORDS),
  java: words(JAVA_WORDS),
  csharp: words(CSHARP_WORDS),
  python: words(PYTHON_WORDS),
  javascript: words(JS_WORDS),
  typescript: words(JS_WORDS),
  go: words(GO_WORDS),
};

const NICE = {
  sum: "total",
  max: "maximum",
  min: "minimum",
  len: "length",
  str: "text",
  string: "text",
  list: "items",
  input: "value",
  type: "kind",
  pow: "power",
  abs: "absolute",
  next: "nextValue",
  range: "span",
  id: "ident",
  chr: "character",
  ord: "code",
  round: "rounded",
  sorted: "sortedValues",
  reversed: "reversedText",
  filter: "filtered",
  map: "mapping",
  format: "formatted",
  all: "everything",
  any: "anything",
  base: "baseNumber",
  char: "letter",
  args: "values",
};

const RENDER = {
  c: (name) => snake(name),
  python: (name) => snake(name),
  csharp: (name, isFn) => (isFn ? pascal(name) : name),
};

export function identifierNames(prog) {
  const names = new Map();
  const visit = (x, isFn = false) => {
    if (Array.isArray(x)) return x.forEach((item) => visit(item));
    if (!x || typeof x !== "object") return;
    if (typeof x.name === "string" && x.k !== "fn") names.set(x.name, isFn || x.k === "call" || names.get(x.name) === true);
    for (const value of Object.values(x)) visit(value);
  };
  prog.functions.forEach((f) => visit(f, true));
  visit(prog.main);
  return names;
}

function rewrite(x, map) {
  if (Array.isArray(x)) return x.map((item) => rewrite(item, map));
  if (!x || typeof x !== "object") return x;
  const out = {};
  for (const [key, value] of Object.entries(x)) out[key] = rewrite(value, map);
  if (typeof x.name === "string" && x.k !== "fn" && map.has(x.name)) out.name = map.get(x.name);
  if (typeof x.lengthOf === "string" && map.has(x.lengthOf)) out.lengthOf = map.get(x.lengthOf);
  return out;
}

// Renames identifiers that would collide with the target language's keywords,
// predeclared names, or names the emitter itself generates.
export function renameReserved(prog, langId) {
  const reserved = RESERVED[langId];
  if (!reserved) return prog;
  const render = RENDER[langId] || ((name) => name);
  const names = identifierNames(prog);
  const taken = new Set([...names].map(([name, isFn]) => render(name, isFn)));
  const map = new Map();
  for (const [name, isFn] of names) {
    if (!reserved.has(render(name, isFn))) continue;
    const base = NICE[name] || `${name}Value`;
    let candidate = base;
    for (let n = 2; reserved.has(render(candidate, isFn)) || taken.has(render(candidate, isFn)); n++) candidate = `${base}${n}`;
    taken.add(render(candidate, isFn));
    map.set(name, candidate);
  }
  return map.size ? rewrite(prog, map) : prog;
}
