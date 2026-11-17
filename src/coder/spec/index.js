import { prepare } from "./text.js";
import { readFlags } from "./flags.js";
import { EARLY } from "./families.js";
import { LATE } from "./math-families.js";

const DETECTORS = [...EARLY, ...LATE];

export function parseProgramRequest(prompt) {
  const ctx = prepare(prompt);
  if (!ctx.text) return null;
  const flags = readFlags(ctx.text);
  for (const [family, detect] of DETECTORS) {
    const params = detect(ctx, flags);
    if (params) return { family, ...params, ctx, flags };
  }
  return null;
}
