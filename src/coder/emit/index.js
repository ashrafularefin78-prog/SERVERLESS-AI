import { CEmitter } from "./c.js";
import { CppEmitter } from "./cpp.js";
import { JavaEmitter } from "./java.js";
import { CSharpEmitter } from "./csharp.js";
import { PythonEmitter } from "./python.js";
import { JsEmitter } from "./js.js";
import { GoEmitter } from "./go.js";
import { renameReserved } from "./names.js";

const EMITTERS = {
  c: [CEmitter],
  cpp: [CppEmitter],
  java: [JavaEmitter],
  csharp: [CSharpEmitter],
  python: [PythonEmitter],
  javascript: [JsEmitter],
  typescript: [JsEmitter, { typescript: true }],
  go: [GoEmitter],
};

export const EMITTABLE_LANGUAGES = Object.keys(EMITTERS);

export function canEmit(langId) {
  return Object.hasOwn(EMITTERS, langId);
}

export function emitProgram(prog, langId, options = {}) {
  const entry = EMITTERS[langId];
  if (!entry) throw new Error(`No emitter for ${langId}`);
  const [Emitter, defaults = {}] = entry;
  const emitter = new Emitter(renameReserved(prog, langId), { ...defaults, ...options });
  const code = emitter.emit();
  return { code, notes: [...(emitter.notes || [])] };
}
