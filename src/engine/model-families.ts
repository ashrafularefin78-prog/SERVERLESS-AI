import type { LocalModel } from "./models.js";

/**
 * Family rules, most specific first. Families keep the picker navigable once
 * the catalogue runs to hundreds of community builds.
 */
const FAMILY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/qwen3\.5/i, "Qwen3.5"],
  [/qwen3/i, "Qwen3"],
  [/qwen2\.5/i, "Qwen2.5"],
  [/qwen2/i, "Qwen2"],
  [/llama[\s._-]*3\.2/i, "Llama 3.2"],
  [/llama[\s._-]*3\.1/i, "Llama 3.1"],
  [/llama[\s._-]*3/i, "Llama 3"],
  [/llama/i, "Llama"],
  [/gemma 4/i, "Gemma 4"],
  [/gemma 3/i, "Gemma 3"],
  [/gemma 2/i, "Gemma 2"],
  [/gemma/i, "Gemma"],
  [/deepseek r1 distill/i, "DeepSeek R1 Distill"],
  [/deepseek/i, "DeepSeek"],
  [/granite/i, "Granite"],
  [/falcon/i, "Falcon"],
  [/olmo/i, "OLMo"],
  [/\byi\b/i, "Yi"],
  [/tinyllama/i, "TinyLlama"],
  [/smollm/i, "SmolLM"],
  [/mistral nemo/i, "Mistral Nemo"],
  [/mistral small/i, "Mistral Small"],
  [/mixtral/i, "Mixtral"],
  [/mistral/i, "Mistral"],
  [/phi-?3\.5|phi 3\.5/i, "Phi-3.5"],
  [/phi/i, "Phi"],
  [/minicpm/i, "MiniCPM"],
  [/internlm/i, "InternLM"],
  [/starcoder/i, "StarCoder"],
  [/codellama/i, "CodeLlama"],
  [/mimo/i, "MiMo"],
  [/dolphin/i, "Dolphin"],
  [/ornith/i, "Ornith"],
  [/spark/i, "Spark"],
  [/qwen/i, "Qwen"],
];

export interface FamilyGroup {
  family: string;
  models: LocalModel[];
}

/** The base-model family a catalogue entry belongs to, for grouping. */
export function modelFamily(model: LocalModel): string {
  const haystack = model.runtime === "gguf" ? `${model.baseModel} ${model.label}` : model.label;
  for (const [pattern, family] of FAMILY_RULES) {
    if (pattern.test(haystack)) return family;
  }
  return "Other";
}

/**
 * Groups models by family, alphabetically, with "Other" last. Model order
 * inside a family is preserved, so hand-picked builds stay at the top.
 */
export function groupModelsByFamily(models: LocalModel[]): FamilyGroup[] {
  const groups = new Map<string, LocalModel[]>();
  for (const model of models) {
    const family = modelFamily(model);
    const group = groups.get(family);
    if (group) group.push(model);
    else groups.set(family, [model]);
  }

  return [...groups.entries()]
    .map(([family, group]) => ({ family, models: group }))
    .sort((a, b) => {
      if (a.family === "Other") return b.family === "Other" ? 0 : 1;
      if (b.family === "Other") return -1;
      return a.family.localeCompare(b.family);
    });
}
