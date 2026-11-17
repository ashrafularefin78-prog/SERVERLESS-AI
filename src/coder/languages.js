// Programming language support for Coder mode. Each entry drives prompt
// guidance, fence labels, auto-detection, and highlighting.
// `tier: "specialized"` marks languages where small models need a warning.

import { expandShorthand, normalizeText } from "../understand.js";

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
    signals: [/\basyncio\b|\bpandas\b|\bnumpy\b|\bpip\s+install\b/i],
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
    signals: [/\bgoroutines?\b|\bgo\s+(?:func|mod|run|build|vet)\b/i],
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
    signals: [/\bcargo\b|\brustc\b|\bborrow\s+checker\b/i],
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
    signals: [/\bswiftui\b/i],
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
    signals: [/\bflutter\b|\bpubspec\b/i],
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
    signals: [/\brails\b|\brspec\b|\bgemfile\b/i],
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
    match: ["ecmascript"],
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
    fences: ["html", "html5"],
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
    kind: "markup",
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
    kind: "markup",
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
    kind: "markup",
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
    patterns: ["(?<!PL/)(?<!T-)\\bSQL(?!\\w)"],
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
    guidance:
      "Monkey C targets Garmin devices with tight memory limits. Use Toybox APIs, keep allocations small, and handle on-device constraints. State the device family and API level.",
  },
];

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
];

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

export function demoCodingReply({ prompt, systemPrompt = "" }) {
  const language = detectLanguage(prompt);
  const languageName = language?.name || "your language";
  const fence = language?.fence || "code";
  const task = detectTask(prompt);

  if (task === "error" || task === "fix") {
    return `**Built-in Coder.** I detected **${languageName}**, task **${taskById(task).label}**. I run on local rules, so I can scaffold the fix but can't diagnose a real bug on my own.

\`\`\`${fence}
// Paste the failing code and the exact error text here.
// A diagnosis would explain the root cause and show the smallest correct patch.
\`\`\`

**To get a useful answer:** include the full error, the command that produced it, the language version, and the surrounding function.`;
  }

  if (task === "review" || task === "tests" || task === "convert" || task === "optimize") {
    return `**Built-in Coder.** Detected **${languageName}**, task **${taskById(task).label}**.

\`\`\`${fence}
// ${taskById(task).label} request for ${languageName}
\`\`\`

I've attached the right coding task prompt. The built-in assistant uses local rules, so I can outline the approach but can't produce the full result on my own.`;
  }

  return `**Built-in Coder.** Detected **${languageName}**, task **${taskById(task).label}**.

\`\`\`${fence}
// Full ${languageName} code would go here, with assumptions and edge cases.
\`\`\`

I run on local rules, so I detect the language and task and scaffold the answer, but I can't write full generated code on my own. Tell me the exact function and inputs, and I'll lay out the structure.`;
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
      `${source}\\s+(?:code|program|function|script|snippet|module|class|file|compiler|runtime|error|exception|syntax|developer|programming|project|tests?|library|framework|game|animation|story|proc|turtle|closure|fiber|widget|goroutine|asyncio|lambda|monad|borrow|unit|form|macro|routine|dataframe|plot|matrix|query|trigger|contract|coroutine|ownership|optional)\\b`,
      "i",
    ),
    new RegExp(
      `\\b(?:write|fix|debug|review|explain|convert|port|test|compile|run|use|build|create|make|optimi[sz]e|refactor|translate|migrate)\\b[^.\\n]{0,50}?${source}`,
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

function scanSection(text, { useFences = true } = {}) {
  if (useFences) {
    for (const match of text.matchAll(/```[ \t]*([\w+#./-]+)/g)) {
      const language = languageByFence(match[1]);
      if (language) return language;
    }
  }

  const candidates = [];
  for (const language of LANGUAGES) {
    if (language.contextOnly) {
      const hit = contextScore(language, text);
      if (hit) {
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
      if (match) {
        candidates.push({ language, index: match.index, length: match[0].length });
      }
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length || a.index - b.index);
    return candidates[0].language;
  }

  for (const language of LANGUAGES) {
    for (const extension of language.extensions || []) {
      const pattern = new RegExp(`${escapeRegExp(extension)}(?![\\w])`, "i");
      if (pattern.test(text)) return language;
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

export function detectLanguage(text) {
  const source = normalizeText(text);
  if (!source.trim()) return null;

  const conversion = source.match(
    /\b(?:convert|port|rewrite|translate|migrate)\b[^.\n]{0,100}?\b(?:to|into|in)\b\s+(?:the\s+)?(?:language\s+)?([^.\n;]{1,80})/i,
  );
  if (conversion) {
    const found = earliestLanguage(conversion[1]);
    if (found) return found;
  }

  return scanSection(source);
}

export function detectTask(text) {
  const source = expandShorthand(normalizeText(text)).toLowerCase();
  if (
    /\b(traceback|stack trace|exception|error|errno|segmentation fault|segfault|panic|failed to|cannot read|typeerror|syntaxerror|nullpointer|null pointer|exit code|core dumped|throws|throwing|blows up)\b/.test(
      source,
    )
  ) {
    return "error";
  }
  if (
    /\b(fix|bug|broken|fails?|failing|not working|isn't working|doesn't work|does not work|won't work|regression|debug|wrong output|unexpected|crash\w*|what's wrong|something's off|misbehav\w*)\b/.test(
      source,
    )
  ) {
    return "fix";
  }
  if (
    /\b(review|audit|best practice|clean up|refactor|look at this|check this|check my|sanity check|any issues|thoughts on|is this (ok|good|correct|fine))\b/.test(
      source,
    )
  ) {
    return "review";
  }
  if (/\b(tests?|unit tests?|pytest|jest|junit|coverage|test this|test my)\b/.test(source)) return "tests";
  if (/\b(optimi[sz]e|performance|slow|faster|memory usage|speed up|takes forever|too slow|laggy)\b/.test(source)) return "optimize";
  if (/\b(convert|port|rewrite|translate|migrate)\b[^.\n]*\b(?:to|into|in)\b/.test(source)) return "convert";
  if (/\b(explain|what does|how does|walk me through|understand|what is|what are|what's|why does|meaning of)\b/.test(source)) return "explain";
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
      parts.push(`${language.name} is markup or data, not a general-purpose programming language. Produce valid ${language.name} and explain how it is used.`);
    }
    if (language.kind === "visual" || language.kind === "educational") {
      parts.push(`${language.name} is not written as ordinary text code. Describe the exact steps or blocks a user must create.`);
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
    "Write a Python function that retries a failed request",
    "Fix this JavaScript bug: TypeError: Cannot read properties of undefined",
    "Explain this C error and give the minimal fix: segmentation fault",
    "Review this Go code for bugs and edge cases",
  ];
}
