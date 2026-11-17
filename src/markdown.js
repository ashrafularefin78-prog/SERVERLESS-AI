import { marked } from "marked";
import DOMPurify from "dompurify";
import { highlightToHtml } from "./coder/highlight.js";
import { languageByFence } from "./coder/languages.js";

const LANG_LABELS = {
  js: "JavaScript",
  jsx: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  typescript: "TypeScript",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  golang: "Go",
  c: "C",
  h: "C",
  cpp: "C++",
  "c++": "C++",
  cxx: "C++",
  cc: "C++",
  hpp: "C++",
  cs: "C#",
  csharp: "C#",
  "c#": "C#",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  swift: "Swift",
  php: "PHP",
  pl: "Perl",
  pm: "Perl",
  perl: "Perl",
  r: "R",
  jl: "Julia",
  julia: "Julia",
  m: "MATLAB",
  matlab: "MATLAB",
  scala: "Scala",
  hs: "Haskell",
  haskell: "Haskell",
  lisp: "Lisp",
  lsp: "Lisp",
  cl: "Lisp",
  scm: "Scheme",
  scheme: "Scheme",
  clj: "Clojure",
  cljs: "Clojure",
  clojure: "Clojure",
  fs: "F#",
  fsi: "F#",
  fsx: "F#",
  fsharp: "F#",
  erl: "Erlang",
  hrl: "Erlang",
  erlang: "Erlang",
  ex: "Elixir",
  exs: "Elixir",
  elixir: "Elixir",
  ml: "OCaml",
  mli: "OCaml",
  ocaml: "OCaml",
  sh: "Bash",
  bash: "Bash",
  zsh: "Bash",
  ps1: "PowerShell",
  psm1: "PowerShell",
  pwsh: "PowerShell",
  lua: "Lua",
  tcl: "Tcl",
  tk: "Tcl",
  sql: "SQL",
  plsql: "PL/SQL",
  tsql: "T-SQL",
  html: "HTML",
  htm: "HTML",
  xml: "XML",
  xsd: "XML",
  xsl: "XML",
  xslt: "XML",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  md: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  json: "JSON",
  jsonc: "JSON",
  asm: "Assembly",
  nasm: "Assembly",
  gas: "Assembly",
  s: "Assembly",
  vb: "VB.NET",
  vbnet: "VB.NET",
  "vb.net": "VB.NET",
  f90: "Fortran",
  f95: "Fortran",
  f03: "Fortran",
  f08: "Fortran",
  fortran: "Fortran",
  cob: "COBOL",
  cbl: "COBOL",
  cobol: "COBOL",
  adb: "Ada",
  ads: "Ada",
  ada: "Ada",
  pas: "Pascal",
  pp: "Pascal",
  pascal: "Pascal",
  dpr: "Delphi",
  dpk: "Delphi",
  delphi: "Delphi",
  zig: "Zig",
  d: "D",
  nim: "Nim",
  vhd: "VHDL",
  vhdl: "VHDL",
  v: "Verilog",
  sv: "SystemVerilog",
  svh: "SystemVerilog",
  verilog: "Verilog",
  systemverilog: "SystemVerilog",
  sol: "Solidity",
  solidity: "Solidity",
  cls: "Apex",
  trigger: "Apex",
  apex: "Apex",
  abap: "ABAP",
  cr: "Crystal",
  crystal: "Crystal",
  groovy: "Groovy",
  gradle: "Groovy",
  hh: "Hack",
  hack: "Hack",
  mc: "Monkey C",
  monkeyc: "Monkey C",
  "monkey-c": "Monkey C",
  bas: "BASIC",
  basic: "BASIC",
  logo: "Logo",
  st: "Smalltalk",
  smalltalk: "Smalltalk",
  prolog: "Prolog",
  pl: "Prolog",
  vhd: "VHDL",
  vi: "LabVIEW",
  labview: "LabVIEW",
  scratch: "Scratch",
  sb3: "Scratch",
};

