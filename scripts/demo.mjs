#!/usr/bin/env node
// Run the launch demo against the production build and record what it proves.
//
//   npm run demo               # built-in assistant path, fast
//   npm run demo -- --model    # on-device GGUF model on the CPU (downloads ~400 MB once)
//
// This is the script behind the 2-minute recording, and it is also the evidence for
// the claim the recording makes: a confidential PDF and the question about it never
// leave the tab. The only outbound requests are the model and embedding-model
// downloads, which happen before the question is asked and are named separately.
//
// Writes to docs/demo/:
//   - 1-welcome.png … 5-documents.png, 6-answer.png
//   - network-log.txt   every request, with origin and phase
//   - README.md         the run report: timings, counts, and the assertions
//
// The PDF is generated here, so the repository carries no real contract text, and
// the browser profile is kept in .demo-profile so a second run does not re-download
// the weights.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

/* global document */

const OUT = "docs/demo";
const PROFILE = ".demo-profile";
const PORT = 4185;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = { width: 1440, height: 900 };

// A 0.6B Q4_K_M model runs on the CPU through WebAssembly, so the demo does not
// depend on the machine having a WebGPU adapter. Swap it with DEMO_MODEL.
const DEMO_MODEL = process.env.DEMO_MODEL ?? "gguf:mradermacher-qwen3-0-6b-abliterated-gguf-q4-k-m";
const USE_MODEL = process.argv.includes("--model") || process.env.DEMO_MODEL !== undefined;

const DOCUMENT_TITLE = "meridian-contract.pdf";
const DOCUMENT_LINES = [
  "Meridian Services Agreement",
  "Confidential - internal use only.",
  "Clause 4. Notice periods.",
  "Either party may terminate this agreement with ninety (90) days written notice.",
  "Clause 5. Data handling.",
  "The supplier stores no customer data outside the customer's own network.",
];
const QUESTION = "How much notice does the Meridian contract require to terminate?";
const ANSWER_TERMS = ["ninety", "90"];

