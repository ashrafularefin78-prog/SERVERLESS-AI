// On-device model evaluation.
//
//   npm run evals:model                 replay the last recording, gate on baseline
//   npm run evals:model:record          drive the real WebGPU model and record replies
//   npm run evals:model:compare         compare the four requested WebGPU candidates
//
// Replay needs no GPU and no weights, so it runs in CI. Recording is manual:
// it downloads the model once into a persistent browser profile, then asks the
// app the golden-set questions and stores the replies in
// tests/evals/model/recorded.json.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareRuns, evaluateCase, formatResults, summarize } from "./lib/model-eval.mjs";

/* global document -- the callbacks passed to page.waitForFunction run in the browser. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const casesPath = path.join(root, "tests/evals/model/cases.json");
const recordedPath = path.join(root, "tests/evals/model/recorded.json");
const baselinePath = path.join(root, "tests/evals/model/baseline.json");
const DEFAULT_MODEL = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
const MODEL_COMPARISON_IDS = [
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
  "Qwen3-1.7B-q4f32_1-MLC",
  "Qwen3.5-2B-q4f32_1-MLC",
  "SmolLM2-360M-Instruct-q4f32_1-MLC",
];
const EVAL_PORT = 5199;

/**
 * Set the assistant mode. The select lives in the settings dialog now, so set
 * the value directly and fire the same change event the UI listens for.
 */
