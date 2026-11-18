import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import ada from "highlight.js/lib/languages/ada";
import bash from "highlight.js/lib/languages/bash";
import basic from "highlight.js/lib/languages/basic";
import c from "highlight.js/lib/languages/c";
import clojure from "highlight.js/lib/languages/clojure";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import crystal from "highlight.js/lib/languages/crystal";
import d from "highlight.js/lib/languages/d";
import dart from "highlight.js/lib/languages/dart";
import delphi from "highlight.js/lib/languages/delphi";
import elixir from "highlight.js/lib/languages/elixir";
import erlang from "highlight.js/lib/languages/erlang";
import fortran from "highlight.js/lib/languages/fortran";
import fsharp from "highlight.js/lib/languages/fsharp";
import go from "highlight.js/lib/languages/go";
import groovy from "highlight.js/lib/languages/groovy";
import haskell from "highlight.js/lib/languages/haskell";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import julia from "highlight.js/lib/languages/julia";
import kotlin from "highlight.js/lib/languages/kotlin";
import lisp from "highlight.js/lib/languages/lisp";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import matlab from "highlight.js/lib/languages/matlab";
import nim from "highlight.js/lib/languages/nim";
import objectivec from "highlight.js/lib/languages/objectivec";
import ocaml from "highlight.js/lib/languages/ocaml";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import prolog from "highlight.js/lib/languages/prolog";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scala from "highlight.js/lib/languages/scala";
import scheme from "highlight.js/lib/languages/scheme";
import smalltalk from "highlight.js/lib/languages/smalltalk";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import tcl from "highlight.js/lib/languages/tcl";
import typescript from "highlight.js/lib/languages/typescript";
import vbnet from "highlight.js/lib/languages/vbnet";
import verilog from "highlight.js/lib/languages/verilog";
import vhdl from "highlight.js/lib/languages/vhdl";
import x86asm from "highlight.js/lib/languages/x86asm";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { abap, cobol, logo, solidity, zig } from "./grammars.js";

const GRAMMARS: Record<string, LanguageFn> = {
  abap,
  ada,
  apex: java,
  assembly: x86asm,
  bash,
  basic,
  c,
  clojure,
  cobol,
  cpp,
  csharp,
  css,
  crystal,
  d,
  dart,
  delphi,
  elixir,
  erlang,
  fortran,
  fsharp,
  go,
  groovy,
  hack: php,
  haskell,
  html: xml,
  java,
  javascript,
  json,
  julia,
  kotlin,
  lisp,
  logo,
  lua,
  markdown,
  matlab,
  monkeyc: javascript,
  nim,
  objectivec,
  ocaml,
  pascal: delphi,
  perl,
  php,
  plsql: sql,
  powershell,
  prolog,
  python,
  r,
  ruby,
  rust,
  scala,
  scheme,
  smalltalk,
  solidity,
  sql,
  swift,
  tcl,
  tsql: sql,
  typescript,
  vbnet,
  verilog,
  vhdl,
  xml,
  yaml,
  zig,
};

for (const [name, definition] of Object.entries(GRAMMARS)) {
  hljs.registerLanguage(name, definition);
}

export function highlightToHtml(code: string, languageId: string | null | undefined) {
  if (!languageId || !hljs.getLanguage(languageId)) return null;
  try {
    return hljs.highlight(code, { language: languageId, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}