function fenceLabel(fence) {
  const raw = String(fence || "").trim().toLowerCase();
  if (!raw) return "code";
  if (LANG_LABELS[raw]) return LANG_LABELS[raw];
  const language = languageByFence(raw);
  return language ? language.name : raw;
}

function fenceLanguageId(fence) {
  const raw = String(fence || "").trim().toLowerCase();
  const language = languageByFence(raw);
  if (language) return language.id;
  if (["js", "jsx"].includes(raw)) return "javascript";
  if (["ts", "tsx"].includes(raw)) return "typescript";
  if (raw === "golang") return "go";
  if (["c++", "cxx", "cc", "hpp"].includes(raw)) return "cpp";
  if (["cs", "c#"].includes(raw)) return "csharp";
  if (["py"].includes(raw)) return "python";
  if (["rb"].includes(raw)) return "ruby";
  if (["rs"].includes(raw)) return "rust";
  if (["kt", "kts"].includes(raw)) return "kotlin";
  if (["ps1", "psm1", "pwsh"].includes(raw)) return "powershell";
  if (["sh", "zsh", "shell"].includes(raw)) return "bash";
  if (["htm"].includes(raw)) return "html";
  if (["yml"].includes(raw)) return "yaml";
  if (["md"].includes(raw)) return "markdown";
  if (["asm", "nasm", "gas"].includes(raw)) return "assembly";
  return null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SANITIZE_OPTIONS = {
  FORBID_TAGS: [
    "img",
    "iframe",
    "frame",
    "object",
    "embed",
    "video",
    "audio",
    "source",
    "track",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "style",
    "link",
    "meta",
    "svg",
    "math",
    "template",
    "script",
  ],
  FORBID_ATTR: ["style", "srcset", "formaction"],
  ALLOW_DATA_ATTR: false,
};

const SAFE_LINK = /^(https?:|mailto:)/i;

marked.setOptions({
  gfm: true,
  breaks: true,
  async: false,
});

export function renderMarkdown(text) {
  const source = typeof text === "string" ? text : "";
  let raw = "";
  try {
    raw = marked.parse(source, { gfm: true, breaks: true, async: false });
  } catch {
    raw = `<p>${escapeHtml(source)}</p>`;
  }

  const clean = DOMPurify.sanitize(raw, SANITIZE_OPTIONS);
  const root = document.createElement("div");
  root.innerHTML = clean;

  for (const link of root.querySelectorAll("a")) {
    const href = link.getAttribute("href") || "";
    if (!SAFE_LINK.test(href)) {
      link.replaceWith(document.createTextNode(link.textContent || ""));
      continue;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  for (const table of root.querySelectorAll("table")) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }

  for (const pre of Array.from(root.querySelectorAll("pre"))) {
    const code = pre.querySelector("code");
    if (!code) continue;

    const fence = detectLanguage(code);
    const languageId = fenceLanguageId(fence);
    const display = fenceLabel(fence);
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const head = document.createElement("div");
    head.className = "code-head";

    const label = document.createElement("span");
    label.textContent = display;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    button.dataset.copyCode = "true";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-copy"></use></svg><span>Copy</span>';

    if (languageId) {
      const highlighted = highlightToHtml(code.textContent || "", languageId);
      if (highlighted) {
        code.innerHTML = DOMPurify.sanitize(highlighted, {
          ALLOWED_TAGS: ["span"],
          ALLOWED_ATTR: ["class"],
        });
        code.classList.add("hljs");
        wrapper.dataset.language = languageId;
      }
    }

    head.append(label, button);
    pre.replaceWith(wrapper);
    wrapper.append(head, pre);
  }

  return root.innerHTML;
}

function detectLanguage(code) {
  const className = code.getAttribute("class") || "";
  const match = className.match(/language-([\w+#-]+)/);
  return match ? match[1] : "";
}
