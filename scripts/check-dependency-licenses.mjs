// Licence inventory for the dependencies that end up in the shipped bundle.
//
// The question this answers is narrow and legal-adjacent: "is anything copyleft
// shipping inside the app?" A copyleft dependency (GPL, AGPL, LGPL for static
// linking) in a bundle that a browser downloads is the kind of thing an auditor
// asks about, and guessing from a package name is how projects get it wrong.
//
// It reads the installed tree, not package.json: licences live in each package's
// own package.json, and `npm ls` knows what is actually installed.
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Licences that are fine to bundle. Anything else needs a human decision. */
const PERMISSIVE = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
  "Zlib",
]);

/** Copyleft that would force the app's own source to be distributed. */
const COPYLEFT = /\b(?:A?GPL|LGPL|SSPL|OSL|EPL|CPL|MPL-2\.0|CDDL)/i;

export function classify(license) {
  const text = String(license ?? "").trim();
  if (!text) return "unknown";
  const bare = text.replace(/[()]/g, "").trim();

  // SPDX expressions are not single licences. `OR` means the consumer chooses, so
  // one permissive alternative is enough; `AND` means both apply, so the strictest
  // part decides. DOMPurify's "(MPL-2.0 OR Apache-2.0)" is Apache-2.0 by choice.
  const alternatives = bare.split(/\s+OR\s+/i).map((part) => part.trim());
  if (alternatives.some((part) => PERMISSIVE.has(part))) return "permissive";

  const conjuncts = bare
    .split(/\s+AND\s+/i)
    .flatMap((part) => part.split(/\s+OR\s+/i))
    .map((part) => part.trim());
  if (conjuncts.some((part) => COPYLEFT.test(part))) {
    // Every remaining alternative is copyleft or unknown; a human decides.
    return COPYLEFT.test(bare) ? "copyleft" : "review";
  }

  if (PERMISSIVE.has(bare)) return "permissive";
  if (alternatives.length > 1) return "review";
  return "review";
}

/**
 * Packages that never reach the browser bundle: native binaries and build tooling
 * for Node-only libraries. They are still installed, so they are listed rather than
 * silently dropped; the note says why they are not shipped.
 */
const NOT_SHIPPED = [
  { pattern: /^@img\/sharp/, why: "optional native binaries for sharp, a Node-only image library" },
  { pattern: /^sharp$/, why: "Node-only image library, replaced in the browser by canvas code" },
];

/** Normalise a package.json licence field, which may be a string or an object. */
export function licenseOf(manifest) {
  if (!manifest || typeof manifest !== "object") return "";
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license && typeof manifest.license.type === "string") return manifest.license.type;
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((entry) => (typeof entry === "string" ? entry : entry?.type))
      .filter(Boolean)
      .join(" OR ");
  }
  return "";
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** Every installed package name -> manifest, including nested copies. */
export async function readInstalled(root = process.cwd()) {
  const packages = new Map();
  const lock = await readJson(path.join(root, "package-lock.json")).catch(() => null);
  if (lock?.packages) {
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (!key.startsWith("node_modules/")) continue;
      const name =
        entry.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      if (entry.dev) continue;
      packages.set(name, { name, version: entry.version ?? "", license: entry.license ?? "" });
    }
  }
  return packages;
}

function notShippedReason(name) {
  return NOT_SHIPPED.find((entry) => entry.pattern.test(name))?.why ?? null;
}

export async function auditLicenses(root = process.cwd()) {
  const packages = await readInstalled(root);
  const rows = [...packages.values()]
    .map((entry) => ({
      ...entry,
      notShipped: notShippedReason(entry.name),
      verdict: classify(entry.license),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const shipped = rows.filter((row) => !row.notShipped);
  // Counts describe what actually ships, so they add up to `total`.
  const byVerdict = shipped.reduce((counts, row) => {
    counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
    return counts;
  }, {});
  return {
    total: shipped.length,
    byVerdict,
    // Only the rows a human has to look at, and only if they are actually shipped.
    attention: shipped.filter(
      (row) => row.verdict === "copyleft" || row.verdict === "unknown" || row.verdict === "review",
    ),
    notShipped: rows.filter((row) => row.notShipped),
    rows,
  };
}

const invokedDirectly = process.argv[1]?.endsWith("check-dependency-licenses.mjs");
if (invokedDirectly) {
  const report = await auditLicenses();
  console.log(`Dependencies audited: ${report.total}`);
  for (const [verdict, count] of Object.entries(report.byVerdict)) {
    console.log(`  ${verdict}: ${count}`);
  }
  if (report.notShipped.length) {
    console.log(
      `Not shipped to the browser: ${report.notShipped.length} package(s) (${report.notShipped[0].notShipped})`,
    );
  }
  if (report.attention.length) {
    console.log("\nNeeds a human decision:");
    for (const row of report.attention) {
      console.log(
        `  ${row.name}@${row.version} - ${row.license || "no licence field"} (${row.verdict})`,
      );
    }
    // Copyleft in a shipped bundle is a licence problem, not a style problem.
    if (report.byVerdict.copyleft) {
      console.error("\nCopyleft dependencies are installed. Review before shipping.");
      process.exit(1);
    }
  } else {
    console.log("\nEvery installed dependency is under a permissive licence.");
  }
  console.log(
    "\nThis is an inventory, not legal advice. Model weights are covered separately: npm run models:licenses.",
  );
}
