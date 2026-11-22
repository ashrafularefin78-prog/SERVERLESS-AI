// Inspect model metadata from the installed WebLLM package and flag models
// whose upstream licence is missing or not on the project's allowlist.
//
// The curated table lives in src/engine/model-license-table.json, the same file
// the app reads, so this report and the in-app licence gate cannot disagree.
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { readFile, writeFile } from "node:fs/promises";

const readJson = async (relative) =>
  JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));

const records = await readJson("../src/engine/model-catalogue.json");
const curated = (await readJson("../src/engine/model-license-table.json")).map((entry) => ({
  ...entry,
  pattern: new RegExp(entry.pattern, entry.flags),
}));
const upstream = new Map(prebuiltAppConfig.model_list.map((model) => [model.model_id, model]));
const allowlist = new Set(["Apache-2.0", "MIT", "BSD-3-Clause"]);
const models = records.map((record) => {
  const source = upstream.get(record.id);
  const entry = curated.find((candidate) => candidate.pattern.test(record.id));
  // WebLLM's runtime catalogue currently omits licence metadata. A curated record
  // is authoritative; otherwise the licence is unknown, never guessed from a name.
  const license = entry?.id ?? source?.license ?? null;
  return {
    id: record.id,
    license,
    licenseName: entry?.name ?? null,
    source: entry ? "curated" : source?.license ? "upstream" : "unverified",
    licenseUrl: entry?.url ?? null,
    modelType: record.vision ? "vision-language" : "text",
    status: !license ? "unknown" : allowlist.has(license) ? "allowed" : "review-required",
  };
});
const curatedCount = models.filter((model) => model.source === "curated").length;

const inventory = {
  generatedAt: new Date().toISOString(),
  source: "@mlc-ai/web-llm prebuiltAppConfig plus src/engine/model-catalogue.json",
  note: "This inventory records model catalogue metadata only. It does not identify training data or independently verify upstream licence claims.",
  models,
};

const output = process.argv[2];
if (output) {
  await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Wrote ${output}`);
} else {
  const unknown = models.filter((model) => model.status === "unknown");
  const review = models.filter((model) => model.status === "review-required");
  console.log(`Model metadata inventory: ${models.length} models`);
  console.log(`Verified by the curated table: ${curatedCount}`);
  console.log(`Known allowlisted licenses: ${models.length - unknown.length - review.length}`);
  console.log(`Unknown license: ${unknown.length}; review required: ${review.length}`);
  if (unknown.length || review.length) {
    console.log("See AI-BOM output for per-model status; do not treat this as legal advice.");
  }
}
