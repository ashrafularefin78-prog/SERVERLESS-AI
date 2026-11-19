// On-device model evaluation.
//
//   npm run evals:model                 replay the last recording, gate on baseline
//   npm run evals:model:record          drive the real WebGPU model and record replies
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
const EVAL_PORT = 5199;

function parseArgs(argv) {
  const args = { record: false, updateBaseline: false, headed: false, help: false };
  for (const arg of argv) {
    if (arg === "--record") args.record = true;
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

async function record(cases, args) {
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
      // The app builds the system prompt from the composer's mode selector, so
      // every case must be recorded in the mode it declares (general by default).
      await page.selectOption("#mode-select", testCase.mode || "general");
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

    await page.selectOption("#mode-select", "general");

    const recording = {
      modelId,
      recordedAt: new Date().toISOString(),
      app: "LocalMind",
      cases: recordedCases,
    };
    await writeFile(recordedPath, `${JSON.stringify(recording, null, 2)}\n`);
    console.log(`\nWrote ${path.relative(root, recordedPath)}`);

    const results = cases.map((testCase) => {
      const entry = recordedCases.find((item) => item.id === testCase.id);
      return evaluateCase(testCase, entry);
    });
    report(results);

    if (args.updateBaseline) {
      await writeFile(baselinePath, `${JSON.stringify(toBaseline(recording, results), null, 2)}\n`);
      console.log(`Wrote ${path.relative(root, baselinePath)}`);
    }

    if (results.some((result) => !result.passed)) process.exit(1);
  } finally {
    await context?.close().catch(() => {});
    server.kill();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/model-eval.mjs [--record] [--model=<id>] [--update-baseline] [--headed]",
    );
    return;
  }

  if (args.record) {
    const cases = await readJson(casesPath);
    await record(cases, args);
    return;
  }

  await replay(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