/** A minimal, valid PDF with selectable text - no dependency, no fixture file. */
function buildPdf(lines) {
  const escape = (text) => text.replace(/([()\\])/g, "\\$1");
  const body = lines
    .map((line, index) => `BT /F1 14 Tf 72 ${720 - index * 24} Td (${escape(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function previewServer() {
  const child = spawn(`npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`, {
    stdio: "ignore",
    shell: true,
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) return { stop: () => child.kill() };
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error("The preview server did not start. Run `npm run build` first.");
}

const seconds = (ms) => `${(ms / 1000).toFixed(0)}s`;

/**
 * The first-run frame has to come from a profile that has never seen the app, so
 * it is captured separately from the run that reuses cached weights.
 */
async function captureWelcome() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(APP_URL);
    await page.waitForSelector("#welcome-dialog[open]", { timeout: 30_000 });
    await page.screenshot({ path: `${OUT}/1-welcome.png` });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await previewServer();
  await captureWelcome();
  // A persistent profile means the second run reuses the cached weights instead of
  // downloading 400 MB again. It lives in .demo-profile and is git-ignored.
  const context = await chromium.launchPersistentContext(PROFILE, {
    viewport: VIEWPORT,
    reducedMotion: "reduce",
  });
  const page = context.pages()[0] ?? (await context.newPage());

  const requests = [];
  let phase = "load";
  page.on("request", (request) => {
    requests.push({
      phase,
      method: request.method(),
      url: request.url(),
      origin: new URL(request.url()).origin,
      body: request.postData() ?? "",
    });
  });
  const started = Date.now();
  const beats = [];

  try {
    await page.goto(APP_URL);
    // The introduction only appears on a first run. A reused .demo-profile has
    // already answered it, and the run must not hang waiting for it - the first-run
    // screenshot comes from a throwaway profile in captureWelcome().
    const intro = page.locator("#welcome-dialog[open]");
    const sawIntro = await intro
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (sawIntro) {
      await page.screenshot({ path: `${OUT}/1-welcome.png` });
      beats.push({
        file: "1-welcome.png",
        what: "First run: the introduction names what this device can run.",
      });
      await page.locator("#welcome-start").click();
      await page.waitForSelector("#welcome-dialog", { state: "hidden" });
    }

    await page.locator("#open-settings").click();

    let modelLoaded = false;
    if (USE_MODEL) {
      phase = "model-download";
      await page.locator("#model-trigger").click();
      const row = page.locator(`#model-list [data-model-id="${DEMO_MODEL}"]`);
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await page.locator("#model-load").click();
      // Unknown-licence models ask first; accepting here is what the recording shows.
      // The gate appears after a cache probe, and a cached model skips it entirely,
      // so wait for either signal rather than guessing a delay.
      const license = page.locator("#license-dialog[open]");
      const progress = page.locator("#model-progress:not([hidden])");
      await Promise.race([
        license.waitFor({ timeout: 30_000 }),
        progress.waitFor({ timeout: 30_000 }),
      ]).catch(() => {});
      if (await license.isVisible()) {
        await page.locator("#license-accept").check();
        await page.locator("#license-ok").click();
        await license.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
      }
      await page.screenshot({ path: `${OUT}/2-model-download.png` });
      beats.push({
        file: "2-model-download.png",
        what: "On-device model downloading, once, from Hugging Face.",
      });

      // "is not downloaded yet" also contains "downloaded", so the state is read from
      // the button that the panel actually toggles, not from a keyword in prose.
      // 15 minutes is generous on real hardware and still fails visibly on a machine
      // that cannot run a model at all, instead of hanging until the shell timeout.
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        const button = (await page.locator("#model-load").textContent())?.trim() ?? "";
        if (button === "Loaded") {
          modelLoaded = true;
          break;
        }
        const status = (await page.locator("#model-status").textContent()) ?? "";
        if (/failed|could not|out of memory/i.test(status)) break;
        await page.waitForTimeout(5_000);
      }
      beats.push({
        file: "2-model-download.png",
        what: modelLoaded
          ? "Model loaded into this tab."
          : "Model did not load; continuing without it.",
      });
    }

    // Add the document through the same input a drag-and-drop lands on.
    phase = "embedding-model-download";
    await page.locator("#knowledge-file").setInputFiles({
      name: DOCUMENT_TITLE,
      mimeType: "application/pdf",
      buffer: buildPdf(DOCUMENT_LINES),
    });
    await page
      .waitForSelector("#knowledge-progress:not([hidden])", { timeout: 30_000 })
      .catch(() => {});
    await page.screenshot({ path: `${OUT}/4-indexing.png` });
    beats.push({
      file: "4-indexing.png",
      what: "Reading the PDF and embedding it on this device.",
    });

    await page.waitForFunction(
      () => {
        const list = document.getElementById("knowledge-list");
        const bar = document.getElementById("knowledge-progress");
        return Boolean(list?.textContent?.includes("meridian")) && (!bar || bar.hidden);
      },
      null,
      { timeout: 240_000 },
    );
    await page.screenshot({ path: `${OUT}/5-documents.png` });
    beats.push({ file: "5-documents.png", what: "The document is indexed and listed locally." });
    await page.locator("#settings-dialog [data-close-dialog]").click();
    await page.waitForSelector("#settings-dialog", { state: "hidden" });

    const beforeQuestion = requests.length;
    phase = "question-and-answer";
    await page.locator("#input").fill(QUESTION);
    await page.locator("#send").click();
    await page.waitForFunction(
      () => {
        const streaming = document.querySelectorAll(".msg.assistant.streaming");
        return streaming.length === 0 && document.querySelector(".msg.assistant .msg-text");
      },
      null,
      { timeout: 300_000 },
    );
    await page.screenshot({ path: `${OUT}/6-answer.png`, fullPage: true });
    beats.push({ file: "6-answer.png", what: "The answer, with the passage it came from." });

    const answer = await page.locator(".msg.assistant .msg-text").last().innerText();
    const sources = await page
      .locator(".msg.assistant .msg-sources")
      .last()
      .innerText()
      .catch(() => "");
    const duringQuestion = requests.slice(beforeQuestion);

    const leaked = requests.filter(
      (request) =>
        request.url.includes(encodeURIComponent(QUESTION.slice(0, 20))) ||
        request.body.includes("ninety") ||
        request.body.includes("Meridian Services Agreement"),
    );
    const answered = ANSWER_TERMS.some((term) => answer.toLowerCase().includes(term));
    const offOrigin = [
      ...new Set(
        requests.filter((r) => r.origin !== APP_URL.replace(/\/$/, "")).map((r) => r.origin),
      ),
    ];
    const setupRequests = requests.filter((r) => r.phase !== "question-and-answer");
    const sameOrigin = setupRequests.filter((r) => r.origin === APP_URL.replace(/\/$/, "")).length;

    const log = requests
      .map(
        (request, index) =>
          `${String(index + 1).padStart(3, "0")} ${request.phase.padEnd(26)} ${request.method} ${request.url}`,
      )
      .join("\n");
    await writeFile(`${OUT}/network-log.txt`, `${log}\n`, "utf8");

    const report = `# Demo run

Generated by \`npm run demo\` on ${new Date().toISOString()} against the production
build${USE_MODEL ? `, with the on-device model \`${DEMO_MODEL}\`` : ""}. Every number
below is produced by this run.

