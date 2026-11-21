#!/usr/bin/env node
// Capture the launch material from the real app, and prove the privacy claim at
// the same time.
//
//   node scripts/screenshots.mjs
//
// Writes to docs/screenshots/:
//   - welcome-dark.png, welcome-light.png
//   - chat-dark.png, chat-light.png
//   - settings.png, mobile.png
//   - network-log.txt   every request the app made during the run
//
// The app is served from the built preview, so what you see is what ships. No
// model is downloaded: on-device inference needs WebGPU, which a capture machine
// may not have, and the built-in assistant is the honest default to show.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const OUT = "docs/screenshots";
const VIEWPORT = { width: 1440, height: 900 };
const PROMPT = "Write a Python program for FizzBuzz.";
const PORT = 4183;
const APP_URL = `http://127.0.0.1:${PORT}/`;

/** Serve the built app. `npm run screenshots` builds first. */
async function previewServer() {
  const child = spawn(`npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`, {
    stdio: "ignore",
    shell: true,
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) {
        return {
          url: APP_URL,
          stop: () => child.kill(),
        };
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill();
  throw new Error("The preview server did not start. Run `npm run build` first.");
}

/** The app follows the system theme, so drive it to the theme we want to shoot. */
async function setTheme(page, theme) {
  const current = await page.evaluate(() => document.documentElement.dataset.theme);
  if (current !== theme) {
    await page.locator("#theme-toggle").click();
    await page.waitForFunction(
      (expected) => document.documentElement.dataset.theme === expected,
      theme,
      { timeout: 5000 },
    );
    await page.waitForTimeout(350);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await previewServer();
  const browser = await chromium.launch();

  const requests = [];
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    // The app follows the system theme by default, and Playwright's default is
    // light; pin it so "dark" really is dark.
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("request", (request) => {
    requests.push(`${request.method()} ${request.url()}`);
  });

  try {
    await page.goto(server.url, { waitUntil: "networkidle" });
    await page.waitForSelector(".welcome");

    await setTheme(page, "dark");
    await page.screenshot({ path: `${OUT}/welcome-dark.png` });
    await setTheme(page, "light");
    await page.screenshot({ path: `${OUT}/welcome-light.png` });
    await setTheme(page, "dark");

    // A prompt the built-in assistant answers with markdown and code, so the
    // screenshot shows the rendering rather than a "load a model" fallback.
    await page.locator("#input").fill(PROMPT);
    await page.locator("#send").click();
    await page.locator(".msg.assistant .msg-text").last().waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector(".msg-text.streaming"), undefined, {
      timeout: 30_000,
    });
    const reply = await page.locator(".msg.assistant .msg-text").last().innerText();
    if (/load an on-device model|cannot explain|don't have a built-in recipe/i.test(reply)) {
      throw new Error(`The demo prompt was not answered by the built-in assistant: ${PROMPT}`);
    }
    // The screenshot is only worth publishing if it shows the markdown renderer.
    if ((await page.locator(".msg-text .code-block").count()) === 0) {
      throw new Error(`The demo reply had no code block, so there is nothing to show: ${PROMPT}`);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/chat-dark.png` });

    await setTheme(page, "light");
    await page.screenshot({ path: `${OUT}/chat-light.png` });
    await setTheme(page, "dark");

    await page.locator("#open-settings").click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/settings.png` });
    await page.locator("#settings-dialog [data-close-dialog]").click();
  } finally {
    await context.close();
  }

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  await phone.goto(server.url, { waitUntil: "networkidle" });
  await phone.waitForSelector(".welcome");
  await phone.screenshot({ path: `${OUT}/mobile.png` });
  await mobile.close();

  await browser.close();
  await server.stop();

  const crossOrigin = requests.filter((line) => {
    const url = line.split(" ")[1];
    return new URL(url).origin !== new URL(server.url).origin;
  });
  const report = [
    `Captured ${new Date().toISOString()} against the production build.`,
    "",
    `Requests made while capturing: ${requests.length}`,
    `Cross-origin requests: ${crossOrigin.length}`,
    "",
    ...requests.map((line) => `${line}${crossOrigin.includes(line) ? "   <-- external" : ""}`),
  ].join("\n");
  await writeFile(`${OUT}/network-log.txt`, `${report}\n`, "utf8");

  console.log(report);
  if (crossOrigin.length) {
    console.error("Unexpected cross-origin requests; the privacy claim needs a look.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
