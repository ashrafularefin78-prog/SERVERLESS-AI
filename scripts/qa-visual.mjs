// Visual QA harness: captures every key LocalMind UI state at desktop, laptop
// and phone widths so the redesign can be reviewed (and re-reviewed) by eye.
//
//   npm run dev                 # in one terminal
//   node scripts/qa-visual.mjs  # writes PNGs into qa/
//
// QA_BASE overrides the URL (defaults to the Vite dev server).
/* global document, window, getComputedStyle */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "qa";
const BASE = process.env.QA_BASE ?? "http://127.0.0.1:5173/";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];
const DRAWER = 920;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];
const note = (message) => problems.push(message);

async function settle(page, ms = 380) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
}

async function openPage(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => note(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon"))
      note(`console error: ${message.text()}`);
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await settle(page);
  return page;
}

async function ensureTheme(page, theme) {
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) === theme) return;
  await page.locator("#theme-toggle").click();
  await settle(page);
}

async function send(page, text) {
  await page.locator("#input").fill(text);
  await page.locator("#send").click();
  await page.locator(".msg.assistant .msg-text").last().waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".msg.assistant .msg-text.streaming"),
    undefined,
    { timeout: 20000 },
  );
  await settle(page);
}

async function layout(page, label) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const scroller = document.querySelector(".chat-scroll");
    const composer = document.querySelector(".composer-wrap");
    const hero = document.querySelector(".hero-orb");
    const rect = (element) => element?.getBoundingClientRect();
    return {
      overflowX: root.scrollWidth - root.clientWidth,
      scrollTop: Math.round(scroller?.scrollTop ?? 0),
      scrollRange: Math.round((scroller?.scrollHeight ?? 0) - (scroller?.clientHeight ?? 0)),
      composerGap: composer ? Math.round(window.innerHeight - rect(composer).bottom) : null,
      heroDisplay: hero ? getComputedStyle(hero).display : "absent",
      theme: root.dataset.theme,
    };
  });
  if (metrics.overflowX > 0) note(`${label}: horizontal overflow of ${metrics.overflowX}px`);
  if (metrics.composerGap !== null && Math.abs(metrics.composerGap) > 1)
    note(`${label}: composer is ${metrics.composerGap}px from the viewport bottom`);
  return metrics;
}

for (const viewport of VIEWPORTS) {
  const label = viewport.name;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await openPage(context);
  await ensureTheme(page, "dark");

  // 1. Welcome, dark, at rest.
  const welcome = await layout(page, `${label} welcome`);
  await page.screenshot({ path: `${OUT}/${label}-welcome-dark.png` });
  await page.locator(".topbar").screenshot({ path: `${OUT}/${label}-topbar-dark.png` });

  const heroTop = await page.evaluate(() => {
    const eyebrow = document.querySelector(".welcome .eyebrow");
    const scroller = document.querySelector(".chat-scroll");
    if (!eyebrow) return null;
    return {
      eyebrowTop: Math.round(eyebrow.getBoundingClientRect().top),
      scrollerTop: Math.round(scroller.getBoundingClientRect().top),
    };
  });
  if (welcome.scrollTop !== 0) note(`${label}: welcome opened scrolled to ${welcome.scrollTop}px`);
  if (heroTop && heroTop.eyebrowTop < heroTop.scrollerTop)
    note(`${label}: welcome eyebrow is clipped above the scroll area`);
  if (viewport.width >= 980 && welcome.heroDisplay === "none")
    note(`${label}: hero orb hidden at a wide viewport`);
  if (viewport.width < 980 && welcome.heroDisplay !== "none")
    note(`${label}: hero orb shown at a narrow viewport`);
  console.log(
    `${label.padEnd(8)} welcome  overflowX=${welcome.overflowX}  scroll=${welcome.scrollTop}/${welcome.scrollRange}  composerGap=${welcome.composerGap}  orb=${welcome.heroDisplay}  theme=${welcome.theme}`,
  );

  // 2. Conversation with markdown and code, dark.
  await send(page, "Write a C program to add two numbers");
  await page.screenshot({ path: `${OUT}/${label}-conversation-dark.png` });
  await page.locator(".chat-scroll").evaluate((node) => {
    node.scrollTop = 0;
  });
  await settle(page, 260);
  await page.screenshot({ path: `${OUT}/${label}-conversation-top-dark.png` });

  // 3. Settings dialog, dark.
  if (viewport.width < DRAWER) await page.locator("#open-sidebar").click();
  await page.locator("#open-settings").click();
  await page.locator("#settings-dialog[open]").waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/${label}-settings-dark.png` });
  await page.locator("#settings-dialog [data-close-dialog]").click();
  await page.waitForTimeout(260);

  // 4. Fresh welcome, light theme. On phones the drawer is still open behind
  // the modal, which is where the New chat button lives.
  await page.locator("#new-chat").click();
  await page.waitForTimeout(360);
  await ensureTheme(page, "light");
  const lightWelcome = await layout(page, `${label} light welcome`);
  await page.screenshot({ path: `${OUT}/${label}-welcome-light.png` });
  await page.locator(".topbar").screenshot({ path: `${OUT}/${label}-topbar-light.png` });

  if (viewport.width >= DRAWER) {
    await page.locator("#open-settings").click();
    await page.locator("#settings-dialog[open]").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/${label}-settings-light.png` });
    await page.locator("#settings-dialog [data-close-dialog]").click();
    await page.waitForTimeout(240);
  }

  // 5. Conversation top and bottom, light.
  await send(page, "Write a C program to add two numbers");
  await page.screenshot({ path: `${OUT}/${label}-conversation-light.png` });
  await page.locator(".chat-scroll").evaluate((node) => {
    node.scrollTop = 0;
  });
  await settle(page, 260);
  await page.screenshot({ path: `${OUT}/${label}-conversation-top-light.png` });

  // 6. Phone drawer states.
  if (viewport.width < DRAWER) {
    await page.locator("#open-sidebar").click();
    await settle(page, 320);
    await page.locator("#sidebar.open").waitFor();
    await page.screenshot({ path: `${OUT}/${label}-drawer-open-light.png` });
    await page.locator(".sidebar-close").click();
    await settle(page, 320);
    const scrimHidden = await page.locator("#scrim").evaluate((node) => node.hidden);
    if (!scrimHidden) note(`${label}: scrim stays visible after closing the drawer`);
    await page.screenshot({ path: `${OUT}/${label}-drawer-closed-light.png` });
  }

  console.log(
    `${label.padEnd(8)} light    overflowX=${lightWelcome.overflowX}  scroll=${lightWelcome.scrollTop}/${lightWelcome.scrollRange}  composerGap=${lightWelcome.composerGap}`,
  );
  await context.close();
}

// 7. Reduced motion: every decorative animation should be off.
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await openPage(context);
  const motion = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration };
    };
    return { orb: read(".hero-orb"), brand: read(".brand-mark"), eyebrow: read(".eyebrow") };
  });
  for (const [key, value] of Object.entries(motion)) {
    if (!value) {
      note(`reduced motion: ${key} element missing`);
      continue;
    }
    if (value.name !== "none" && Number.parseFloat(value.duration) > 0.01)
      note(`reduced motion: ${key} still animates (${value.name} ${value.duration})`);
  }
  await page.screenshot({ path: `${OUT}/reduced-motion.png` });
  console.log(`motion   ${JSON.stringify(motion)}`);
  await context.close();
}

await browser.close();
if (problems.length) {
  console.error("\nProblems:\n" + problems.map((item) => ` - ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`\nOK - screenshots written to ${OUT}/`);
}
