// Programming language support for Coder mode. Each entry drives prompt
// guidance, fence labels, auto-detection, and highlighting.
// `tier: "specialized"` marks languages where small models need a warning.

import { expandShorthand, normalizeText } from "../understand.js";
import {
  buildBasicProgram,
  formatBasicProgram,
  SUPPORTED_PROGRAM_LANGUAGE_NAMES,
} from "./programs.js";

export const LANGUAGES = [
  {
    id: "c",
    name: "C",
    group: "general",
    fence: "c",
    fences: ["c"],
    extensions: [".c", ".h"],
    version: "C17",
    toolchain: "gcc or clang",
    contextOnly: true,
    signals: [/#include\s*<(?:stdio|stdlib|string|stdint|stdbool|math|time|ctype|errno|assert|unistd)\.h>|\b(?:printf|scanf|malloc|free)\s*\(|\b(?:gcc|clang)\b|\bsegmentation\s+fault\b/i],
    guidance:
      "Use C17, include every header you use, check return values, free allocated memory, and avoid undefined behavior. Use fixed-width types from <stdint.h> when sizes matter.",
  },
  {
    id: "cpp",
    name: "C++",
    group: "general",
    fence: "cpp",
    fences: ["cpp", "c++", "cxx", "cc"],
    extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hh"],
    match: ["g++", "clang++", "arduino"],
    version: "C++17 or later",
    toolchain: "a C++17 compiler such as g++ or clang++",
    guidance:
      "Use modern C++ with RAII, std::string, std::vector, smart pointers, and const correctness. Avoid raw new/delete and C-style casts. Compile with warnings enabled.",
  },
  {
    id: "csharp",
    name: "C#",
    group: "general",
    fence: "csharp",
    fences: ["csharp", "cs", "c#"],
    extensions: [".cs", ".csx"],
    match: ["dotnet"],
    version: ".NET 8 or later",
    toolchain: "the dotnet CLI",
    guidance:
      "Use modern C# with nullable reference types, async/await, LINQ, and using declarations. Prefer records and pattern matching where they clarify the code. State the target framework.",
  },
  {
    id: "java",
    name: "Java",
    group: "general",
    fence: "java",
    fences: ["java"],
    extensions: [".java"],
    match: ["javac", "jdk", "jvm", "maven"],
    version: "Java 17 or later",
    toolchain: "javac plus Maven or Gradle",
    guidance:
      "Use Java 17 features, explicit types, try-with-resources, and the collections API. Avoid raw types and unchecked casts. Show package and import lines when they matter.",
  },
  {
    id: "python",
    name: "Python",
    group: "general",
    fence: "python",
    fences: ["python", "py"],
    extensions: [".py", ".pyw"],
    version: "Python 3.10 or later",
    toolchain: "Python 3 with pip and a virtual environment",
    contextOnly: true,
    signals: [/\basyncio\b|\b(?:pip|conda)\s+install\b|\bvirtualenv\b|\bvenv\b/i],
    guidance:
      "Use modern Python 3 with f-strings, pathlib, context managers, and explicit exceptions. Add type hints when they help. Do not use Python 2 syntax or bare except clauses.",
  },
  {
    id: "go",
    name: "Go",
    group: "general",
    fence: "go",
    fences: ["go", "golang"],
    extensions: [".go"],
    version: "Go 1.21 or later",
    toolchain: "the Go toolchain and gofmt",
    contextOnly: true,
    signals: [/\bgoroutines?\b|\bgo\s+(?:func|mod|run|build|vet)\b|\bgofmt\b/i],
    guidance:
      "Use idiomatic Go with explicit error returns, small interfaces, context for cancellation, and the standard library first. Run gofmt. Never panic for ordinary errors.",
  },
  {
    id: "rust",
    name: "Rust",
    group: "general",
    fence: "rust",
    fences: ["rust", "rs"],
    extensions: [".rs"],
    version: "Rust 2021 edition",
    toolchain: "Cargo and rustc",
    contextOnly: true,
    signals: [/\bcargo\b|\brustc\b|\bborrow\s+checker\b|\bclippy\b/i],
    guidance:
      "Use idiomatic Rust with ownership, borrowing, Result and Option. Avoid unwrap and expect outside tests. Prefer iterators and pattern matching. State crate versions when APIs matter.",
  },
  {
    id: "swift",
    name: "Swift",
    group: "general",
    fence: "swift",
    fences: ["swift"],
    extensions: [".swift"],
    version: "Swift 5.9 or later",
    toolchain: "Xcode or the Swift Package Manager",
    contextOnly: true,
    signals: [/\bswiftui\b|\bxcode\b/i],
    guidance:
      "Use value types, optionals, guard, async/await, and Codable where appropriate. Prefer safe optional handling over force unwraps. Note whether the code targets iOS, macOS, or server Swift.",
  },
  {
    id: "kotlin",
    name: "Kotlin",
    group: "general",
    fence: "kotlin",
    fences: ["kotlin", "kt", "kts"],
    extensions: [".kt", ".kts"],
    version: "Kotlin 2.0 or later",
    toolchain: "Gradle with the Kotlin plugin",
    guidance:
      "Use Kotlin null-safety, data classes, sealed types, extension functions, and coroutines. Prefer val and immutable collections. Note whether the target is Android, JVM, or multiplatform.",
  },
  {
    id: "dart",
    name: "Dart",
    group: "general",
    fence: "dart",
    fences: ["dart"],
    extensions: [".dart"],
    version: "Dart 3",
    toolchain: "the Dart SDK or Flutter",
    contextOnly: true,
    signals: [/\bflutter\b|\bpubspec\b|\bdart\s+analyze\b/i],
    guidance:
      "Use Dart 3 sound null safety, final locals, records and patterns where useful, and async/Future/Stream correctly. Say whether the code targets Flutter or the Dart VM.",
  },
  {
    id: "php",
    name: "PHP",
    group: "general",
    fence: "php",
    fences: ["php"],
    extensions: [".php"],
    match: ["laravel", "symfony", "wordpress"],
    version: "PHP 8.2 or later",
    toolchain: "PHP 8 with Composer",
    guidance:
      "Use strict_types, typed properties, named arguments, and PDO prepared statements. Escape output and never build SQL by string concatenation. Avoid the deprecated mysql_* functions.",
  },
  {
    id: "ruby",
    name: "Ruby",
    group: "general",
    fence: "ruby",
    fences: ["ruby", "rb"],
    extensions: [".rb", ".rake", ".gemspec"],
    version: "Ruby 3.2 or later",
    toolchain: "Ruby with bundler",
    contextOnly: true,
    signals: [/\brails\b|\brspec\b|\bgemfile\b|\bbundler\b/i],
    guidance:
      "Use idiomatic Ruby with blocks, symbols, rescue with specific exception classes, and frozen string literals where appropriate. Avoid monkey patching unless the user asks for it.",
  },
  {
    id: "perl",
    name: "Perl",
    group: "general",
    fence: "perl",
    fences: ["perl", "pl"],
    extensions: [".pl", ".pm"],
    version: "Perl 5.36 or later",
    toolchain: "Perl with cpanm",
    guidance:
      "Use strict and warnings, lexical my variables, and list versus scalar context deliberately. Prefer modern Perl idioms and CPAN modules over fragile hand-rolled parsing.",
  },
  {
    id: "objectivec",
    name: "Objective-C",
    group: "general",
    fence: "objectivec",
    fences: ["objectivec", "objective-c", "objc", "obj-c"],
    extensions: [".mm"],
    version: "modern Objective-C with ARC",
    toolchain: "Xcode and clang",
    match: ["objc", "obj-c", "objective-c"],
    guidance:
      "Use ARC, Foundation classes, properties, blocks, and nullability annotations. Prefer modern subscripting and literals. Note whether the target is iOS or macOS.",
  },
  {
    id: "vbnet",
    name: "VB.NET",
    group: "general",
    fence: "vbnet",
    fences: ["vbnet", "vb", "vb.net"],
    extensions: [".vb"],
    version: ".NET 8 or later",
    toolchain: "the dotnet CLI with Option Strict On",
    guidance:
      "Use VB.NET with Option Strict On, explicit types, async/await, and Using blocks. Avoid late binding and On Error Resume Next. State the target framework.",
  },
  {
    id: "fortran",
    name: "Fortran",
    group: "general",
    fence: "fortran",
    fences: ["fortran", "f90", "f95", "f03", "f08"],
    extensions: [".f90", ".f95", ".f03", ".f08"],
    version: "Fortran 2018",
    toolchain: "gfortran",
    tier: "specialized",
    guidance:
      "Use free-form Fortran 2018 with implicit none, modules, explicit intent, and kind constants for precision. Prefer array operations over manual loops when they are clearer.",
  },
  {
    id: "cobol",
    name: "COBOL",
    group: "general",
    fence: "cobol",
    fences: ["cobol", "cob"],
    extensions: [".cob", ".cbl", ".cpy"],
    version: "COBOL 85 or later",
    toolchain: "GnuCOBOL or the stated IBM compiler",
    tier: "specialized",
    guidance:
      "Use the divisions correctly, define PIC clauses precisely, initialize WORKING-STORAGE, and handle files explicitly. State whether fixed or free format is expected. Ask for the compiler dialect when behavior differs.",
  },
  {
    id: "ada",
    name: "Ada",
    group: "general",
    fence: "ada",
    fences: ["ada"],
    extensions: [".adb", ".ads"],
    version: "Ada 2012",
    toolchain: "GNAT",
    tier: "specialized",
    contextOnly: true,
    signals: [/Ada\.Text_IO|\bPut_Line\s*\(|\bGNAT\b/],
    guidance:
      "Use packages, strong typing, explicit ranges, pre/postconditions, and exception handling. Prefer readable names and avoid unchecked conversions unless required.",
  },
  {
    id: "pascal",
    name: "Pascal",
    group: "general",
    fence: "pascal",
    fences: ["pascal", "pas", "pp"],
    extensions: [".pas", ".pp"],
    version: "Free Pascal or Delphi dialect",
    toolchain: "Free Pascal or the stated compiler",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bFree\s+Pascal\b|\bTurbo\s+Pascal\b/i],
    guidance:
      "Use structured Pascal with units, clear type declarations, begin/end blocks, and explicit exception handling. State whether the code targets Free Pascal or Delphi because the dialects differ.",
  },
  {
    id: "delphi",
    name: "Delphi",
    group: "general",
    fence: "delphi",
    fences: ["delphi", "objectpascal"],
    extensions: [".dpr", ".dpk"],
    version: "Delphi 11 or later",
    toolchain: "RAD Studio",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bVCL\b|\bFireMonkey\b|\bRAD\s+Studio\b|\bShowMessage\s*\(/i],
    guidance:
      "Use Object Pascal with units, classes, try/finally, and explicit ownership. State whether the target is VCL or FireMonkey. Avoid deprecated string and memory APIs.",
  },
  {
    id: "zig",
    name: "Zig",
    group: "systems",
    fence: "zig",
    fences: ["zig"],
    extensions: [".zig"],
    version: "Zig 0.13 or later",
    toolchain: "the Zig compiler and build.zig",
    tier: "specialized",
    guidance:
      "Use explicit allocators, error unions, defer and errdefer, and comptime where it helps. Avoid hidden allocations. Syntax changes between Zig releases, so state the version assumed.",
  },
  {
    id: "d",
    name: "D",
    group: "systems",
    fence: "d",
    fences: ["d", "dlang"],
    extensions: [".d"],
    version: "D2",
    toolchain: "dmd, ldc2, or gdc with dub",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bdlang\b|\bdmd\b|\bldc2\b|\bdub\.json\b|@nogc\b/i],
    guidance:
      "Use D2 with ranges, const correctness, and explicit @safe annotations where possible. State whether the GC is acceptable or @nogc code is required.",
  },
  {
    id: "nim",
    name: "Nim",
    group: "systems",
    fence: "nim",
    fences: ["nim"],
    extensions: [".nim"],
    version: "Nim 2",
    toolchain: "nimble",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bnimble\b|\bproc\s+\w+\s*\(/i],
    guidance:
      "Use Nim 2 with option and result types, clear proc signatures, and significant indentation kept consistent. Prefer ARC or ORC memory management as appropriate. Avoid legacy Nim 1 idioms.",
  },
  {
    id: "assembly",
    name: "Assembly",
    group: "systems",
    fence: "asm",
    fences: ["asm", "assembly", "nasm", "gas"],
    extensions: [".asm", ".nasm"],
    version: "x86-64 or ARM64",
    toolchain: "NASM, GAS, or the stated assembler",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bNASM\b|\bMASM\b|\bYASM\b|\bx86[- ]?64\b|\bARM64\b|\binstruction\s+set\b/i],
    guidance:
      "State the CPU architecture, assembler syntax, and calling convention. Comment register usage and preserve callee-saved registers. Do not mix Intel and AT&T syntax without saying which is used.",
  },
  {
    id: "r",
    name: "R",
    group: "data",
    fence: "r",
    fences: ["r"],
    extensions: [".r"],
    version: "R 4.3 or later",
    toolchain: "R with CRAN packages",
    contextOnly: true,
    signals: [/\bggplot2?\b|\bdplyr\b|\btibble\b|\bcran\b/i],
    guidance:
      "Use vectorized R, data frames, explicit NA handling, and named function arguments. Prefer base R or clearly named packages such as dplyr. Avoid growing vectors inside loops.",
  },
  {
    id: "julia",
    name: "Julia",
    group: "data",
    fence: "julia",
    fences: ["julia", "jl"],
    extensions: [".jl"],
    version: "Julia 1.10 or later",
    toolchain: "Julia with Pkg and a Project.toml",
    contextOnly: true,
    signals: [/\bJulia\s+(?:REPL|1\.)|Pkg\.\w+|\bmultiple\s+dispatch\b/i],
    guidance:
      "Use multiple dispatch, type-stable functions, and 1-based indexing. Put performance-critical code in functions, not global scope. State package dependencies when used.",
  },
  {
    id: "matlab",
    name: "MATLAB",
    group: "data",
    fence: "matlab",
    fences: ["matlab", "octave"],
    version: "MATLAB R2023b or later",
    toolchain: "MATLAB or GNU Octave",
    guidance:
      "Use matrix operations, vectorization, and scriptable functions with clear inputs and outputs. State required toolboxes. Note any differences for GNU Octave.",
  },
  {
    id: "scala",
    name: "Scala",
    group: "data",
    fence: "scala",
    fences: ["scala"],
    extensions: [".scala", ".sc"],
    version: "Scala 3",
    toolchain: "sbt or scala-cli",
    guidance:
      "Use Scala 3 with immutable vals, case classes, pattern matching, Option and Either. Avoid Java-style mutable loops when a collection transformation is clearer.",
  },
  {
    id: "javascript",
    name: "JavaScript",
    group: "web",
    fence: "javascript",
    fences: ["javascript", "js", "mjs", "cjs", "jsx"],
    extensions: [".js", ".mjs", ".cjs", ".jsx"],
    version: "ES2022 or later",
    toolchain: "Node.js or a modern browser",
    match: ["ecmascript", "node.js", "nodejs"],
    guidance:
      "Use ES modules, const and let, strict equality, optional chaining, and async/await. Handle rejected promises. Say whether the code runs in a browser or Node.js.",
  },
  {
    id: "typescript",
    name: "TypeScript",
    group: "web",
    fence: "typescript",
    fences: ["typescript", "ts", "tsx", "mts", "cts"],
    extensions: [".ts", ".tsx", ".mts", ".cts"],
    match: ["tsc"],
    version: "TypeScript 5 with strict mode",
    toolchain: "tsc or a bundler",
    guidance:
      "Use strict TypeScript with precise types, discriminated unions, and narrowing. Avoid any and non-null assertions. Show the important type declarations, not only implementation code.",
  },
  {
    id: "html",
    name: "HTML",
    group: "web",
    fence: "html",
    fences: ["html", "html5", "htm", "xhtml"],
    extensions: [".html", ".htm"],
    version: "HTML5",
    kind: "markup",
    guidance:
      "Use semantic HTML5 elements, valid nesting, accessible labels, and alt text. Keep scripts and styles out of inline attributes. Do not claim HTML is a programming language.",
  },
  {
    id: "xml",
    name: "XML",
    group: "web",
    fence: "xml",
    fences: ["xml", "xsd", "xsl", "xslt"],
    extensions: [".xml", ".xsd", ".xsl", ".xslt"],
    version: "XML 1.0",
    kind: "markup",
    guidance:
      "Produce well-formed XML with one root element, correct escaping, and explicit namespaces. Do not assume a DTD or schema unless the user provides one.",
  },
  {
    id: "css",
    name: "CSS",
    group: "web",
    fence: "css",
    fences: ["css", "scss", "sass"],
    extensions: [".css"],
    version: "modern CSS",
    kind: "stylesheet",
    guidance:
      "Use modern CSS with flexbox or grid, custom properties, and clamp for responsive sizing. Keep contrast accessible. Avoid deprecated hacks and unnecessary !important.",
  },
  {
    id: "markdown",
    name: "Markdown",
    group: "web",
    fence: "markdown",
    fences: ["markdown", "md"],
    extensions: [".md", ".markdown"],
    version: "CommonMark or GitHub-flavored Markdown",
    kind: "markup",
    guidance:
      "Use CommonMark or GFM consistently, with fenced code blocks, real headings, and simple tables. Do not embed raw HTML unless the user explicitly asks for it.",
  },
  {
    id: "yaml",
    name: "YAML",
    group: "web",
    fence: "yaml",
    fences: ["yaml", "yml"],
    extensions: [".yaml", ".yml"],
    version: "YAML 1.2",
    kind: "data",
    guidance:
      "Use consistent two-space indentation, quote ambiguous scalars, and avoid tabs. Remember that YAML is data, not a programming language, and keep anchors readable.",
  },
  {
    id: "json",
    name: "JSON",
    group: "web",
    fence: "json",
    fences: ["json", "jsonc"],
    extensions: [".json"],
    version: "RFC 8259",
    kind: "data",
    guidance:
      "Produce strict JSON with double-quoted keys, no comments, and no trailing commas. State when a tool accepts JSON5 or JSONC instead of strict JSON.",
  },
  {
    id: "haskell",
    name: "Haskell",
    group: "functional",
    fence: "haskell",
    fences: ["haskell", "hs"],
    extensions: [".hs", ".lhs"],
    version: "GHC 9.4 or later",
    toolchain: "cabal or stack",
    tier: "specialized",
    guidance:
      "Use pure functions, algebraic data types, pattern matching, and typeclasses. Keep monadic code explicit. State language extensions and package dependencies when used.",
  },
  {
    id: "lisp",
    name: "Lisp",
    group: "functional",
    fence: "lisp",
    fences: ["lisp", "commonlisp", "cl"],
    extensions: [".lisp", ".lsp", ".cl"],
    version: "Common Lisp",
    toolchain: "SBCL or another Common Lisp implementation",
    tier: "specialized",
    guidance:
      "Use Common Lisp with defun, let, cons lists, and clear macro hygiene. Keep parentheses balanced and avoid implementation-specific behavior unless the user names the implementation.",
  },
  {
    id: "scheme",
    name: "Scheme",
    group: "functional",
    fence: "scheme",
    fences: ["scheme", "scm", "r7rs"],
    extensions: [".scm", ".ss"],
    version: "R7RS",
    toolchain: "Guile, Racket, or another R7RS implementation",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bR7RS\b|\bGuile\b|\bRacket\b|\bproper\s+tail\s+calls?\b/i],
    guidance:
      "Use R7RS Scheme with define, lambda, recursion, and proper tail calls. Avoid implementation-specific libraries unless the user names the implementation.",
  },
  {
    id: "clojure",
    name: "Clojure",
    group: "functional",
    fence: "clojure",
    fences: ["clojure", "clj", "cljs", "edn"],
    extensions: [".clj", ".cljs", ".cljc", ".edn"],
    version: "Clojure 1.11 or later",
    toolchain: "Leiningen or the Clojure CLI",
    guidance:
      "Use immutable data, sequence functions, destructuring, and pure functions. Keep side effects at the edges. Say whether the target is JVM Clojure or ClojureScript.",
  },
  {
    id: "fsharp",
    name: "F#",
    group: "functional",
    fence: "fsharp",
    fences: ["fsharp", "f#", "fs"],
    extensions: [".fs", ".fsx", ".fsi"],
    version: "F# 8 on .NET 8",
    toolchain: "the dotnet CLI",
    guidance:
      "Use functional-first F# with records, discriminated unions, pattern matching, and Option or Result. Keep mutation local and explicit. Use async or task workflows consistently.",
  },
  {
    id: "erlang",
    name: "Erlang",
    group: "functional",
    fence: "erlang",
    fences: ["erlang", "erl"],
    extensions: [".erl", ".hrl"],
    version: "OTP 26 or later",
    toolchain: "rebar3",
    guidance:
      "Use processes, pattern matching, and supervision trees. Let processes crash and restart instead of hiding errors. Use the OTP behaviours rather than hand-rolled servers.",
  },
  {
    id: "elixir",
    name: "Elixir",
    group: "functional",
    fence: "elixir",
    fences: ["elixir", "ex", "exs"],
    extensions: [".ex", ".exs"],
    version: "Elixir 1.16 or later",
    toolchain: "mix with OTP 26 or later",
    guidance:
      "Use pattern matching, pipes, immutable data, and OTP behaviours. Keep side effects explicit. Prefer GenServer and supervisors over ad-hoc processes.",
  },
  {
    id: "ocaml",
    name: "OCaml",
    group: "functional",
    fence: "ocaml",
    fences: ["ocaml", "ml"],
    extensions: [".ml", ".mli"],
    version: "OCaml 5",
    toolchain: "dune and opam",
    tier: "specialized",
    guidance:
      "Use modules, variants, pattern matching, and option or result types. Keep functions pure where practical. State required libraries and dune configuration assumptions.",
  },
  {
    id: "bash",
    name: "Bash",
    group: "scripting",
    fence: "bash",
    fences: ["bash", "sh", "shell", "zsh"],
    extensions: [".sh", ".bash", ".zsh"],
    version: "Bash 5",
    toolchain: "Bash 5 on Linux or macOS",
    match: ["shell script", "posix shell"],
    guidance:
      "Use Bash 5 with quoted variables, set -euo pipefail, [[ ]] tests, and arrays. Prefer POSIX sh only when the user asks for portability. Avoid parsing ls output.",
  },
  {
    id: "powershell",
    name: "PowerShell",
    group: "scripting",
    fence: "powershell",
    fences: ["powershell", "ps1", "pwsh"],
    extensions: [".ps1", ".psm1", ".psd1"],
    version: "PowerShell 7",
    toolchain: "PowerShell 7",
    match: ["pwsh"],
    guidance:
      "Use PowerShell 7 with approved verbs, object pipelines, explicit error handling, and full cmdlet names in scripts. Avoid aliases and Write-Host for data output.",
  },
  {
    id: "lua",
    name: "Lua",
    group: "scripting",
    fence: "lua",
    fences: ["lua"],
    extensions: [".lua"],
    version: "Lua 5.4",
    toolchain: "Lua 5.4 or LuaJIT as stated",
    guidance:
      "Use local variables, tables, clear module boundaries, and pcall for recoverable errors. State whether the target is Lua 5.4 or LuaJIT because semantics differ.",
  },
  {
    id: "tcl",
    name: "Tcl",
    group: "scripting",
    fence: "tcl",
    fences: ["tcl", "tk"],
    extensions: [".tcl"],
    version: "Tcl 8.6",
    toolchain: "Tcl 8.6 or later",
    tier: "specialized",
    guidance:
      "Remember that everything is a string, brace scripts to delay substitution, and use expr for arithmetic. Avoid unbraced expressions and eval when a safer form exists.",
  },
  {
    id: "sql",
    name: "SQL",
    group: "database",
    fence: "sql",
    fences: ["sql", "ansi-sql"],
    extensions: [".sql"],
    version: "ANSI SQL",
    toolchain: "the stated database engine",
    patterns: ["(?<!PL/)(?<!T-)\\b(?:SQL|MySQL|PostgreSQL|Postgres|MariaDB|SQLite)(?!\\w)"],
    guidance:
      "Use standard SQL with explicit JOIN conditions, parameter placeholders, and careful NULL handling. Name the target engine when syntax differs. Never concatenate untrusted values into SQL.",
  },
  {
    id: "plsql",
    name: "PL/SQL",
    group: "database",
    fence: "plsql",
    fences: ["plsql", "pl/sql", "oracle"],
    version: "Oracle 19c or later",
    toolchain: "Oracle Database",
    guidance:
      "Use PL/SQL blocks with explicit cursors, exception sections, and %TYPE or %ROWTYPE. Prefer bulk operations for large sets. State the Oracle version when features differ.",
  },
  {
    id: "tsql",
    name: "T-SQL",
    group: "database",
    fence: "tsql",
    fences: ["tsql", "t-sql", "mssql"],
    match: ["sql server"],
    version: "SQL Server 2022",
    toolchain: "Microsoft SQL Server",
    guidance:
      "Use T-SQL with TRY/CATCH, explicit transactions, and set-based logic. Avoid SELECT * in production code and be careful with MERGE and implicit conversions. State the SQL Server version.",
  },
  {
    id: "scratch",
    name: "Scratch",
    group: "education",
    fence: "scratch",
    fences: ["scratch", "sb3"],
    extensions: [".sb3"],
    version: "Scratch 3",
    kind: "visual",
    contextOnly: true,
    tier: "specialized",
    signals: [/\bgreen\s+flag\b|\bscratch\s+blocks?\b|\bsprite\s+costumes?\b/i],
    guidance:
      "Scratch is block-based. Describe scripts as ordered blocks with sprite, event, motion, looks, sound, control, sensing, operators, and variables. Do not produce text syntax that cannot be entered in Scratch.",
  },
  {
    id: "logo",
    name: "Logo",
    group: "education",
    fence: "logo",
    fences: ["logo"],
    extensions: [".logo"],
    version: "Logo turtle graphics",
    kind: "educational",
    contextOnly: true,
    tier: "specialized",
    signals: [/\bturtle\s+graphics\b|\b(?:penup|pendown)\b|\bfd\s+\d+|\brepeat\s+\d+\s*\[/i],
    guidance:
      "Use turtle graphics with forward, right, penup, pendown, repeat, and procedures. Keep commands compatible with common Logo dialects and state the dialect when it matters.",
  },
  {
    id: "basic",
    name: "BASIC",
    group: "education",
    fence: "basic",
    fences: ["basic", "qb64", "freebasic", "vba"],
    extensions: [".bas"],
    version: "QB64, FreeBASIC, or VBA",
    kind: "educational",
    contextOnly: true,
    tier: "specialized",
    signals: [/\bQB64\b|\bFreeBASIC\b|\bGW-BASIC\b|\bVBA\b|\bline[- ]numbered\s+BASIC\b/i],
    guidance:
      "State the BASIC dialect before writing code because syntax varies widely. Prefer structured IF, FOR, and SUB or FUNCTION blocks. Do not mix line-numbered BASIC with modern dialects.",
  },
  {
    id: "smalltalk",
    name: "Smalltalk",
    group: "education",
    fence: "smalltalk",
    fences: ["smalltalk", "st", "pharo", "squeak"],
    extensions: [".st"],
    version: "Pharo or Squeak",
    toolchain: "Pharo or Squeak",
    tier: "specialized",
    guidance:
      "Use Smalltalk message syntax, objects, blocks, and the image-based workflow. Show expressions with clear receiver and keyword messages. State whether the target is Pharo or Squeak.",
  },
  {
    id: "prolog",
    name: "Prolog",
    group: "other",
    fence: "prolog",
    fences: ["prolog", "swipl"],
    version: "ISO Prolog",
    toolchain: "SWI-Prolog",
    tier: "specialized",
    guidance:
      "Use facts and rules, unification, backtracking, and cuts only when needed. Keep predicates pure where possible. State any non-ISO library predicates.",
  },
  {
    id: "labview",
    name: "LabVIEW",
    group: "other",
    fence: "labview",
    fences: ["labview", "vi"],
    extensions: [".vi"],
    version: "LabVIEW 2023 or later",
    kind: "visual",
    tier: "specialized",
    guidance:
      "LabVIEW is graphical dataflow. Describe VI steps with controls, indicators, wires, structures, and error clusters. Do not output text code that cannot be built in LabVIEW.",
  },
  {
    id: "vhdl",
    name: "VHDL",
    group: "other",
    fence: "vhdl",
    fences: ["vhdl"],
    extensions: [".vhd", ".vhdl"],
    version: "VHDL-2008",
    toolchain: "a synthesis or simulation tool",
    tier: "specialized",
    guidance:
      "Use entities and architectures, std_logic, signals versus variables correctly, and complete sensitivity lists. State whether the code targets synthesis or simulation.",
  },
  {
    id: "verilog",
    name: "Verilog",
    group: "other",
    fence: "verilog",
    fences: ["verilog", "systemverilog", "sv"],
    extensions: [".v", ".sv", ".svh"],
    version: "Verilog-2001 or SystemVerilog",
    toolchain: "a synthesis or simulation tool",
    tier: "specialized",
    guidance:
      "Use nonblocking assignments in sequential logic and blocking assignments in combinational logic. Include reset behavior and a testbench when behavior matters. State whether SystemVerilog is allowed.",
  },
  {
    id: "solidity",
    name: "Solidity",
    group: "other",
    fence: "solidity",
    fences: ["solidity", "sol"],
    extensions: [".sol"],
    version: "Solidity 0.8.x",
    toolchain: "Hardhat or Foundry",
    tier: "specialized",
    guidance:
      "Use Solidity 0.8.x with explicit visibility, events, modifiers, and checks-effects-interactions. Guard against reentrancy and integer issues. State the EVM target and toolchain.",
  },
  {
    id: "apex",
    name: "Apex",
    group: "other",
    fence: "apex",
    fences: ["apex", "salesforce"],
    extensions: [".cls", ".trigger"],
    version: "Apex on Salesforce API 60 or later",
    kind: "platform",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bSalesforce\b|\bSOQL\b|\bAuraEnabled\b|\bgovernor\s+limits\b/i],
    guidance:
      "Apex runs on Salesforce with governor limits. Bulkify triggers, avoid SOQL or DML inside loops, use selective queries, and handle exceptions. State the Salesforce API version and whether the code is synchronous or asynchronous.",
  },
  {
    id: "abap",
    name: "ABAP",
    group: "other",
    fence: "abap",
    fences: ["abap"],
    extensions: [".abap"],
    match: ["sap"],
    version: "ABAP 7.5 or later",
    kind: "platform",
    tier: "specialized",
    guidance:
      "Use modern ABAP with internal tables, Open SQL, and class-based code. Avoid obsolete statements and SELECT in loops. State the SAP release and whether the code is on-premise or on BTP.",
  },
  {
    id: "crystal",
    name: "Crystal",
    group: "other",
    fence: "crystal",
    fences: ["crystal", "cr"],
    extensions: [".cr"],
    version: "Crystal 1.x",
    toolchain: "the Crystal compiler and shards",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bCrystal\s+compiler\b|\bshard\.ya?ml\b|\bnil\?/i],
    guidance:
      "Use Crystal with static types, nil checks, blocks, and fibers. Prefer explicit type annotations when inference is unclear. State shard dependencies when used.",
  },
  {
    id: "groovy",
    name: "Groovy",
    group: "other",
    fence: "groovy",
    fences: ["groovy", "gradle"],
    extensions: [".groovy", ".gradle"],
    version: "Groovy 4",
    toolchain: "Groovy 4 or Gradle",
    contextOnly: true,
    signals: [/\bGradle\b|\bSpock\b|\bJenkinsfile\b/i],
    guidance:
      "Use Groovy closures, GStrings carefully, and Java interoperability. Prefer clear types in public APIs. State whether the code targets Gradle or a Groovy runtime.",
  },
  {
    id: "hack",
    name: "Hack",
    group: "other",
    fence: "hack",
    fences: ["hack", "hacklang", "hh"],
    extensions: [".hh"],
    version: "Hack on HHVM",
    toolchain: "HHVM and Hack",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bHHVM\b|\bHacklang\b|<\?hh\b/i],
    guidance:
      "Use Hack type annotations, strict mode, collections, and async where useful. Acknowledge that Hack is a Facebook language with a smaller ecosystem and state HHVM assumptions.",
  },
  {
    id: "monkeyc",
    name: "Monkey C",
    group: "other",
    fence: "monkeyc",
    fences: ["monkeyc", "monkey-c", "connectiq"],
    extensions: [".mc"],
    version: "Connect IQ 4 or later",
    toolchain: "the Garmin Connect IQ SDK",
    tier: "specialized",
    contextOnly: true,
    signals: [/\bGarmin\b|\bConnect\s+IQ\b|\bToybox\b|\bMonkey\s+C\b/i],
    guidance:
      "Monkey C targets Garmin devices with tight memory limits. Use Toybox APIs, keep allocations small, and handle on-device constraints. State the device family and API level.",
  },
];

