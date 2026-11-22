// Guards the workflow files themselves. A workflow that fails to parse, or a job
// that is missing a runner, fails the whole run at startup with no logs, which is
// exactly how a broken CI goes unnoticed for weeks.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

export const WORKFLOWS_DIR = path.join(process.cwd(), ".github", "workflows");

const SHA = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const VERSION_COMMENT = /^#\s*v\d+(\.\d+)*$/;

/**
 * Every `uses:` line in the raw source, with its trailing comment. The parsed
 * document drops comments, and the version comment is the part Dependabot reads.
 */
export function actionRefs(source) {
  const refs = [];
  for (const match of source.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)) {
    refs.push({ ref: match[1], comment: match[2].trim() });
  }
  return refs;
}

/**
 * Problems with one workflow file. `null` means the file is not valid YAML, which
 * is reported instead of a stack trace.
 */
export function checkWorkflow(name, source) {
  let doc;
  try {
    doc = parse(source);
  } catch (error) {
    return [`${name}: not valid YAML (${error.message.split("\n")[0]})`];
  }

  const problems = [];
  if (!doc || typeof doc !== "object") return [`${name}: empty workflow`];
  if (!("on" in doc) && !("true" in doc)) problems.push(`${name}: no trigger defined`);

  const jobs = doc.jobs ?? {};
  if (!Object.keys(jobs).length) problems.push(`${name}: no jobs defined`);

  for (const [id, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object") {
      problems.push(`${name}: job "${id}" is not an object`);
      continue;
    }
    // A job either runs steps on a runner, or calls a reusable workflow. A job
    // with neither is a startup failure ("no runner" / "no steps").
    const callsWorkflow = typeof job.uses === "string";
    if (callsWorkflow) {
      if (job["runs-on"]) problems.push(`${name}: job "${id}" sets runs-on and uses`);
      if (job.steps) problems.push(`${name}: job "${id}" sets steps and uses`);
    } else if (!job["runs-on"]) {
      problems.push(`${name}: job "${id}" has neither runs-on nor a reusable workflow`);
    }
    if (!callsWorkflow && !Array.isArray(job.steps)) {
      problems.push(`${name}: job "${id}" has no steps`);
    }
  }

  for (const { ref, comment } of actionRefs(source)) {
    if (ref.startsWith("./")) continue;
    if (!SHA.test(ref)) {
      problems.push(`${name}: "${ref}" is not pinned to a commit SHA`);
      continue;
    }
    // The version comment is what Dependabot reads to bump the pin.
    if (!VERSION_COMMENT.test(comment)) {
      problems.push(`${name}: "${ref}" has no "# vX.Y.Z" version comment`);
    }
  }

  // A job that calls a reusable workflow can only grant permissions it names.
  // Leaving them implicit is how the OSV call broke: the called workflow asked
  // for `actions: read` and the run failed at startup.
  for (const [id, job] of Object.entries(jobs)) {
    if (job?.uses && !job.permissions) {
      problems.push(`${name}: job "${id}" calls a reusable workflow without permissions`);
    }
  }

  return problems;
}

/** Check every workflow file in a directory. */
export async function checkWorkflows(dir = WORKFLOWS_DIR) {
  const files = (await readdir(dir)).filter((file) => /\.ya?ml$/.test(file)).sort();
  const problems = [];
  for (const file of files) {
    const source = await readFile(path.join(dir, file), "utf8");
    problems.push(...checkWorkflow(file, source));
  }
  return { checked: files.length, problems };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { checked, problems } = await checkWorkflows();
  if (problems.length) {
    for (const problem of problems) console.error(` - ${problem}`);
    console.error(`\n${problems.length} problem(s) in ${checked} workflow file(s).`);
    process.exit(1);
  }
  console.log(`Checked ${checked} workflow files: pinned, parseable, and runnable.`);
}