async function setMode(page, mode) {
  await page.evaluate((value) => {
    const select = document.querySelector("#mode-select");
    if (!select) throw new Error("The assistant mode select is missing.");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, mode);
}

function parseArgs(argv) {
  const args = { record: false, compare: false, updateBaseline: false, headed: false, help: false };
  for (const arg of argv) {
    if (arg === "--record") args.record = true;
    else if (arg === "--compare") args.compare = true;
    else if (arg === "--update-baseline") args.updateBaseline = true;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readOptionalJson(file) {
  try {
    return await readJson(file);
  } catch {
    return null;
  }
}

function toBaseline(recording, results) {
  const metrics = summarize(results);
  return {
    modelId: recording.modelId,
    recordedAt: recording.recordedAt,
    passRate: metrics.passRate,
    meanMs: metrics.meanMs,
    p95Ms: metrics.p95Ms,
    meanChars: metrics.meanChars,
    cases: Object.fromEntries(
      results.map((result) => [result.id, { passed: result.passed, chars: result.chars }]),
    ),
  };
}

function report(results) {
  const metrics = summarize(results);
  console.log(`\n${formatResults(results)}\n`);
  console.log(
    `Pass rate: ${metrics.passed}/${metrics.total} (${(metrics.passRate * 100).toFixed(0)}%)` +
      `  mean ${metrics.meanChars} chars` +
      (metrics.meanMs == null ? "" : `  mean ${metrics.meanMs} ms  p95 ${metrics.p95Ms} ms`),
  );
  return metrics;
}

async function replay(args) {
  const cases = await readJson(casesPath);
  const recording = await readOptionalJson(recordedPath);

  if (!recording) {
    console.log(
      "No model recording found at tests/evals/model/recorded.json.\n" +
        "The model quality gate is armed but inactive: run `npm run evals:model:record`\n" +
        "on a machine with WebGPU to capture a baseline. Replay itself is verified by tests/unit/model-eval.test.js.",
    );
    return;
  }

  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const results = (recording.cases || []).map((entry) => {
    const testCase = byId.get(entry.id);
    if (!testCase) {
      return {
        id: entry.id,
        passed: false,
        failures: ["case no longer in cases.json"],
        chars: 0,
        ms: null,
      };
    }
    return evaluateCase(testCase, entry);
  });

  if (!results.length) {
    console.error("The recording has no cases.");
    process.exit(1);
  }

  console.log(`Model: ${recording.modelId}  recorded ${recording.recordedAt}`);
  const metrics = report(results);
  const current = {
    ...toBaseline(recording, results),
    ...metrics,
  };

  const baseline = await readOptionalJson(baselinePath);

  if (args.updateBaseline || !baseline) {
    await writeFile(baselinePath, `${JSON.stringify(toBaseline(recording, results), null, 2)}\n`);
    console.log(
      baseline
        ? "\nBaseline updated from this run."
        : "\nNo baseline existed. Wrote tests/evals/model/baseline.json from this run.",
    );
  } else {
    const { regressions, improvements } = compareRuns(baseline, current);
    for (const item of improvements) console.log(`improved: ${item}`);
    if (regressions.length) {
      console.error("\nRegressions:");
      for (const item of regressions) console.error(`  - ${item}`);
    } else {
      console.log("\nNo regressions against the baseline.");
    }
    if (regressions.length) process.exit(1);
  }

  if (results.some((result) => !result.passed)) process.exit(1);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Dev server did not answer at ${url}`);
}

async function record(cases, args, outputPath = recordedPath) {
  const modelId = args.model || DEFAULT_MODEL;
  const { chromium } = await import("@playwright/test");

  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const server = spawn(
    process.execPath,
    [viteBin, "--port", String(EVAL_PORT), "--strictPort", "--host", "127.0.0.1"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));

  const url = `http://127.0.0.1:${EVAL_PORT}/`;
  const userDataDir = path.join(root, ".cache", "model-eval-profile");
  let context;

  try {
    await waitForServer(url);
    await mkdir(userDataDir, { recursive: true });

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: !args.headed,
      args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
      timeout: 0,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30 * 60 * 1000);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.locator("#open-settings").click();
    await page.locator("#model-trigger").click();
    await page.locator(`#model-list [data-model-id="${modelId}"]`).click();
    console.log(`\nPreparing ${modelId} (first run downloads weights)...`);

    // Selecting an already-downloaded model starts loading it immediately and
    // disables the load button, so wait for that decision before clicking.
    await page
      .waitForFunction(
        () => {
          const status = document.querySelector("#model-status")?.textContent || "";
          return (
            /is loaded|Loading|Preparing/.test(status) ||
            /is not downloaded yet|is downloaded\. Load it/.test(status)
          );
        },
        null,
        { timeout: 2 * 60 * 1000 },
      )
      .catch(() => {});

    const statusText = (await page.locator("#model-status").textContent()) || "";
    const loadDisabled = await page
      .locator("#model-load")
      .isDisabled()
      .catch(() => true);

    if (!statusText.includes("is loaded") && !loadDisabled) {
      await page.locator("#model-load").click();
    } else if (
      !statusText.includes("is loaded") &&
      !(await page
        .locator("#model-progress")
        .isVisible()
        .catch(() => false))
    ) {
      throw new Error(`The on-device model cannot load here: ${statusText.trim()}`);
    }

    await page
      .locator("#model-status", { hasText: "is loaded" })
      .waitFor({ timeout: 30 * 60 * 1000 });
    await page.locator("#settings-dialog [data-close-dialog]").click();
    console.log("Model loaded. Recording replies.\n");

    const recordedCases = [];

    for (const testCase of cases) {
      // The app builds the system prompt from the assistant mode, so every case
      // must be recorded in the mode it declares (general by default).
      await setMode(page, testCase.mode || "general");
      await page.locator("#new-chat").click();
      await page.locator("#input").fill(testCase.prompt);

      const before = await page.locator(".msg.assistant .msg-text").count();
      const started = Date.now();
      await page.locator("#send").click();

      await page.waitForFunction(
        (count) => document.querySelectorAll(".msg.assistant .msg-text").length > count,
        before,
        { timeout: 5 * 60 * 1000 },
      );
      await page.waitForFunction(
        () => {
          const nodes = [...document.querySelectorAll(".msg.assistant .msg-text")];
          return nodes.length > 0 && !nodes[nodes.length - 1].classList.contains("streaming");
        },
        null,
        { timeout: 5 * 60 * 1000 },
      );

      const replyText = await page.locator(".msg.assistant .msg-text").last().innerText();
      const hasCodeBlock =
        (await page.locator(".msg.assistant").last().locator("pre code").count()) > 0;
      const ms = Date.now() - started;
      recordedCases.push({ id: testCase.id, replyText, hasCodeBlock, ms });
      console.log(
        `recorded ${testCase.id} [${testCase.mode || "general"}] (${ms} ms, ${replyText.length} chars)`,
      );
    }

    await setMode(page, "general");

    const recording = {
      modelId,
      recordedAt: new Date().toISOString(),
      app: "LocalMind",
      cases: recordedCases,
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(recording, null, 2)}\n`);
    console.log(`\nWrote ${path.relative(root, outputPath)}`);

    const results = cases.map((testCase) => {
      const entry = recordedCases.find((item) => item.id === testCase.id);
      return evaluateCase(testCase, entry);
    });
    report(results);

    if (args.updateBaseline) {
      await writeFile(baselinePath, `${JSON.stringify(toBaseline(recording, results), null, 2)}\n`);
      console.log(`Wrote ${path.relative(root, baselinePath)}`);
    }

    if (results.some((result) => !result.passed)) process.exitCode = 1;
    return { modelId, results, metrics: summarize(results) };
  } finally {
    await context?.close().catch(() => {});
    server.kill();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/model-eval.mjs [--record] [--compare] [--model=<id>] [--update-baseline] [--headed]",
    );
    return;
  }

  if (args.record || args.compare) {
    const cases = await readJson(casesPath);
    if (args.compare) {
      const comparisonDir = path.join(root, ".cache", "model-comparison");
      const comparisons = [];
      let failed = false;
      for (const modelId of MODEL_COMPARISON_IDS) {
        const safeName = modelId.replace(/[^a-z0-9.-]/gi, "_");
        try {
          const result = await record(
            cases,
            { ...args, model: modelId, updateBaseline: false },
            path.join(comparisonDir, `${safeName}.json`),
          );
          comparisons.push(result);
          if (result.results.some((item) => !item.passed)) failed = true;
        } catch (error) {
          failed = true;
          console.error(`\nComparison failed for ${modelId}:`, error);
        }
      }
      console.log("\nModel comparison summary:");
      for (const modelId of MODEL_COMPARISON_IDS) {
        const comparison = comparisons.find((entry) => entry.modelId === modelId);
        if (!comparison) {
          console.log(`${modelId}: unavailable; see error above`);
          continue;
        }
        console.log(
          `${comparison.modelId}: ${comparison.metrics.passed}/${comparison.metrics.total} passed; ` +
            `${comparison.metrics.meanChars} mean chars; ${comparison.metrics.meanMs} ms mean / ${comparison.metrics.p95Ms} ms p95`,
        );
      }
      if (failed) process.exitCode = 1;
      return;
    }
    await record(cases, args);
    return;
  }

  await replay(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
