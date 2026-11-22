// Performance budget for the initial production payload. The app is model-free:
// everything it needs ships in this payload.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
// Raised from 260 kB to 264 kB when the first-run introduction and the indexing
// progress bar landed: those are UI the app needs on load, not optional extras.
// The measured next saving is large and known - highlight.js costs ~72 kB gzip of
// this payload and is only needed once a reply contains a code block - so the
// budget should come back down when that is deferred, not creep up again.
const BUDGET_BYTES = 264 * 1024;

let html;
try {
  html = await readFile(path.join(dist, "index.html"), "utf8");
} catch {
  console.error("dist/index.html is missing. Run `npm run build` first.");
  process.exit(1);
}

const files = new Set(["index.html"]);

for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  files.add(match[1]);
}
for (const match of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
  files.add(match[1]);
}

const rows = [];
let total = 0;

for (const relative of files) {
  const file = path.join(dist, relative.replace(/^\.\//, ""));
  const contents = await readFile(file);
  const gzip = gzipSync(contents).length;
  total += gzip;
  rows.push({ file: relative, gzip });
}

rows.sort((a, b) => b.gzip - a.gzip);
for (const row of rows) {
  console.log(`${(row.gzip / 1024).toFixed(1).padStart(7)} kB  ${row.file}`);
}

const totalKb = (total / 1024).toFixed(1);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(1);
console.log(`\nInitial payload: ${totalKb} kB gzip (budget ${budgetKb} kB)`);

if (total > BUDGET_BYTES) {
  console.error("Performance budget exceeded. Reduce the initial payload or justify a new budget.");
  process.exit(1);
}
