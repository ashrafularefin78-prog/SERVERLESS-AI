// Time to first token and tokens per second, measured in a real browser on a real
// build. Two things this is not: a leaderboard, and a substitute for running the
// model yourself. The default run measures the built-in rule engine, which needs no
// download and tells you whether the app itself is responsive; pass `--model` after
// downloading a model in the app to measure that instead.
//
// The numbers come from the app's own `MessageStats`: `usage.completion_tokens` when
// the runtime reports them, and a 4-characters-per-token estimate otherwise (the
// `estimated` flag in the output says which).
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const PORT = 4179;
const PROMPTS = [
  "Explain what a hash table is in two sentences.",
  "Write a Python function that reverses a string.",
  "What is the difference between TCP and UDP?",
];

function parseArgs(argv) {
  const options = { runs: 3, model: "", headful: false, out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runs") options.runs = Math.max(1, Number(argv[(index += 1)]) || 3);
    else if (arg === "--model") options.model = argv[(index += 1)] ?? "";
    else if (arg === "--headful") options.headful = true;
    else if (arg === "--out") options.out = argv[(index += 1)] ?? "";
  }
  return options;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The preview server did not start on ${url}.`);
}

/** Median of a numeric list; the mean hides a single slow outlier. */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarise(runs) {
  const ttft = runs.map((run) => run.ttftMs).filter((value) => typeof value === "number");
  const tps = runs.map((run) => run.tokensPerSecond).filter((value) => typeof value === "number");
  return {
    runs: runs.length,
    ttftMedianMs: median(ttft),
    tokensPerSecondMedian: tps === null ? null : Number((median(tps) ?? 0).toFixed(2)),
    estimatedTokens: runs.some((run) => run.estimated),
  };
}

async function readLatestStats(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("localmind");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = db
        .transaction("conversations", "readonly")
        .objectStore("conversations")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const messages = rows
      .flatMap((row) => row.messages ?? [])
      .filter((message) => message.role === "assistant" && message.stats);
    const last = messages.at(-1);
    return last ? last.stats : null;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    // No shell: the arguments are fixed, and a shell would re-interpret them.
    { stdio: "ignore" },
  );

  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({ headless: !options.headful });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForSelector("#input");

    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency ?? null,
      memoryGB: navigator.deviceMemory ?? null,
      webgpu: "gpu" in navigator,
    }));

    if (options.model) {
      // A model has to be downloaded and selected first; downloading gigabytes in a
      // benchmark would make the measurement a download test.
      await page.locator("#open-settings").click();
      await page.locator("#model-select").evaluate((select, modelId) => {
        select.value = modelId;
      }, options.model);
      await page.locator("#settings-dialog [data-close-dialog]").click();
      const ready = await page.evaluate(() => document.body.dataset.engine === "model");
      if (!ready) {
        throw new Error(
          `Model "${options.model}" is not loaded. Open the app, download it, then run this again.`,
        );
      }
    }

    const runs = [];
    for (let index = 0; index < options.runs; index += 1) {
      const prompt = PROMPTS[index % PROMPTS.length];
      await page.locator("#input").fill(prompt);
      const before = await page.locator(".msg.assistant .msg-text").count();
      await page.locator("#send").click();
      await page
        .locator(".msg.assistant .msg-text")
        .nth(before)
        .waitFor({ state: "visible", timeout: 120_000 });
      // Wait for streaming to stop so the stored stats are final.
      await page.waitForFunction(() => !document.querySelector(".msg-text.streaming"), undefined, {
        timeout: 120_000,
      });
      const stats = await readLatestStats(page);
      if (!stats) throw new Error("No reply statistics were recorded.");
      runs.push({ prompt, ...stats });
    }

    const summary = summarise(runs);
    const report = {
      generatedAt: new Date().toISOString(),
      app: await page.evaluate(() => document.title),
      model: options.model || "built-in rules",
      environment,
      summary,
      runs,
    };

    const stamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
    const outPath = options.out || path.join("bench", "results", `${stamp}.json`);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`\nLocalMind benchmark - ${report.model}`);
    console.log(
      `hardware: ${environment.cores ?? "?"} cores, ${environment.memoryGB ?? "?"} GB, ` +
        `WebGPU ${environment.webgpu ? "exposed" : "missing"}`,
    );
    console.log(
      `time to first token: ${summary.ttftMedianMs ?? "?"} ms (median of ${summary.runs})`,
    );
    console.log(
      `throughput: ${summary.tokensPerSecondMedian ?? "?"} tokens/s` +
        (summary.estimatedTokens ? " (estimated tokens: the runtime reported no usage)" : ""),
    );
    console.log(`wrote ${outPath}\n`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