// Framework signatures add a second layer on top of language detection: they
// name the stack behind the code and supply one concrete review focus.
const FRAMEWORKS = [
  {
    id: "nextjs",
    name: "Next.js",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']next(?:[/"'])/,
      /\bfrom\s+["']next\/[\w/]+["']/,
      /\buse\s+(?:client|server)\b/,
      /\b(?:generateMetadata|generateStaticParams|revalidatePath|unstable_cache)\b/,
      /\bexport\s+(?:const\s+)?metadata\b/,
    ],
    mention: /\bNext\.?js\b/i,
    supersedes: ["react"],
    note: "Use the App Router split: keep data access in server components and mark only interactive components with \"use client\".",
  },
  {
    id: "react-native",
    name: "React Native",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']react-native["']/,
      /\bStyleSheet\.create\s*\(/,
      /<(?:View|Text|FlatList|ScrollView|TouchableOpacity|Pressable)\b/,
      /\buseColorScheme\s*\(/,
      /\bPlatform\.(?:OS|select)\b/,
    ],
    mention: /\bReact\s+Native\b/i,
    supersedes: ["react"],
    note: "Test both platforms, virtualize long lists with FlatList, and respect safe areas and platform navigation conventions.",
  },
  {
    id: "react",
    name: "React",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']react["']/,
      /\bReact\.(?:FC|Component|createElement|useState|useEffect)\b/,
      /\buse(?:State|Effect|Context|Reducer|Memo|Ref|Callback|LayoutEffect)\s*\(/,
      /\b(?:ReactDOM|createRoot)\b/,
      /\bclassName\s*=/,
    ],
    mention: /\bReact\s+(?:component|components|app|application|hook|hooks|code|project)\b/i,
    note: "Keep components pure, use stable keys, and list hook dependencies precisely instead of suppressing the linter.",
  },
  {
    id: "nuxt",
    name: "Nuxt",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']#app["']/,
      /\buse(?:Fetch|AsyncData|NuxtApp)\s*\(/,
      /\bdefineNuxtConfig\s*\(/,
      /\bNuxt(?:Link|Page)\b/,
    ],
    mention: /\bNuxt(?:\.js)?\b/i,
    supersedes: ["vue"],
    note: "Keep data fetching in composables, guard client-only APIs with import.meta.client, and check SSR hydration output.",
  },
  {
    id: "vue",
    name: "Vue",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']vue["']/,
      /<script\s+setup\b/,
      /\bdefineComponent\s*\(/,
      /\b(?:ref|computed|watchEffect|onMounted)\s*\(/,
      /\bv-(?:if|for|model|show)\b/,
    ],
    mention: /\bVue(?:\.js)?\b/i,
    note: "Prefer the Composition API with script setup, keep reactivity shallow where possible, and use keys inside v-for.",
  },
  {
    id: "angular",
    name: "Angular",
    language: "typescript",
    patterns: [
      /\bfrom\s+["']@angular\//,
      /@(?:Component|Injectable|NgModule|Input|Output)\s*\(/,
      /\*(?:ngIf|ngFor)\b/,
      /\[\(ngModel\)\]/,
      /\bstandalone\s*:\s*true\b/,
    ],
    mention: /\bAngular\b/i,
    note: "Use standalone components with OnPush where possible, keep RxJS subscriptions scoped, and avoid logic in templates.",
  },
  {
    id: "svelte",
    name: "Svelte",
    language: "javascript",
    patterns: [
      /\$:\s/,
      /\bon:(?:click|input|submit)=/,
      /<slot\b/,
      /\bexport\s+let\b/,
      /\{#(?:each|if|await)\b/,
      /\bfrom\s+["']svelte["']/,
      /\$(?:state|derived|effect)\s*\(/,
    ],
    mention: /\bSvelte(?:Kit)?\b/i,
    note: "Keep reactive statements small, use keyed each blocks, and check both SSR and client behavior when using SvelteKit.",
  },
  {
    id: "django",
    name: "Django",
    language: "python",
    patterns: [
      /\bfrom\s+django\b/,
      /\bimport\s+django\b/,
      /\bmodels\.Model\b/,
      /\burlpatterns\b/,
      /\b(?:HttpResponse|JsonResponse)\b/,
      /\{%\s*(?:extends|block)\b/,
    ],
    mention: /\bDjango\b/i,
    note: "Keep it ORM-first, use migrations for every model change, and watch N+1 queries with select_related or prefetch_related.",
  },
  {
    id: "flask",
    name: "Flask",
    language: "python",
    patterns: [
      /\bfrom\s+flask\b/,
      /\bFlask\s*\(\s*__name__\s*\)/,
      /@app\.(?:route|get|post|put|delete)\s*\(/,
      /\brender_template\s*\(/,
      /\brequest\.(?:args|json|form|headers)\b/,
    ],
    mention: /\bFlask\s+(?:app|application|api|project|route|server|code)\b/i,
    note: "Use application factories and blueprints as the app grows, validate request data, and keep debug mode off in production.",
  },
  {
    id: "fastapi",
    name: "FastAPI",
    language: "python",
    patterns: [
      /\bfrom\s+fastapi\b/,
      /\bAPIRouter\s*\(/,
      /\bDepends\s*\(/,
      /\bHTTPException\b/,
      /@app\.(?:get|post|put|delete|patch)\s*\(/,
    ],
    mention: /\bFastAPI\b/i,
    note: "Use Pydantic models at the boundary, keep dependencies small, and make blocking I/O explicit so it does not stall the event loop.",
  },
  {
    id: "pandas",
    name: "pandas",
    language: "python",
    patterns: [
      /\bimport\s+pandas\b/,
      /\bfrom\s+pandas\b/,
      /\bpd\.(?:DataFrame|Series|read_csv|read_json|concat|merge)\b/,
      /\.groupby\s*\(/,
    ],
    mention: /\b(?:using\s+pandas|pandas\s+(?:DataFrame|code|library|dataframe))\b/i,
    note: "Avoid iterrows in hot paths, keep dtypes stable, and check how missing values survive each transformation.",
  },
  {
    id: "numpy",
    name: "NumPy",
    language: "python",
    patterns: [
      /\bimport\s+numpy\b/,
      /\bfrom\s+numpy\b/,
      /\bnp\.(?:array|zeros|ones|arange|dot|mean|where)\b/,
      /\.astype\s*\(/,
    ],
    mention: /\bNumPy\b/i,
    note: "Vectorize instead of looping, watch dtype and shape changes, and avoid copies inside tight loops.",
  },
  {
    id: "pytorch",
    name: "PyTorch",
    language: "python",
    patterns: [
      /\bimport\s+torch\b/,
      /\btorch\.(?:nn|Tensor|cuda|device)\b/,
      /\bnn\.Module\b/,
      /\.backward\s*\(/,
      /\bDataLoader\b/,
    ],
    mention: /\bPyTorch\b/i,
    note: "Confirm device placement, call model.train() or eval() deliberately, and zero gradients before each backward pass.",
  },
  {
    id: "tensorflow",
    name: "TensorFlow",
    language: "python",
    patterns: [
      /\bimport\s+tensorflow\b/,
      /\btf\.keras\b/,
      /\btf\.data\b/,
      /\btf\.function\b/,
      /\.fit\s*\(/,
    ],
    mention: /\bTensorFlow\b/i,
    note: "Keep input pipelines deterministic, check shapes at the boundary, and use tf.function deliberately rather than everywhere.",
  },
  {
    id: "pytest",
    name: "pytest",
    language: "python",
    patterns: [
      /\bimport\s+pytest\b/,
      /@pytest\.\w+/,
      /\bpytest\.(?:raises|fixture|mark)\b/,
    ],
    mention: /\bpytest\b/i,
    note: "Prefer small fixtures with explicit scope and test failure paths, not only the happy path.",
  },
  {
    id: "jest",
    name: "Jest",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']@jest\/globals["']/,
      /\bjest\.(?:fn|mock|spyOn|useFakeTimers)\b/,
      /\bexpect\s*\([^)]*\)\.(?:toBe|toEqual|toMatch|toThrow)\b/,
    ],
    mention: /\bJest\s+(?:test|tests|testing|framework|mock|mocks)\b|\b(?:with|using)\s+Jest\b/i,
    note: "Restore mocks between tests, assert behavior rather than implementation details, and keep async expectations awaited.",
  },
  {
    id: "spring",
    name: "Spring Boot",
    language: "java",
    patterns: [
      /\borg\.springframework\b/,
      /@SpringBootApplication\b/,
      /@RestController\b/,
      /@(?:Get|Post|Put|Delete)Mapping\b/,
      /@(?:Autowired|Service|Repository)\b/,
    ],
    mention: /\bSpring\s+(?:Boot|framework|Java)\b/i,
    note: "Keep controllers thin, define transaction boundaries in services, and check bean scope before holding mutable state.",
  },
  {
    id: "android",
    name: "Android",
    language: "kotlin",
    patterns: [
      /\bimport\s+(?:android|androidx)\./,
      /@Composable\b/,
      /\bsetContent\s*\{/,
      /\bR\.layout\.\w+/,
      /\b(?:AppCompatActivity|Activity)\b[\s\S]{0,200}\bonCreate\s*\(/,
    ],
    mention: /\bAndroid\s+(?:app|application|project|code)\b/i,
    note: "Keep work off the main thread, scope coroutines to lifecycle owners, and test configuration changes and process death.",
  },
  {
    id: "laravel",
    name: "Laravel",
    language: "php",
    patterns: [
      /\bIlluminate\\/,
      /\bRoute::(?:get|post|put|delete|resource)\b/,
      /\bartisan\b/,
      /\$request->validate\s*\(/,
      /\bEloquent\b/,
    ],
    mention: /\bLaravel\b/i,
    note: "Validate at the boundary, use route model binding and policies, and watch N+1 queries with eager loading.",
  },
  {
    id: "rails",
    name: "Ruby on Rails",
    language: "ruby",
    patterns: [
      /\bRails\.application\b/,
      /\bApplicationRecord\b/,
      /\bActiveRecord\b/,
      /\b(?:has_many|belongs_to|has_one)\b/,
      /\bbefore_action\b/,
      /\bresources\s+:\w+/,
    ],
    mention: /\b(?:Ruby\s+on\s+)?Rails\s+(?:app|application|project|controller|model)\b/i,
    note: "Keep controllers thin, use strong parameters, and watch N+1 queries with includes or preload.",
  },
  {
    id: "dotnet",
    name: "ASP.NET Core",
    language: "csharp",
    patterns: [
      /\bMicrosoft\.AspNetCore\b/,
      /\[ApiController\]/,
      /\[Http(?:Get|Post|Put|Delete|Patch)\b/,
      /\bControllerBase\b/,
      /\bIActionResult\b/,
      /\bbuilder\.Services\.Add\w+/,
    ],
    mention: /\bASP\.?NET(?:\s+Core)?\b/i,
    note: "Use dependency injection, async I/O end to end, and model validation at the API boundary.",
  },
  {
    id: "unity",
    name: "Unity",
    language: "csharp",
    patterns: [
      /\bMonoBehaviour\b/,
      /\bUnityEngine\b/,
      /\[SerializeField\]/,
      /\bvoid\s+(?:Start|Update|FixedUpdate|LateUpdate)\s*\(/,
      /\bInstantiate\s*\(/,
    ],
    mention: /\bUnity\s+(?:engine|game|project|script)\b/i,
    note: "Keep per-frame work out of Update when possible, cache component lookups, and clean up event subscriptions in OnDisable.",
  },
  {
    id: "flutter",
    name: "Flutter",
    language: "dart",
    patterns: [
      /\bimport\s+["']package:flutter\//,
      /\b(?:StatelessWidget|StatefulWidget)\b/,
      /\bWidget\s+build\s*\(\s*BuildContext/,
      /\bsetState\s*\(/,
      /\bMaterialApp\b/,
    ],
    mention: /\bFlutter\b/i,
    note: "Keep widgets small, rebuild only what changes, and dispose controllers and listeners in State.dispose.",
  },
  {
    id: "electron",
    name: "Electron",
    language: "javascript",
    patterns: [
      /\bfrom\s+["']electron["']/,
      /\brequire\s*\(\s*["']electron["']\s*\)/,
      /\bBrowserWindow\b/,
      /\bipc(?:Main|Renderer)\b/,
      /\bcontextBridge\b/,
    ],
    mention: /\bElectron\b/i,
    note: "Keep Node integration off in renderers, expose a narrow preload API, and validate every IPC message.",
  },
  {
    id: "express",
    name: "Express",
    language: "javascript",
    patterns: [
      /\b(?:require\s*\(\s*["']express["']\s*\)|from\s+["']express["'])/,
      /\bexpress\s*\(\s*\)/,
      /\bapp\.(?:get|post|put|delete|use|listen)\s*\(/,
      /\bres\.(?:json|send|status)\s*\(/,
    ],
    mention: /\bExpress(?:\.js)?\s+(?:server|app|application|framework|route)\b/i,
    note: "Use centralized error middleware, validate request bodies, and set security headers and body size limits.",
  },
  {
    id: "nestjs",
    name: "NestJS",
    language: "typescript",
    patterns: [
      /\bfrom\s+["']@nestjs\//,
      /@(?:Controller|Injectable|Module)\s*\(/,
      /@(?:Get|Post|Put|Delete|Patch)\s*\(/,
    ],
    mention: /\bNestJS\b/i,
    supersedes: ["express"],
    note: "Keep providers stateless, use DTO validation and guards, and avoid request-scoped providers unless needed.",
  },
  {
    id: "jquery",
    name: "jQuery",
    language: "javascript",
    patterns: [
      /\$\([^)]*\)\.(?:ready|on|click|hide|show|toggle|addClass|removeClass|ajax|each)\s*\(/,
      /\bjQuery\b/,
    ],
    mention: /\bjQuery\b/i,
    note: "Prefer event delegation for dynamic elements, cache selectors, and remember modern DOM APIs cover most jQuery usage.",
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    language: "css",
    patterns: [
      /@tailwind\b/,
      /\bclassName\s*=\s*["'][^"']*\b(?:flex|grid|gap-\d|p[xy]?-\d|m[xy]?-\d|text-(?:xs|sm|lg|xl|white|black|gray-\d{3})|bg-\w+-\d{3}|rounded|shadow|w-\d+|h-\d+)\b/,
      /\bclass\s*=\s*["'][^"']*\b(?:flex|grid|gap-\d|p[xy]?-\d|text-(?:xs|sm|lg|xl))\b[^"']*["']/,
    ],
    mention: /\bTailwind(?:\s+CSS)?\b/i,
    note: "Extract repeated class groups into components, keep the design scale consistent, and avoid arbitrary values without a reason.",
  },
  {
    id: "bootstrap",
    name: "Bootstrap",
    language: "html",
    patterns: [
      /\bclass\s*=\s*["'][^"']*\b(?:container|row|col-(?:sm|md|lg|xl)|btn\s+btn-|navbar|card-body|modal)\b/,
      /\bbootstrap(?:\.min)?\.(?:css|js)\b/,
      /\bdata-bs-\w+/,
    ],
    mention: /\bBootstrap\s+(?:CSS|framework|grid|classes|5|4)\b|\b(?:use|using|with)\s+Bootstrap\b/i,
    note: "Use the grid deliberately, keep custom CSS minimal, and verify accessibility when overriding component styles.",
  },
  {
    id: "redux",
    name: "Redux",
    language: "javascript",
    patterns: [
      /\b(?:createSlice|configureStore)\s*\(/,
      /\b(?:useSelector|useDispatch)\s*\(/,
      /@reduxjs\/toolkit/,
    ],
    mention: /\bRedux\b/i,
    note: "Keep state normalized and serializable, put side effects in thunks or listeners, and select the smallest state slice needed.",
  },
];

export function detectFrameworks(text) {
  const source = normalizeText(text);
  const found = [];
  for (const framework of FRAMEWORKS) {
    let score = 0;
    for (const pattern of framework.patterns) {
      if (pattern.test(source)) score += 2;
    }
    if (framework.mention?.test(source)) score += 1;
    if (score > 0) found.push({ ...framework, score });
  }
  const blocked = new Set();
  for (const framework of found) {
    for (const id of framework.supersedes || []) blocked.add(id);
  }
  return found.filter((framework) => !blocked.has(framework.id)).sort((a, b) => b.score - a.score);
}

function frameworkApplies(framework, language) {
  if (!framework || !language) return false;
  if (framework.language === language.id) return true;
  const web = new Set(["javascript", "typescript", "html", "css"]);
  if (web.has(framework.language) && web.has(language.id)) return true;
  const jvm = new Set(["java", "kotlin"]);
  if (framework.id === "android" && jvm.has(framework.language) && jvm.has(language.id)) return true;
  return false;
}

export const CODING_TASKS = [
  { id: "auto", label: "Auto" },
  {
    id: "write",
    label: "Write code",
    instruction:
      "Write complete, runnable {language} code. Include every import, using, package, or header needed to build it. Prefer the standard library. After the code, list assumptions, how to run it, and key edge cases.",
  },
  {
    id: "fix",
    label: "Fix a bug",
    instruction:
      "The user wants a bug fixed. Identify the most likely root cause first, then give the smallest correct patch as one complete {language} code block. Preserve the user's structure and naming unless they cause the bug. Explain what was wrong and how to verify the fix. If essential code is missing, ask for it instead of guessing.",
  },
  {
    id: "error",
    label: "Fix an error",
    instruction:
      "The user is reporting an error. Restate the error, identify its most likely cause, and give the minimal corrected {language} code with the exact change. Explain how to confirm the fix. If the error text, version, or surrounding code is missing, ask for those before guessing.",
  },
  {
    id: "review",
    label: "Review code",
    instruction:
      "Review the code for correctness, security, performance, and maintainability. Rank findings by severity and cite the relevant lines or functions. Give concrete {language} fixes for the important issues. Do not rewrite everything unless asked.",
  },
  {
    id: "security",
    label: "Security review",
    instruction:
      "Review the code as a security engineer. Check injection, XSS, authentication and authorization, secrets, unsafe deserialization, SSRF, and dependency risk. Rank findings by severity, explain the exploit conditions, and give concrete {language} fixes with tests.",
  },
  {
    id: "refactor",
    label: "Refactor code",
    instruction:
      "Refactor without changing behavior. Reduce duplication, clarify naming, split oversized units, and preserve the public API. Show the refactored {language} code, summarize each change, and name the tests that must keep passing.",
  },
  {
    id: "tests",
    label: "Write tests",
    instruction:
      "Write focused automated tests using the standard test framework for {language}. Cover normal cases, edge cases, and failure paths. Include setup and run instructions.",
  },
  {
    id: "explain",
    label: "Explain code",
    instruction:
      "Explain what the code does: control flow first, then data, side effects, and edge cases. Keep it concise and do not rewrite the code unless the user asks.",
  },
  {
    id: "optimize",
    label: "Optimize",
    instruction:
      "Optimize the code for the stated goal while keeping behavior identical. State the tradeoffs, provide the optimized {language} code, and describe a simple before/after measurement plan.",
  },
  {
    id: "convert",
    label: "Convert code",
    instruction:
      "Port the code to {language}, preserving behavior and edge cases. Call out language-specific differences and anything that cannot map directly. Keep the same public API when practical.",
  },
  {
    id: "document",
    label: "Document code",
    instruction:
      "Document the code accurately: purpose, parameters, return values, errors, side effects, and one usage example. Use the standard doc format for {language}. Do not invent behavior that the code does not have.",
  },
  {
    id: "setup",
    label: "Set up project",
    instruction:
      "Give the exact setup steps for {language}: prerequisites, dependency installation, configuration, and a run command. Pin versions, mention common platform pitfalls, and show how to verify a clean install.",
  },
  {
    id: "design",
    label: "Design solution",
    instruction:
      "Propose an implementation plan before code: data model, interfaces, control flow, error handling, and tests. Compare one alternative approach and state the tradeoff. Then show the key {language} skeleton.",
  },
];

const LANGUAGE_RISKS = {
  c: "Check buffer bounds, null returns, and integer overflow; build with -Wall -Wextra and sanitizers while debugging.",
  cpp: "Watch object lifetimes, iterator invalidation, and exception safety; prefer RAII over manual new/delete.",
  csharp: "Enable nullable reference types, dispose IDisposable resources, and avoid async void outside event handlers.",
  java: "Respect equals/hashCode contracts, close resources with try-with-resources, and document thread-safety.",
  python: "Avoid mutable default arguments, bare except clauses, and blocking calls inside async code.",
  go: "Wrap errors with context, pass context for cancellation, and check for goroutine leaks.",
  rust: "Prefer Result over unwrap, respect ownership, and avoid blocking work inside async runtimes.",
  swift: "Avoid force unwraps, keep UI work on the main actor, and state the deployment target.",
  kotlin: "Prefer val and null-safe calls; scope coroutines correctly and keep blocking work off the main thread.",
  dart: "Handle null safety explicitly and avoid unnecessary widget rebuilds.",
  php: "Use prepared statements, escape output, and never unserialize untrusted input.",
  ruby: "Avoid interpolated SQL, handle nil explicitly, and watch symbol/string key mismatches.",
  perl: "Use strict and warnings, check regex captures, and avoid shell interpolation.",
  objectivec: "Respect ARC and nullability; avoid retain cycles in blocks and delegates.",
  vbnet: "Keep Option Strict On, prefer Using blocks, and avoid late binding.",
  fortran: "Use implicit none, explicit intents, and check array bounds.",
  cobol: "Initialize WORKING-STORAGE and handle file status codes explicitly.",
  ada: "Use strong types and explicit ranges; handle exceptions at package boundaries.",
  pascal: "State Free Pascal versus Delphi; manage ownership and use try/finally.",
  delphi: "State VCL versus FireMonkey; manage object ownership with try/finally.",
  zig: "Track allocator ownership and error unions; handle every error explicitly.",
  d: "Prefer immutable and @safe code; watch GC assumptions in systems code.",
  nim: "Check nil-able refs, effect annotations, and memory layout when interfacing with C.",
  assembly: "Document calling conventions, preserve registers, and keep stack alignment.",
  r: "Vectorize hot paths, handle NA values, and check factor/character conversions.",
  julia: "Keep hot code type-stable and avoid untyped global variables.",
  matlab: "Preallocate arrays, vectorize loops, and check indexing bounds.",
  scala: "Prefer immutable data and explicit effects; avoid implicit conversions that hide failures.",
  javascript: "Validate untrusted input before HTML or DOM sinks; guard null values and rejected promises.",
  typescript: "Keep strict mode on, avoid any and non-null assertions, and narrow types at runtime boundaries.",
  html: "Use semantic elements and accessible names; keep ARIA minimal and nesting valid.",
  xml: "Validate against a schema and preserve namespaces and encoding declarations.",
  css: "Check specificity, contrast, and responsive breakpoints; avoid !important as a fix.",
  markdown: "Keep headings hierarchical and fence code with its language; avoid raw HTML unless needed.",
  yaml: "Use two-space indentation, quote ambiguous scalars, and never use tabs.",
  json: "Use double-quoted keys with no comments or trailing commas, and validate at the boundary.",
  haskell: "Avoid partial functions and watch laziness leaks; keep types total.",
  lisp: "Watch dynamic scope, package prefixes, and mutation of shared structures.",
  scheme: "Keep tail calls where iteration matters and avoid relying on unspecified evaluation order.",
  clojure: "Prefer pure functions and immutable data; watch lazy sequence realization.",
  fsharp: "Keep functions total and async code explicit; guard against null from .NET boundaries.",
  erlang: "Design supervisor trees and match every message; avoid unbounded mailboxes.",
  elixir: "Use pattern matching and supervised processes; avoid shared mutable state.",
  ocaml: "Check match exhaustiveness and be explicit about mutable state.",
  bash: "Quote variables, enable set -euo pipefail, and avoid parsing ls output.",
  powershell: "Use approved verbs and -ErrorAction, and never Invoke-Expression untrusted input.",
  lua: "Remember 1-based indexing; check nil table access and scope locals deliberately.",
  tcl: "Quote substitutions deliberately and use catch on error paths.",
  sql: "Parameterize values, check execution plans, and wrap multi-step writes in transactions.",
  plsql: "Handle NO_DATA_FOUND and avoid commits inside reusable procedures.",
  tsql: "Use parameterized queries and SET NOCOUNT ON; inspect the actual execution plan.",
  scratch: "Describe exact block order, sprite state, and broadcast timing.",
  logo: "State the starting heading and pen state; turtle state persists between commands.",
  basic: "State the dialect (QB64, FreeBASIC, VBA) and check line-number and GOTO structure.",
  smalltalk: "Messages are left-associative; use parentheses and handle nil explicitly.",
  prolog: "Check unification order and termination; avoid unbounded recursion.",
  labview: "Describe wire order, loop timing, and error-cluster propagation.",
  vhdl: "State clock domains and synthesis assumptions; avoid inferred latches.",
  verilog: "Use nonblocking assignments in sequential logic and state timing assumptions.",
  solidity: "Guard against reentrancy and check access control and integer precision.",
  apex: "Respect governor limits, bulkify DML, and handle exceptions explicitly.",
  abap: "Avoid SELECT * inside loops; use modern ABAP and internal tables wisely.",
  crystal: "Watch nil unions and type inference across method boundaries.",
  groovy: "Prefer static compilation and avoid dynamic surprises in hot paths.",
  hack: "Enable strict types and watch HHVM-only semantics.",
  monkeyc: "Respect memory limits and device API levels; release resources when the app stops.",
};

const TASK_FOCUS = {
  write: "State inputs, assumptions, and edge cases, and include the run command.",
  fix: "Keep the patch minimal and add a regression test that fails before it.",
  error: "Reproduce with the smallest failing input, then fix the root cause rather than the symptom.",
  review: "Rank findings by severity and back each one with an input that demonstrates it.",
  security: "Trace untrusted input to sinks such as queries, HTML, shell, files, and outbound requests.",
  refactor: "Keep behavior identical, preserve the public API, and land the change in test-backed steps.",
  tests: "Cover boundaries, failure paths, and one regression case for every bug found.",
  optimize: "Measure first, state complexity and memory tradeoffs, and keep a benchmark that guards the result.",
  convert: "Preserve edge cases and public APIs, and list idioms that cannot map one-to-one.",
  explain: "Trace control flow and data first, then side effects, complexity, and failure modes.",
  document: "Document the behavior the code actually has, including errors and side effects.",
  setup: "Pin versions, give copy-paste commands, and verify from a clean environment.",
  design: "Separate interfaces from implementation, state tradeoffs, and include a test plan.",
};

const KIND_FOCUS = {
  markup: "Validate structure and accessibility, and keep content separate from presentation.",
  data: "Validate the format at the boundary and keep the schema explicit.",
  stylesheet: "Check specificity, responsive behavior, and contrast.",
  visual: "Describe the exact blocks or commands and their order.",
  educational: "Keep examples short and state the expected result.",
};

const SQL_DIALECTS = [
  [
    "PostgreSQL",
    [/\bILIKE\b/i, /::\w+/, /\b(?:BIG)?SERIAL\b/i, /\bRETURNING\b/i, /\bjsonb\b/i, /\bON\s+CONFLICT\b/i],
  ],
  [
    "MySQL or MariaDB",
    [/`[A-Za-z_]\w*`/, /\bAUTO_INCREMENT\b/i, /\bENGINE\s*=\s*InnoDB\b/i, /\bLIMIT\s+\d+\s*,\s*\d+/],
  ],
  ["SQLite", [/\bPRAGMA\b/i, /\bAUTOINCREMENT\b/i, /\bWITHOUT\s+ROWID\b/i, /\bstrftime\s*\(/i]],
  [
    "SQL Server",
    [/\[[A-Za-z_]\w*\]/, /\bNVARCHAR\b/i, /\bTOP\s*\(?\s*\d+/i, /\bIDENTITY\s*\(/i, /\bNOCOUNT\b/i],
  ],
  [
    "Oracle",
    [/\bROWNUM\b/i, /\bNVL\s*\(/i, /\bVARCHAR2\b/i, /\bFROM\s+DUAL\b/i, /\bCONNECT\s+BY\b/i],
  ],
];

function detectSqlDialect(text) {
  let best = null;
  for (const [name, patterns] of SQL_DIALECTS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) score += 1;
    }
    if (score && (!best || score > best.score)) best = { name, score };
  }
  return best;
}

const CODE_FEATURE_HINTS = {
  c: [
    [/\b(?:nullptr|constexpr|typeof)\b/, "The code uses C23 features; compile with a C23-capable compiler."],
  ],
  cpp: [
    [/\bstd::expected\b|\bstd::print\b|\bstd::ranges::to\b/, "The code uses C++23 library features."],
    [/\bconcept\s+\w+|\brequires\s+/, "The code uses C++20 concepts or constraints."],
  ],
  java: [
    [/\bThread\.ofVirtual\b|\bnewVirtualThreadPerTaskExecutor\b/, "The code uses Java 21 virtual threads."],
  ],
  python: [
    [/\bprint\s+["']/, "The code uses Python 2 print syntax; port it to Python 3 print()."],
    [/\bexcept\s*\*/, "The code uses Python 3.11 exception groups."],
    [/^type\s+\w+\s*=/m, "The code uses the Python 3.12 type alias statement."],
  ],
  go: [
    [/\bfor\s+\w+\s*:=\s*range\s+\d+/, "The code uses Go 1.22 range-over-int syntax."],
    [/\biter\.Seq\b|\brange\s+func\b/, "The code uses Go 1.23 iterator syntax."],
  ],
  javascript: [
    [/\b(?:import|export)\s+[^;\n]*\bfrom\s+["']/, "The code uses ES modules; confirm type=\"module\" or the package module type."],
    [/\brequire\s*\(|\bmodule\.exports\b/, "The code uses CommonJS modules; confirm the Node.js runtime settings."],
  ],
  php: [
    [/#\[(?:Override|SensitiveParameter)\]|\bconst\s+(?:int|string|bool)\s+\w+/, "The code uses PHP 8.3 attributes or typed constants."],
  ],
  css: [
    [/@container\b|:has\s*\(/, "The code uses modern CSS container queries or :has()."],
  ],
};

function inferFeatureHint(language, text) {
  if (!language) return "";
  const hints = CODE_FEATURE_HINTS[language.id];
  if (!hints) return "";
  for (const [pattern, note] of hints) {
    if (pattern.test(text)) return note;
  }
  return "";
}

function advancedFocus(language, task, framework) {
  const items = [];
  const taskTip = TASK_FOCUS[task];
  if (taskTip) items.push(taskTip);
  if (framework?.note) items.push(framework.note);
  const risk = (language && LANGUAGE_RISKS[language.id]) || KIND_FOCUS[language?.kind];
  if (risk) items.push(risk);
  if (language?.tier === "specialized") {
    items.push("State the exact compiler or platform version and avoid guessed APIs.");
  }
  return [...new Set(items)].slice(0, 3);
}

const languageIndex = new Map();
const fenceIndex = new Map();

for (const language of LANGUAGES) {
  languageIndex.set(language.id, language);
  for (const fence of [language.fence, ...(language.fences || [])]) {
    if (fence) fenceIndex.set(String(fence).toLowerCase(), language);
  }
}

// Longer names win over aliases during scoring, so "Objective-C" and
// "Monkey C" beat the bare "C" without a special case.

export function languageById(id) {
  if (!id || id === "auto") return null;
  return languageIndex.get(String(id).toLowerCase()) || null;
}

export function languageByFence(fence) {
  if (!fence) return null;
  return fenceIndex.get(String(fence).toLowerCase().trim()) || null;
}

export function languageDisplayName(fence) {
  const language = languageByFence(fence);
  if (language) return language.name;
  return String(fence || "").trim() || "Code";
}

export function taskById(id) {
  return CODING_TASKS.find((task) => task.id === id) || CODING_TASKS[0];
}

const DETECTION_METHOD_LABELS = {
  fence: "fenced code label",
  conversion: "conversion target",
  mention: "language or API mention",
  signature: "pasted-code signatures",
  extension: "file extension",
  framework: "framework mention",
};

const TASK_ASK = {
  review: "Share the goal and any compatibility constraints.",
  security: "Share the trust boundary and how untrusted data reaches this code.",
  refactor: "Share the tests that must keep passing.",
  tests: "Share the framework and the behavior that must not regress.",
  optimize: "Share the metric, current numbers, and input sizes.",
  convert: "Share the source and target language versions.",
  document: "Share the audience and where the docs will live.",
  setup: "Share your OS, tool versions, and the exact setup error if one appears.",
  design: "Share scale, data shape, and deployment constraints.",
};

function formatList(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function detectionConfidence(detection) {
  if (!detection) return "";
  const label = DETECTION_METHOD_LABELS[detection.method] || "matching patterns";
  let text = `\n\nDetection confidence: **${detection.confidence}** (${label}).`;
  if (detection.confidence === "low") {
    text += " If that looks wrong, name the language and I will use it.";
  }
  return text;
}

function companionLanguages(text, detection, framework) {
  const primary = detection?.language || null;
  const seen = new Set(primary ? [primary.id] : []);
  if (framework) seen.add(framework.language);
  const extras = [];

  const add = (id) => {
    if (!id || seen.has(id)) return;
    const language = languageById(id);
    if (!language) return;
    extras.push(language);
    seen.add(id);
  };

  for (const match of text.matchAll(/```[ \t]*([\w+#./-]+)/g)) {
    const language = languageByFence(match[1]);
    if (language) add(language.id);
  }

  if (primary?.id === "html") {
    if (/<style\b/i.test(text)) add("css");
    if (/<script\b/i.test(text)) {
      const isTypeScript = /<script[^>]*\blang\s*=\s*["'](?:ts|typescript)["']/i.test(text);
      add(isTypeScript ? "typescript" : "javascript");
    }
  } else if (primary?.id === "css" && /<(?:html|body|main|section|header|form|button)\b/i.test(text)) {
    add("html");
  }

  return extras.slice(0, 2);
}

export function demoCodingReply({ prompt, systemPrompt = "" }) {
  const detection = detectLanguageDetailed(prompt);
  const language = detection?.language || null;
  const framework = detection?.framework || null;
  const companions = companionLanguages(prompt, detection, framework);
  const languageName = language?.name || "the target language";
  const targetName = framework ? `${languageName} (${framework.name})` : languageName;
  const fence = language?.fence || "code";
  const task = detectTask(prompt);
  const taskLabel = taskById(task).label;
  const facts = languageFacts(language, prompt);
  const confidence = detectionConfidence(detection);
  const focus = advancedFocus(language, task, framework);
  const focusBlock = focus.length
    ? `\n\n**Advanced focus**\n${focus.map((item) => `- ${item}`).join("\n")}`
    : "";

  const names = [];
  if (language) names.push(`**${language.name}**`);
  if (framework) names.push(`**${framework.name}**`);
  if (!companions.length && language) {
    const secondary = detection?.frameworks?.find(
      (item) => item.id !== framework?.id && item.score >= 2 && frameworkApplies(item, language),
    );
    if (secondary) names.push(`**${secondary.name}**`);
  }
  for (const companion of companions) names.push(`**${companion.name}**`);
  const subject = names.length ? formatList(names) : null;
  const header = subject
    ? `**Built-in Coder.** Detected ${subject}, task **${taskLabel}**.${confidence}${facts}${focusBlock}`
    : `**Built-in Coder.** I couldn't confidently identify the language, task **${taskLabel}**.${focusBlock}`;

  if (task === "error" || task === "fix") {
    return `${header}

I run on local rules, so I can scaffold the fix but can't diagnose a real bug on my own.

\`\`\`${fence}
// Paste the failing code and the exact error text here.
// A diagnosis would explain the root cause and show the smallest correct patch.
\`\`\`

**To get a useful answer:** include the full error, the command that produced it, the language version, and the surrounding function.`;
  }

  if (task === "write") {
    const program = buildBasicProgram(prompt, language);
    if (program) return formatBasicProgram(program, { coder: true, framework });

    return `${header}

\`\`\`${fence}
// Full ${targetName} code would go here, with assumptions and edge cases.
\`\`\`

I run on local rules. Complete beginner examples are built in for ${SUPPORTED_PROGRAM_LANGUAGE_NAMES}; for this request I can only lay out the structure. Tell me the exact function and inputs, and I'll go further.`;
  }

  const ask = TASK_ASK[task] ? ` ${TASK_ASK[task]}` : "";
  return `${header}

\`\`\`${fence}
// ${taskLabel} request for ${targetName}
\`\`\`

I've attached the right coding task prompt. The built-in assistant uses local rules, so I can outline the approach but can't produce the full result on my own.${ask}`;
}

function languageFacts(language, text = "") {
  if (!language) return "";
  const parts = [];
  if (language.version) parts.push(`Target ${language.version}`);
  if (language.toolchain) parts.push(`assume ${language.toolchain}`);
  let body = parts.length ? `\n\n${parts.join("; ")}.` : "";
  const feature = inferFeatureHint(language, text);
  if (feature) body += `\n\n${feature}`;
  if (language.id === "sql") {
    const dialect = detectSqlDialect(text);
    if (dialect) {
      body += `\n\nDialect clues point to ${dialect.name}; confirm it before using vendor-specific syntax.`;
    }
  }
  if (language.kind === "markup") {
    body += `\n\n${language.name} is a markup language, not a general-purpose programming language.`;
  } else if (language.kind === "data") {
    body += `\n\n${language.name} is a data format. Keep it valid and say which tool consumes it.`;
  } else if (language.kind === "stylesheet") {
    body += `\n\n${language.name} is a stylesheet language. Answer with valid selectors and properties.`;
  } else if (language.kind === "visual") {
    body += `\n\n${language.name} is not written as ordinary text code; an accurate answer describes the exact blocks or commands.`;
  } else if (language.kind === "educational") {
    body += `\n\n${language.name} is an educational language; favor short, readable examples.`;
  }
  return body;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalPattern(value) {
  return `\\b${escapeRegExp(value)}(?![\\w+#/])`;
}

function valuesFor(language) {
  const values = new Set();
  values.add(language.name);
  if (language.id.length > 1) values.add(language.id);
  for (const fence of language.fences || []) values.add(fence);
  for (const extra of language.match || []) values.add(extra);
  return [...values].filter(Boolean);
}

function plainPatterns(language) {
  if (language.patterns) return language.patterns;
  return valuesFor(language).filter((value) => value.length > 1).map(literalPattern);
}

function anyPatterns(language) {
  if (language.patterns) return language.patterns;
  return valuesFor(language).map(literalPattern);
}

function contextPatterns(language) {
  if (language.patterns) return language.patterns;
  return valuesFor(language).map(literalPattern);
}

function regexMatch(source, text) {
  try {
    return new RegExp(source, "i").exec(text);
  } catch {
    return null;
  }
}

function contextRegexes(source) {
  return [
    new RegExp(`\\b(?:in|using|with|for|written\\s+in|language|lang|programming\\s+in)\\s+(?:the\\s+)?${source}`, "i"),
    new RegExp(
      `${source}\\s+(?:code|program|language|function|script|snippet|module|class|file|compiler|runtime|error|exception|syntax|developer|programming|project|tests?|library|framework|game|animation|story|proc|turtle|closure|fiber|widget|goroutine|asyncio|lambda|monad|borrow|unit|form|macro|routine|dataframe|plot|matrix|query|trigger|contract|coroutine|ownership|optional)\\b`,
      "i",
    ),
    new RegExp(
      `\\b(?:write|fix|debug|review|explain|convert|port|test|compile|run|use|build|create|make|optimi[sz]e|refactor|translate|migrate|learn|learning|study|studying|teach|teaching|practi[cs]e|practi[cs]ing|stuck|struggl\\w*|beginner|pick|choos\\w*|know|knowing|prefer)\\b[^.\\n]{0,50}?${source}`,
      "i",
    ),
  ];
}

function contextScore(language, text) {
  let best = null;
  for (const source of contextPatterns(language)) {
    for (const pattern of contextRegexes(source)) {
      const full = pattern.exec(text);
      if (!full) continue;
      const name = regexMatch(source, full[0]);
      if (!name) continue;
      const candidate = { index: full.index + name.index, length: name[0].length };
      if (
        !best ||
        candidate.length > best.length ||
        (candidate.length === best.length && candidate.index < best.index)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

// Code-shape signatures: recognize pasted code even when the user never names
// the language. Each pattern counts once; weights favor unmistakable tokens.
const CODE_SIGNATURES = {
  c: [
    [/#include\s*<(?:stdio|stdlib|string|stdint|stdbool|math|time|ctype|errno|assert)\.h>/, 4],
    [/\b(?:printf|fprintf|sprintf|snprintf|scanf|malloc|calloc|realloc|free)\s*\(/, 2],
    [/\bint\s+main\s*\(\s*(?:void|int\s+\w+|char\s*\*\*\w+)/, 4],
    [/\btypedef\s+(?:struct|enum|union)\b/, 3],
    [/\b(?:uint8_t|int32_t|size_t)\b/, 1],
  ],
  cpp: [
    [/#include\s*<(?:iostream|vector|string|map|memory|algorithm|unordered_map|thread)>/, 4],
    [/\bstd::\w+/, 3],
    [/\busing\s+namespace\s+std\s*;/, 4],
    [/\b(?:cout|cin|cerr|endl)\b/, 2],
    [/\btemplate\s*</, 2],
    [/\bclass\s+\w+\s*:\s*(?:public|protected|private)\s+\w+/, 2],
  ],
  csharp: [
    [/\busing\s+System(?:\.[\w.]+)?\s*;/, 4],
    [/\bConsole\.(?:WriteLine|Write|ReadLine)\s*\(/, 4],
    [/\basync\s+Task(?:<[\w<>,\s]+>)?\s+\w+\s*\(/, 3],
    [/\bpublic\s+(?:sealed\s+|partial\s+|static\s+)*class\s+\w+/, 1],
    [/\bnamespace\s+[\w.]+\s*[;{]/, 2],
    [/\[(?:Serializable|HttpGet|Route|JsonProperty)\b/, 2],
  ],
  java: [
    [/\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\]/, 4],
    [/\bSystem\.out\.println?\s*\(/, 4],
    [/\bimport\s+(?:java|javax)\./, 4],
    [/@Override\b/, 2],
    [/\b(?:ArrayList|HashMap|HashSet)<\w+>/, 2],
  ],
  python: [
    [/^\s*def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:/m, 4],
    [/^\s*(?:from\s+[\w.]+\s+import\s+|import\s+[\w.]+(?:\s+as\s+\w+)?\s*$)/m, 3],
    [/\bif\s+__name__\s*==\s*['"]__main__['"]\s*:/, 4],
    [/^\s*class\s+\w+(?:\([\w.,\s]+\))?\s*:/m, 3],
    [/\bself\.\w+/, 2],
    [/\b(?:elif|lambda\s+\w+\s*:)/, 3],
    [/\bfor\s+\w+\s+in\s+[\w.]+(?:\([^)]*\))?\s*:/, 3],
    [/\b(?:range|enumerate|zip)\s*\(/, 1],
    [/\bprint\s*\(/, 2],
  ],
  go: [
    [/^\s*package\s+\w+\s*$/m, 4],
    [/\bfunc\s+(?:\([^)]*\)\s*)?\w+\s*\(/, 3],
    [/\bfmt\.\w+\s*\(/, 4],
    [/\bimport\s+(?:\(|\s*")/, 2],
    [/:=/, 2],
    [/\bgo\s+func\b|\bchan\b/, 3],
    [/\bdefer\s+\w+/, 3],
  ],
  rust: [
    [/\bfn\s+\w+\s*(?:<[^>]*>)?\s*\(/, 3],
    [/\blet\s+mut\s+\w+/, 4],
    [/\bprintln!\s*\(/, 4],
    [/\buse\s+(?:std|crate|serde|tokio)::/, 3],
    [/\bimpl(?:<[^>]*>)?\s+\w+/, 3],
    [/&(?:mut\s+)?str\b/, 2],
    [/\b(?:Result|Option)\s*<[^>]+>/, 1],
  ],
  swift: [
    [/\bimport\s+(?:SwiftUI|UIKit|Foundation|Combine|CoreData)\b/, 4],
    [/\bfunc\s+\w+\s*\([^)]*\)\s*(?:async\s+)?(?:throws\s+)?(?:->\s*[\w<>\[\]?.]+)?\s*\{/, 3],
    [/\b(?:let|var)\s+\w+\s*:\s*[\w<>\[\]?.]+/, 2],
    [/\bguard\s+let\b|\bif\s+let\b/, 3],
    [/@(?:State|Binding|Published|Observable|MainActor)\b/, 3],
    [/\bstruct\s+\w+\s*:\s*(?:View|Codable|Identifiable)\b/, 3],
  ],
  kotlin: [
    [/\bfun\s+(?:<[^>]+>\s*)?\w+\s*\(/, 3],
    [/\bval\s+\w+\s*(?::\s*[\w<>?]+)?\s*=/, 2],
    [/\bdata\s+class\s+\w+/, 4],
    [/\bimport\s+(?:kotlinx?|android|androidx)\./, 3],
    [/\bwhen\s*\([^)]*\)\s*\{|\b!!\b/, 2],
    [/\bprintln\s*\(/, 1],
  ],
  dart: [
    [/\bimport\s+['"]package:[\w_]+/, 4],
    [/\bWidget\s+build\s*\(\s*BuildContext/, 4],
    [/\bclass\s+\w+\s+extends\s+(?:StatelessWidget|StatefulWidget|State<)/, 4],
    [/\bvoid\s+main\s*\(\s*\)\s*\{/, 3],
    [/\bFuture<[\w<>?]+>/, 2],
    [/\b(?:final|const)\s+\w+\s*=/, 1],
  ],
  php: [
    [/<\?php\b/, 4],
    [/\bfunction\s+\w+\s*\([^)]*\$/, 3],
    [/\becho\s+["'$]/, 2],
    [/\b(?:PDO|mysqli|->prepare|->query)\b/, 2],
    [/\buse\s+Illuminate\\/, 4],
    [/\$\w+\s*(?:\.=|\+=|=)/, 1],
  ],
  ruby: [
    [/^\s*require\s+['"][\w\/.-]+['"]/m, 3],
    [/\battr_(?:accessor|reader|writer)\b/, 4],
    [/^\s*def\s+\w+[?!]?(?:\s*\([^)]*\))?\s*$/m, 2],
    [/\bdo\s*\|[^|]*\|/, 3],
    [/\bclass\s+\w+\s*<\s*\w+/, 2],
    [/\bunless\b|\belsif\b/, 3],
    [/\bputs\s+/, 1],
  ],
  perl: [
    [/#!.*\bperl\b/, 4],
    [/\buse\s+(?:strict|warnings|feature)\s*;/, 4],
    [/\bmy\s+[$@%]\w+/, 3],
    [/\b(?:=~|!~)\s*(?:\/|s\/)/, 2],
    [/\bsub\s+\w+\s*\{/, 2],
  ],
  objectivec: [
    [/#import\s*<(?:Foundation|UIKit|Cocoa)/, 4],
    [/@(?:interface|implementation|property|protocol|end)\b/, 3],
    [/\b(?:NSString|NSArray|NSDictionary|NSError)\s*\*/, 4],
    [/\bNSLog\s*\(\s*@"/, 4],
    [/\[\[\w+\s+alloc\]\s+init/, 3],
    [/^\s*-\s*\([^)]*\)\s*\w+/m, 2],
  ],
  vbnet: [
    [/\bImports\s+System(?:\.[\w.]+)?/, 3],
    [/\bSub\s+Main\s*\(/, 4],
    [/\bDim\s+\w+\s+As\s+[\w.()]+/, 3],
    [/\b(?:Console\.WriteLine|MsgBox)\s*\(/, 3],
    [/\b(?:End\s+Sub|End\s+Module|End\s+Class)\b/, 2],
    [/\bOption\s+Strict\b/, 4],
  ],
  fortran: [
    [/\bimplicit\s+none\b/i, 4],
    [/\b(?:integer|real|character|logical|complex)\s*(?:\([^)]*\))?\s*::/i, 3],
    [/^\s*subroutine\s+\w+/im, 3],
    [/\bend\s+(?:program|subroutine|function|module)\b/i, 2],
    [/\bprint\s*\*/, 2],
    [/^\s*do\s+\w+\s*=\s*\d+\s*,/im, 1],
  ],
  cobol: [
    [/\bIDENTIFICATION\s+DIVISION\b/i, 4],
    [/\bPROGRAM-ID\b/i, 4],
    [/\bWORKING-STORAGE\s+SECTION\b/i, 4],
    [/\bPIC\s+[X9()VS.]+/i, 4],
    [/^\s*\d{2}\s+[\w-]+\s+PIC\b/im, 2],
    [/\b(?:DISPLAY|PERFORM|MOVE)\s+[\w'"]/i, 1],
  ],
  ada: [
    [/\bwith\s+Ada(?:\.\w+)?\s*;/, 4],
    [/\bPut_Line\s*\(/, 4],
    [/\bAda\.Text_IO\b/, 4],
    [/\bpackage\s+(?:body\s+)?\w+\s+is\b/, 3],
    [/\b(?:procedure|function)\s+\w+[^;]*\bis\b/, 2],
  ],
  pascal: [
    [/^\s*program\s+\w+\s*;/im, 3],
    [/\buses\s+(?:SysUtils|Classes|Math|System)\b/, 3],
    [/\b(?:writeln|readln)\b/, 2],
    [/\bbegin\b[\s\S]{0,400}\bend\s*\./i, 3],
    [/\bprocedure\s+\w+\s*\([^)]*\)\s*;/, 2],
    [/\bfunction\s+\w+\s*\([^)]*\)\s*:\s*\w+\s*;/, 2],
  ],
  delphi: [
    [/^\s*unit\s+\w+\s*;/im, 4],
    [/\bTForm\w*|\bApplication\.(?:Run|Terminate)\b/, 3],
    [/\bShowMessage\s*\(/, 3],
    [/\bprocedure\s+T\w+\.\w+\s*\(/, 3],
    [/\bFreeAndNil\b|\.(?:Create|Free)\b/, 2],
  ],
  zig: [
    [/@import\s*\(\s*"std"\s*\)/, 4],
    [/\bpub\s+fn\s+\w+\s*\(/, 4],
    [/\bdefer\s+\w+|\berrdefer\b/, 3],
    [/@(?:intCast|as|sizeOf|memcpy)\b/, 3],
    [/\b(?:const|var)\s+\w+\s*:\s*[\w.]+/, 1],
  ],
  d: [
    [/\bimport\s+std\.\w+/, 4],
    [/\b(?:writeln|writefln)\s*\(/, 4],
    [/@(?:safe|nogc|property)\b/, 3],
    [/\bimmutable\s+\w+/, 2],
    [/\bvoid\s+main\s*\(\s*\)/, 2],
  ],
  nim: [
    [/^\s*proc\s+\w+\s*\(/m, 3],
    [/\bimport\s+std\/\w+/, 3],
    [/\btype\s+\w+\s*=\s*(?:object|enum|ref)\b/, 3],
    [/\b(?:func|template)\s+\w+\s*\(/, 2],
    [/\becho\s+/, 1],
    [/\b(?:let|var)\s+\w+\s*(?::\s*\w+)?\s*=/, 1],
  ],
  assembly: [
    [/^\s*(?:mov|lea|add|sub|xor|push|pop|jmp|call|ret)\s+(?:e|r)?[a-z]{2,3}\b/im, 3],
    [/\b(?:section|segment)\s+\.(?:text|data|bss)\b/i, 4],
    [/\bglobal\s+(?:_?start|main)\b/, 3],
    [/\b(?:rax|rbx|rcx|rdx|rsp|rbp|eax|ebx|xmm0)\b/, 3],
    [/\b(?:syscall|int\s+0x80)\b/, 4],
  ],
  r: [
    [/\b(?:library|require)\s*\(\s*[\w.]+?\s*\)/, 3],
    [/\bggplot\s*\(|\bdplyr::|\bmutate\s*\(/, 4],
    [/\bfunction\s*\([^)]*\)\s*\{/, 2],
    [/\b(?:data\.frame|matrix|vector)\s*\(/, 2],
    [/<-/, 2],
    [/\bNA\b/, 1],
  ],
  julia: [
    [/\busing\s+(?:LinearAlgebra|Statistics|DataFrames|Plots|Random)\b/, 4],
    [/\w+::(?:Int|Float64|String|Bool|Vector)\b/, 3],
    [/\bfunction\s+\w+\s*\([^)]*\)[\s\S]{0,200}\bend\b/, 2],
    [/\bstruct\s+\w+/, 1],
    [/^\s*function\s+\w+\s*\(/m, 2],
  ],
  matlab: [
    [/^\s*function\s+(?:\[[^\]]*\]\s*=\s*)?\w+\s*\(/m, 3],
    [/\b(?:zeros|ones|linspace|plot|figure|subplot|xlabel|ylabel|legend)\s*\(/, 2],
    [/^\s*(?:clc|clear|close all)\s*;?/m, 3],
    [/\bfor\s+\w+\s*=\s*\d+\s*:/, 3],
    [/\.\*|\.[/]\s|\^\s*2/, 2],
  ],
  scala: [
    [/\bobject\s+\w+\s*(?:extends\s+\w+\s*)?\{/, 3],
    [/\bdef\s+main\s*\(\s*args\s*:\s*Array\[String\]\s*\)/, 4],
    [/\bcase\s+class\s+\w+/, 4],
    [/\bimport\s+scala\./, 3],
    [/\bval\s+\w+\s*=\s*(?:List|Seq|Vector|Map)\(/, 3],
    [/\bmatch\s*\{/, 2],
  ],
  javascript: [
    [/\bconsole\.(?:log|error|warn)\s*\(/, 4],
    [/\bdocument\.(?:querySelector|getElementById|addEventListener)\b/, 4],
    [/=>\s*(?:\{|[^{}\n]+$)/m, 2],
    [/\b(?:const|let)\s+\w+\s*=/, 1],
    [/\bexport\s+(?:default|const|function|class)\b/, 2],
    [/\brequire\s*\(\s*['"]/, 2],
    [/\bimport\s+[\w{},\s*]+from\s+['"]/, 2],
    [/\bfunction\s+\w*\s*\([^)]*\)\s*\{/, 2],
    [/<[A-Z]\w*[\s/>]/, 2],
    [/\bclassName=/, 1],
  ],
  typescript: [
    [/\binterface\s+\w+\s*(?:extends\s+[\w, ]+)?\{/, 4],
    [/\bimport\s+type\b/, 4],
    [/\benum\s+\w+\s*\{/, 3],
    [/\btype\s+\w+\s*=\s*\{/, 3],
    [/\btype\s+\w+\s*=\s*[^;]+;/, 2],
    [/\{[^}]{1,80}\}\s*:\s*[A-Z]\w*/, 4],
    [/\b(?:const|let|function)\s+\w+\s*(?:\([^)]*\))?\s*:\s*[\w<>\[\]|&' ]+/, 2],
    [/\b(?:public|private|readonly)\s+\w+\s*:\s*[\w<>\[\]|]+/, 2],
    [/\bimport\s+[\w{},\s*]+from\s+['"]/, 2],
    [/<[A-Z]\w*[\s/>]/, 2],
  ],
  html: [
    [/<!doctype\s+html/i, 4],
    [/<(?:div|span|nav|header|footer|main|section|article|ul|li|a|p|h[1-6])\b[^>]*>/i, 3],
    [/<\/\w+>/, 2],
    [/\bclass="[^"]*"/, 1],
  ],
  xml: [
    [/<\?xml\s+version=/i, 4],
    [/xmlns(?::\w+)?="http/i, 3],
    [/<(?:xs:schema|xsl:stylesheet|catalog|note|root)\b/i, 2],
  ],
  css: [
    [/[.#]?[\w-]+\s*\{[^{}]*[\w-]+\s*:\s*[^;{}]+;/, 3],
    [/@media\s*\(|@keyframes\b/, 3],
    [/\b(?:display|position|margin|padding|color|background|font-size|flex|grid|gap|border-radius)\s*:/, 1],
    [/\bvar\(\s*--[\w-]+/, 3],
  ],
  markdown: [
    [/^#{1,6}\s+\S/m, 3],
    [/^\s*[-*+]\s+\S/m, 1],
    [/\[[^\]]+\]\([^)]+\)/, 2],
    [/^\|.+\|\s*$/m, 3],
    [/^```/m, 2],
  ],
  yaml: [
    [/^---\s*$/m, 2],
    [/^[\w-]+:\s*\S/m, 2],
    [/^\s{2,}[\w-]+:\s*\S/m, 3],
    [/^\s*-\s+[\w"'[].*$/m, 2],
    [/: &[\w-]+|: \*[\w-]+/, 3],
  ],
  json: [
    [/"[\w@.$-]+"\s*:\s*(?:"|true|false|null|-?\d|\{|\[)/, 3],
    [/^\s*\{[\s\S]*\}\s*$/m, 1],
  ],
  haskell: [
    [/^module\s+\w+(?:\.\w+)*\s+where\b/m, 4],
    [/\bimport\s+(?:qualified\s+)?(?:Data|Control|System|Prelude)\./, 3],
    [/^\s*main\s*::\s*IO\s*\(\)/m, 4],
    [/\bdata\s+\w+\s*=\s*\w+/, 2],
    [/\w+\s*::\s*[A-Z]\w*/, 2],
  ],
  lisp: [
    [/\(defun\s+\w+/i, 4],
    [/\(def(?:var|parameter|macro|class)\s+/i, 3],
    [/\(let\s*\(\(/, 3],
    [/\((?:car|cdr|cons|mapcar|format)\b/i, 2],
  ],
  scheme: [
    [/\(define\s+\(?\w+/i, 3],
    [/\(define\s+\w+\s+/i, 2],
    [/\(lambda\s*\(/i, 3],
    [/\((?:display|newline|let\*?|cond)\b/i, 1],
  ],
  clojure: [
    [/\(ns\s+[\w.]/i, 4],
    [/\(defn-?\s+\w+/i, 4],
    [/\(:require\b/i, 3],
    [/\(def\s+\w+/i, 2],
    [/\(let\s*\[/i, 2],
  ],
  fsharp: [
    [/\bopen\s+(?:System|FSharp|Microsoft)\b/, 3],
    [/\|>\s*\w+/, 3],
    [/\bmatch\s+\w+\s+with\b/, 3],
    [/\bprintfn\s+"/, 4],
    [/\btype\s+\w+\s*=\s*(?:\{|\|)/, 3],
    [/\blet\s+\w+\s*=/, 1],
  ],
  erlang: [
    [/-module\s*\(\s*\w+\s*\)\s*\./, 4],
    [/-export\s*\(\s*\[/, 4],
    [/-behaviou?r\s*\(/, 4],
    [/\blists:\w+\s*\(/, 3],
    [/\bio:format\s*\(/, 3],
    [/\bcase\s+\w+\s+of\b/, 2],
    [/\breceive\b[\s\S]{0,200}\bend\b/, 2],
  ],
  elixir: [
    [/\bdefmodule\s+\w+(?:\.\w+)*\s+do\b/, 4],
    [/\bdefp?\s+\w+\s*\(/, 3],
    [/@moduledoc\b/, 4],
    [/\|>\s*(?:Enum|Map|List|Stream)\./, 4],
    [/\bIO\.(?:puts|inspect)\s*\(/, 3],
    [/\bdo:\s/, 1],
  ],
  ocaml: [
    [/\blet\s+rec\s+\w+/, 4],
    [/^\s*module\s+\w+\s*=\s*struct\b/m, 4],
    [/\bPrintf\.(?:printf|sprintf)\b/, 3],
    [/\bmatch\s+[\s\S]{0,80}\bwith\b/, 2],
    [/\btype\s+\w+\s*=[\s\S]{0,120}\|/, 2],
    [/^\s*open\s+[A-Z]\w*/m, 1],
  ],
  bash: [
    [/^#!.*\b(?:bash|sh)\b/, 4],
    [/^\s*(?:if|while|for)\s+\[\[?/m, 3],
    [/\bset\s+-[euxo]+\b/, 3],
    [/\b(?:done|fi|esac)\b/, 2],
    [/\$\{\w+\}|\$\(\w+/, 2],
    [/\b(?:echo|export|local)\s+["'$]?[\w-]/, 1],
  ],
  powershell: [
    [/\bGet-\w+|\bSet-\w+|\bNew-\w+|\bRemove-\w+/, 4],
    [/\$PSVersionTable\b/, 4],
    [/\bWrite-(?:Host|Output|Error)\b/, 3],
    [/\|\s*(?:Where|ForEach|Select|Sort)-Object\b/, 4],
    [/\[CmdletBinding\(\)\]/, 4],
    [/^\s*param\s*\(/m, 2],
    [/\$env:\w+/, 2],
  ],
  lua: [
    [/^\s*local\s+(?:function\s+)?\w+/m, 3],
    [/\b(?:pairs|ipairs|require|pcall)\s*\(/, 3],
    [/\btable\.(?:insert|remove|concat|sort)\s*\(/, 3],
    [/\bfunction\s+[\w.:]+\s*\([^)]*\)/, 2],
    [/\b(?:nil|~=)\b/, 2],
    [/\.\.(?!\.)\s*\w/, 2],
    [/\bprint\s*\(/, 1],
    [/\bmath\.\w+\s*\(/, 1],
  ],
  tcl: [
    [/^\s*proc\s+\w+\s*\{[^}]*\}/m, 4],
    [/\bexpr\s+\{/, 3],
    [/\bputs\s+["'$]/, 2],
    [/\bset\s+\w+\s+["'$\d[]/, 2],
    [/\[(?:exec|string|list|llength|clock)\b/, 3],
  ],
  sql: [
    [/(?<!PL\/)(?<!T-)\bSELECT\s+[\s\S]{0,120}?\s+FROM\s+(?!a\b|an\b|the\b)[\w."\[]+/i, 4],
    [/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(?:TABLE|INDEX|VIEW))\b/i, 3],
    [/\b(?:INNER|LEFT|RIGHT|FULL)\s+(?:OUTER\s+)?JOIN\b/i, 3],
    [/\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b/i, 2],
  ],
  plsql: [
    [/\bDBMS_OUTPUT\.PUT_LINE\b/i, 4],
    [/%ROWTYPE\b|%TYPE\b/i, 3],
    [/\bEXCEPTION\s+WHEN\s+\w+/i, 3],
    [/\bCURSOR\s+\w+\s+IS\b/i, 3],
    [/\bPROCEDURE\s+\w+[\s\S]{0,120}\bIS\b/i, 2],
  ],
  tsql: [
    [/\bNVARCHAR\s*\(/i, 4],
    [/\bSET\s+NOCOUNT\s+ON\b/i, 4],
    [/\[dbo\]\./i, 3],
    [/\bBEGIN\s+(?:TRY|TRAN|TRANSACTION)\b/i, 3],
    [/\bIDENTITY\s*\(/i, 3],
    [/^\s*GO\s*$/im, 3],
    [/\bDECLARE\s+@\w+/i, 3],
  ],
  scratch: [
    [/\bwhen\s+green\s+flag\s+clicked\b/i, 4],
    [/\bmove\s+\d+\s+steps\b/i, 3],
    [/\bturn\s+\d+\s+degrees\b/i, 3],
    [/\b(?:say|think|broadcast)\s+["\w]/i, 2],
    [/\b(?:sprite|costume|backdrop)\b/i, 2],
  ],
  logo: [
    [/\b(?:forward|fd)\s+\d+/i, 3],
    [/\b(?:penup|pendown)\b/i, 3],
    [/\brepeat\s+\d+\s*\[/i, 3],
    [/\b(?:right|rt|left|lt)\s+\d+/i, 2],
    [/\bturtle\b/i, 2],
  ],
  basic: [
    [/^\s*\d+\s+(?:PRINT|LET|GOTO|GOSUB|REM|INPUT|IF|FOR|NEXT|END)\b/im, 4],
    [/\bDIM\s+\w+\s*\(/i, 2],
    [/\b(?:MsgBox|InputBox)\s*\(/i, 2],
    [/\bGOTO\s+\w+/i, 3],
    [/\bPRINT\s+["']/i, 2],
  ],
  smalltalk: [
    [/\bTranscript\s+show:/, 4],
    [/\bifTrue:\s*\[|\bifFalse:\s*\[/, 4],
    [/\bself\s+\w+:/, 2],
    [/:=/, 1],
    [/\b(?:Pharo|Squeak)\b/, 2],
  ],
  prolog: [
    [/:- module\s*\(/i, 4],
    [/^\s*[a-z]\w*\s*\([^)]*\)\s*:-/m, 3],
    [/\b(?:findall|assertz|retract)\s*\(/, 3],
    [/\b\\\+/, 3],
    [/^\s*[a-z]\w*\([^)]*\)\.\s*$/m, 1],
  ],
  labview: [
    [/\b(?:front\s+panel|block\s+diagram|dataflow)\b/i, 3],
    [/\bVI\b/, 2],
    [/\b(?:wires?|controls?|indicators?|while\s+loop|for\s+loop)\b/i, 1],
  ],
  vhdl: [
    [/\blibrary\s+ieee\s*;/, 4],
    [/\buse\s+ieee\.std_logic_1164\.all\s*;/, 4],
    [/\bentity\s+\w+\s+is\b/, 3],
    [/\barchitecture\s+\w+\s+of\s+\w+\s+is\b/, 4],
    [/\bstd_logic(?:_vector)?\b/, 3],
    [/\bprocess\s*\([^)]*\)/, 2],
  ],
  verilog: [
    [/`timescale\s+\d/, 4],
    [/\bendmodule\b/, 4],
    [/\balways\s*@\s*\(\s*(?:posedge|negedge|\*)/, 4],
    [/\bmodule\s+\w+\s*(?:#\s*\([^)]*\)\s*)?\(/, 3],
    [/\b(?:input|output|inout|wire|reg)\b[^;\n]*;/, 2],
    [/\bassign\s+\w+\s*=/, 2],
  ],
  solidity: [
    [/\bpragma\s+solidity\b/, 4],
    [/\bmsg\.sender\b/, 4],
    [/\bcontract\s+\w+\s*(?:is\s+\w+\s*)?\{/, 3],
    [/\bmapping\s*\(|\baddress\s+payable\b|\buint256\b/, 2],
    [/\b(?:require|revert|modifier)\s*\(/, 1],
  ],
  apex: [
    [/\btrigger\s+\w+\s+on\s+\w+\b[\s\S]{0,40}\b(?:before|after)\s+(?:insert|update|delete)/i, 4],
    [/\bSystem\.debug\s*\(/i, 4],
    [/@AuraEnabled\b|@future\b|@InvocableMethod\b/, 3],
    [/\bDatabase\.(?:insert|update|delete|upsert)\s*\(/i, 3],
    [/\bSELECT\s+[\s\S]{0,120}\bFROM\s+\w+[\s\S]{0,80}\bLIMIT\b/i, 2],
  ],
  abap: [
    [/^\s*DATA\s*:\s*\w+\s+TYPE\b/im, 4],
    [/\bWRITE\s*:\s*\//i, 4],
    [/\bLOOP\s+AT\s+\w+/i, 3],
    [/\bTYPES\s*:\s*\w+\s+TYPE\b/i, 3],
    [/\bFORM\s+\w+[\s\S]{0,120}\bENDFORM\b/i, 3],
    [/\b(?:IF|LOOP|DO)\b[\s\S]{0,160}\bEND(?:IF|LOOP|DO)\b/i, 2],
  ],
  crystal: [
    [/\bproperty\s+\w+\s*:\s*[\w:.]+/i, 3],
    [/\bdef\s+\w+[?!]?\s*\([^)]*\)\s*(?::\s*\w+\s*)?$/m, 2],
    [/\bLibC\b|\bSlice\(/, 2],
    [/\bnil\?/, 3],
    [/\brequire\s+["'][\w\/.-]+["']/, 1],
  ],
  groovy: [
    [/\b@Grab\s*\(/, 4],
    [/\bprintln\s+/, 2],
    [/\beach\s*\{/, 2],
    [/\bdef\s+\w+\s*=/, 2],
    [/\bJenkinsfile\b/, 3],
  ],
  hack: [
    [/<\?hh\b/, 4],
    [/<<__EntryPoint>>/, 4],
    [/\bfunction\s+\w+\s*\([^)]*\)\s*:\s*(?:void|string|int|bool|vec|dict|shape)\b/, 3],
    [/\b(?:vec|dict|keyset)<[^>]+>/, 3],
    [/\bHH\\\w+/, 3],
  ],
  monkeyc: [
    [/\busing\s+Toybox\b/, 4],
    [/\b(?:Application\.AppBase|WatchUi\.\w+)/, 3],
    [/\b(?:System\.println|Toybox\.\w+)/, 2],
    [/\bfunction\s+(?:initialize|onStart|onUpdate)\b/, 3],
    [/\(\s*:\b(?:background|foreground|watch_app)\b/, 3],
  ],
};

const CODE_SIGNATURE_THRESHOLD = 4;

function detectCodeSignatures(text) {
  let best = null;
  for (const [id, signatures] of Object.entries(CODE_SIGNATURES)) {
    let score = 0;
    for (const [pattern, weight] of signatures) {
      if (pattern.test(text)) score += weight;
    }
    if (score >= CODE_SIGNATURE_THRESHOLD && (!best || score > best.score)) {
      best = { id, score };
    }
  }
  if (!best) return null;
  return {
    language: languageById(best.id),
    score: best.score,
    confidence: best.score >= 8 ? "high" : "medium",
    method: "signature",
  };
}

function contextAllowed(language, text) {
  if (language.id === "basic") {
    return (
      /\bBASIC\b/.test(text) ||
      /\b(?:QB64|FreeBASIC|GW-BASIC|VBA)\b/i.test(text) ||
      /\bbasic\s+(?:code|program|dialect|syntax|script|compiler|interpreter)\b/i.test(text)
    );
  }
  if (language.id === "scratch") {
    return (
      /\bScratch\b/.test(text) ||
      /\bscratch\s+(?:code|program|project|blocks?|sprites?)\b/i.test(text) ||
      /\bgreen\s+flag\b/i.test(text)
    );
  }
  if (language.id === "logo") {
    return (
      /\bLogo\b/.test(text) ||
      /\blogo\s+(?:code|program|language|turtle)\b/i.test(text) ||
      /\bturtle\s+graphics\b|\b(?:penup|pendown)\b/i.test(text)
    );
  }
  return true;
}

function embeddedMention(text, index, length) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const newline = text.indexOf("\n", index);
  const lineEnd = newline === -1 ? text.length : newline;
  const before = text.slice(lineStart, index);
  const after = text.slice(index + length, lineEnd);
  if (/(?:\bimport|\brequire)\b[^;\n]*$/i.test(before) && /^[\s"'`),;]*$/.test(after)) {
    return true;
  }
  const line = text.slice(lineStart, lineEnd);
  if (!/[=;:(){}[\],]/.test(line)) return false;
  let quote = null;
  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (quote) {
      if (ch === quote && before[i - 1] !== "\\") quote = null;
    } else if (ch === '"' || ch === "`") {
      quote = ch;
    }
  }
  return quote !== null;
}

function scanSection(text, { useFences = true } = {}) {
  if (useFences) {
    for (const match of text.matchAll(/```[ \t]*([\w+#./-]+)/g)) {
      const language = languageByFence(match[1]);
      if (language) {
        return { language, method: "fence", confidence: "high", score: 10 };
      }
    }
  }

  const candidates = [];
  for (const language of LANGUAGES) {
    if (language.contextOnly) {
      if (!contextAllowed(language, text)) continue;
      const hit = contextScore(language, text);
      if (hit && !embeddedMention(text, hit.index, hit.length)) {
        candidates.push({ language, ...hit });
      } else if (language.signals) {
        for (const signal of language.signals) {
          const match = signal.exec(text);
          if (match) {
            candidates.push({ language, index: match.index, length: match[0].length });
            break;
          }
        }
      }
      continue;
    }
    for (const source of plainPatterns(language)) {
      const match = regexMatch(source, text);
      if (match && !embeddedMention(text, match.index, match[0].length)) {
        candidates.push({ language, index: match.index, length: match[0].length });
      }
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length || a.index - b.index);
    return {
      language: candidates[0].language,
      method: "mention",
      confidence: "high",
      score: candidates[0].length,
    };
  }

  const fromCode = detectCodeSignatures(text);
  if (fromCode) return fromCode;

  for (const language of LANGUAGES) {
    for (const extension of language.extensions || []) {
      const pattern = new RegExp(`${escapeRegExp(extension)}(?![\\w])`, "i");
      if (pattern.test(text)) {
        return { language, method: "extension", confidence: "low", score: 1 };
      }
    }
  }

  return null;
}

function earliestLanguage(text) {
  let best = null;
  for (const language of LANGUAGES) {
    for (const source of anyPatterns(language)) {
      let match = null;
      try {
        match = new RegExp(source, "i").exec(text);
      } catch {
        continue;
      }
      if (!match) continue;
      const score = { language, index: match.index, length: match[0].length };
      if (
        !best ||
        score.index < best.index ||
        (score.index === best.index && score.length > best.length)
      ) {
        best = score;
      }
    }
  }
  return best?.language || null;
}

function frameworkByName(text) {
  const source = normalizeText(text);
  for (const framework of FRAMEWORKS) {
    const pattern = new RegExp(`(^|[^\\w])${escapeRegExp(framework.name)}([^\\w]|$)`, "i");
    if (pattern.test(source)) return { ...framework, score: 2 };
  }
  return null;
}

function bestFramework(frameworks, language) {
  for (const framework of frameworks) {
    if (frameworkApplies(framework, language)) return framework;
  }
  return null;
}

function frameworkPrecedesLanguage(text, framework, language) {
  const lower = text.toLowerCase();
  const frameworkIndex = lower.indexOf(framework.name.toLowerCase());
  if (frameworkIndex < 0) return false;
  let languageIndex = -1;
  for (const value of valuesFor(language)) {
    const index = lower.indexOf(value.toLowerCase());
    if (index >= 0 && (languageIndex < 0 || index < languageIndex)) languageIndex = index;
  }
  return languageIndex < 0 || frameworkIndex < languageIndex;
}

export function detectLanguageDetailed(text) {
  const source = normalizeText(text);
  if (!source.trim()) return null;

  const conversion = source.match(
    /\b(?:convert|port|rewrite|translate|migrate)\b[^.\n]{0,100}?\b(?:to|into|in)\b\s+(?:the\s+)?(?:language\s+)?([^.\n;]{1,80})/i,
  );
  if (conversion) {
    const target = conversion[1];
    const found = earliestLanguage(target);
    if (found) {
      const frameworks = detectFrameworks(source);
      return {
        language: found,
        method: "conversion",
        confidence: "high",
        score: 10,
        frameworks,
        framework: bestFramework(frameworks, found),
      };
    }
    const framework = frameworkByName(target);
    const language = framework ? languageById(framework.language) : null;
    if (framework && language) {
      return {
        language,
        method: "conversion",
        confidence: "high",
        score: 10,
        frameworks: [framework],
        framework,
      };
    }
  }

  const detail = scanSection(source);
  const frameworks = detectFrameworks(source);
  if (detail) {
    const framework = bestFramework(frameworks, detail.language);
    if (framework) return { ...detail, frameworks, framework };
    const primary = frameworks[0];
    if (primary && frameworkPrecedesLanguage(source, primary, detail.language)) {
      const language = languageById(primary.language);
      if (language) {
        return {
          language,
          method: "framework",
          confidence: "medium",
          score: primary.score,
          frameworks,
          framework: primary,
        };
      }
    }
    return { ...detail, frameworks, framework: null };
  }

  const framework = frameworks[0] || null;
  const language = framework ? languageById(framework.language) : null;
  if (framework && language) {
    return {
      language,
      method: "framework",
      confidence: "medium",
      score: framework.score,
      frameworks,
      framework,
    };
  }

  return null;
}

export function detectLanguage(text) {
  return detectLanguageDetailed(text)?.language || null;
}

export function detectTask(text) {
  const source = expandShorthand(normalizeText(text)).toLowerCase();
  if (
    /\b(traceback|stack trace|exception|error|errno|segmentation fault|segfault|panic|failed to|does(?:n't| not) compile|won't compile|cannot compile|can't compile|does(?:n't| not) build|won't build|unhandled|uncaught|cannot read|typeerror|syntaxerror|nullpointer\w*|null pointer|exit code|core dumped|throws|throwing|blows up)\b/.test(
      source,
    )
  ) {
    return "error";
  }
  if (
    /\b(?:security|vulnerab\w*|exploit\w*|injection|xss|csrf|ssrf|owasp|privilege escalation|authentication bypass|authorization bypass|hardcoded? (?:secret|password|token|key)|leaked? (?:secret|token|key|credential)|unsafe deserialization|path traversal|directory traversal|insecure|sanitiz\w*|encrypt\w*|decrypt\w*|hash(?:ing)? passwords?)\b/.test(
      source,
    )
  ) {
    return "security";
  }
  if (
    /\b(fix|bug|broken|fails?|failing|not working|isn't working|doesn't work|does not work|won't work|regression|debug|wrong output|wrong result|wrong value|wrong answer|incorrect|unexpected|crash\w*|hangs?|freezes?|what's wrong|what is wrong|something's off|misbehav\w*|not right|messed up|going wrong|keeps? failing)\b/.test(
      source,
    )
  ) {
    return "fix";
  }
  if (
    /\b(?:refactor\w*|clean\s+up|restructure|simplify|deduplicat\w*|reduce duplication|design pattern|solid principles?|split (?:this|it|the) (?:function|class|file|module))\b/.test(
      source,
    )
  ) {
    return "refactor";
  }
  if (
    /\b(review|audit|best practice|look at this|check this|check my|sanity check|any issues|thoughts on|is this (ok|good|correct|fine)|improve my code|suggest improvements|feedback on|look over)\b/.test(
      source,
    )
  ) {
    return "review";
  }
  if (
    /\b(?:explain|walk me through|what does|how does|why does|meaning of|break (?:this|it) down|what(?:'s| is) happening)\b/.test(
      source,
    )
  ) {
    return "explain";
  }
  if (
    /\b(?:install|set\s?up|configure|configuration|environment variables?|dependencies|dependency|package\.json|requirements\.txt|dockerfile|docker compose|ci\/cd|deploy(?:ment)?|virtualenv|venv|getting started)\b/.test(
      source,
    )
  ) {
    return "setup";
  }
  if (/\b(tests?|unit tests?|pytest|jest|junit|coverage|test this|test my)\b/.test(source)) return "tests";
  if (/\b(optimi[sz]e|performance|slow|faster|memory usage|speed up|takes forever|too slow|laggy|reduce memory|too much memory)\b/.test(source)) return "optimize";
  if (/\b(convert|port|rewrite|translate|migrate)\b[^.\n]*\b(?:to|into|in)\b/.test(source)) return "convert";
  if (/\b(?:document(?:ation)?|docstrings?|jsdoc|readme|api docs?|add comments?|comment this code)\b/.test(source)) {
    return "document";
  }
  if (
    /\b(?:architect\w*|system design|(?:system|api|service|database|schema)\s+design|design\s+(?:a|an|the)\s+(?:[\w-]+\s+){0,3}(?:system|service|api|app|application|database|schema|pipeline|module)|data model|database schema|project structure)\b/.test(
      source,
    )
  ) {
    return "design";
  }
  if (/\b(explain|what does|how does|walk me through|understand|what is|what are|what's|why does|meaning of|break (?:this|it) down|what(?:'s| is) happening)\b/.test(source)) return "explain";
  return "write";
}

export function buildCodingPrompt({ languageId, taskId, userText }) {
  const language = languageById(languageId) || (languageId === "auto" ? detectLanguage(userText) : null);
  const resolvedTask = taskById(taskId === "auto" ? detectTask(userText) : taskId);
  const parts = ["Coding context:"];

  if (language) {
    const version = language.version ? ` Target ${language.version}.` : "";
    parts.push(`Language: ${language.name}.${version} ${language.guidance}`);
    if (language.toolchain) parts.push(`Assume ${language.toolchain} unless the user says otherwise.`);
    if (language.kind === "markup") {
      parts.push(`${language.name} is a markup language, not a general-purpose programming language. Produce valid ${language.name} and explain how it is used.`);
    }
    if (language.kind === "data") {
      parts.push(`${language.name} is a data format. Keep it valid and say which tool consumes it.`);
    }
    if (language.kind === "stylesheet") {
      parts.push(`${language.name} is a stylesheet language. Answer with valid selectors and properties.`);
    }
    if (language.kind === "visual") {
      parts.push(`${language.name} is not written as ordinary text code. Describe the exact steps or blocks a user must create.`);
    }
    if (language.kind === "educational") {
      parts.push(`${language.name} is an educational language. Favor short, readable examples.`);
    }
    if (language.tier === "specialized") {
      parts.push(
        "This language has limited representation in small models. Prefer standard, well-established constructs, state version assumptions, and say when you are unsure instead of inventing APIs.",
      );
    }
    parts.push(`Use a \`\`\`${language.fence} fenced block for ${language.name}.`);
  } else {
    parts.push(
      "Language: infer it from the request. If it stays ambiguous, ask one short question before writing a large program. Use the correct fence tag for the chosen language.",
    );
  }

  if (resolvedTask.instruction) {
    parts.push(`Task: ${resolvedTask.instruction.replaceAll("{language}", language?.name || "the target language")}`);
  }

  return parts.join("\n");
}

export function coderSuggestions() {
  return [
    "Review this React component for security and accessibility",
    "Write a Django endpoint with input validation",
    "Fix this Go error: all goroutines are asleep - deadlock",
    "Design a REST API for bookings with tests",
  ];
}