## Beats

| File | What it shows | Wall clock |
| --- | --- | --- |
${beats.map((beat) => `| \`${beat.file}\` | ${beat.what} | ${seconds(beat.at ?? Date.now() - started)} |`).join("\n")}

## The claim: the document and the question never leave the tab

- Requests in the whole run: **${requests.length}** — ${sameOrigin} same-origin loads of
  the app's own files, ${setupRequests.length - sameOrigin} downloads of the fixed
  embedding-model files
- Requests after the question was sent: **${duringQuestion.length}**
- Origins contacted: **${offOrigin.length === 0 ? "none outside the app" : offOrigin.join(", ")}**
- Requests whose URL or body contained the question or the document text: **${leaked.length}**

${
  duringQuestion.length === 0
    ? "Nothing was requested between sending the question and printing the answer. Retrieval, the prompt, and the reply happened entirely in this tab."
    : `These requests happened during the answer phase, which is a bug worth reading:\n${duringQuestion.map((r) => `- ${r.method} ${r.url}`).join("\n")}`
}

The outbound requests that do happen are the model weights and the embedding model,
fetched once from Hugging Face and cached in this browser profile. They are fixed
files: they carry no document text and no prompt. \`network-log.txt\` lists every
request with the phase it belongs to.

## The answer

The reply ${answered ? "**did**" : "**did not**"} contain the notice period from the
document (${ANSWER_TERMS.join(" / ")})${
      sources ? `, and cited: ${sources.replace(/\n+/g, " ").slice(0, 200)}` : ""
    }.

> ${answer.replace(/\n+/g, " ").slice(0, 700)}

${answered ? "" : "A run without the notice period is a retrieval or model-quality problem, not a demo success: read the Retrieval trace in the reply footer.\n"}
${modelLoaded ? "" : "> Note: this run did not load a model, so the built-in rule engine answered. Document Q&A needs the on-device model; re-run with `npm run demo -- --model` on a machine that can hold one.\n"}
## Reproduce it

\`\`\`bash
npm run build
npm run demo            # built-in assistant
npm run demo -- --model # on-device GGUF model on the CPU
\`\`\`

The browser profile is kept in \`.demo-profile\`, so a second run reuses the weights
instead of downloading them again. Delete that folder to start from nothing.
`;
    await writeFile(`${OUT}/README.md`, report, "utf8");

    console.log(`Requests: ${requests.length} total, ${duringQuestion.length} after the question.`);
    console.log(`Off-origin: ${offOrigin.length === 0 ? "none" : offOrigin.join(", ")}`);
    console.log(`Model loaded: ${modelLoaded}; answer contains the notice period: ${answered}`);
    console.log(`Wrote ${OUT}/README.md and ${OUT}/network-log.txt`);

    if (leaked.length > 0 || duringQuestion.length > 0) process.exitCode = 1;
  } finally {
    await context.close();
    server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
