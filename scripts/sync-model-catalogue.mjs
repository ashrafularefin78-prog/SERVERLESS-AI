import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ModelType, prebuiltAppConfig } from "@mlc-ai/web-llm";
import { format, resolveConfig } from "prettier";

const models = prebuiltAppConfig.model_list
  .filter((model) => model.model_type !== ModelType.embedding)
  .map((model) => ({
    id: model.model_id,
    vramMB: model.vram_required_MB ?? null,
    requiredFeatures: model.required_features ?? [],
    bufferSizeBytes: model.buffer_size_required_bytes ?? 0,
    contextWindow: model.overrides?.context_window_size ?? null,
    vision: model.model_type === ModelType.VLM,
  }));

const target = new URL("../src/engine/model-catalogue.json", import.meta.url);
const source = await format(JSON.stringify(models), {
  ...(await resolveConfig(fileURLToPath(target))),
  parser: "json",
});
await writeFile(target, source);
console.log(`Synced ${models.length} chat models from the installed WebLLM catalogue.`);
