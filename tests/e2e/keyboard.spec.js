import { expect, test } from "@playwright/test";

import { open } from "./helpers.js";

/**
 * These tests drive the app the way a keyboard-only user does: Tab, Enter, and
 * Escape, with no pointer events at all. Pointer behaviour is covered elsewhere;
 * the point here is that nothing needs a mouse.
 */

test("the skip link comes before every header button in tab order", async ({ page }) => {
  await open(page);

  const firstTabbable = await page.evaluate(() => {
    const selector = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
    for (const element of document.querySelectorAll(selector)) {
      if (element.getClientRects().length === 0) continue;
      return element.className || element.id;
    }
    return null;
  });
  expect(firstTabbable).toBe("skip-link");

  // Closing the intro leaves focus on the document, so the first Tab is consumed
  // restoring it; the skip link is the next stop either way.
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < 3; i += 1) {
    if (await page.locator("a.skip-link").evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  const skip = page.locator("a.skip-link");
  await expect(skip).toBeFocused();
  await expect(skip).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.keyboard.press("Enter");
  await expect(page.locator("#input")).toBeFocused();
});

test("every focus stop is visibly indicated", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.body.focus());
  const seen = [];

  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || element.className,
        // A ring can be drawn as an outline or as a shadow; either is visible.
        ring: `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`,
      };
    });
    if (stop) seen.push(stop);
  }

  expect(seen.length).toBeGreaterThan(4);
  for (const stop of seen) {
    const drawn = stop.ring
      .replace(/none 0px/g, "")
      .replace(/none/g, "")
      .trim();
    expect(drawn, `${stop.tag}#${stop.id} has no focus indicator`).not.toBe("");
  }
});

test("a reply can be requested and read without a pointer", async ({ page }) => {
  await open(page);
  await page.locator("#input").focus();
  await page.keyboard.type("What is LocalMind?");
  await page.keyboard.press("Enter");

  await expect(page.locator(".msg.user .msg-text")).toContainText("What is LocalMind?");
  await expect(page.locator(".msg.assistant .msg-text").last()).not.toBeEmpty({
    timeout: 20_000,
  });
  await expect(page.locator("#announcement")).toHaveText(/Response (complete|stopped)\./);
});

test("Shift+Enter adds a line instead of sending", async ({ page }) => {
  await open(page);
  const input = page.locator("#input");
  await input.focus();
  await page.keyboard.type("first line");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("second line");

  await expect(input).toHaveValue("first line\nsecond line");
  await expect(page.locator("#messages .message")).toHaveCount(0);
});

test("Escape never throws away what was typed", async ({ page }) => {
  await open(page);
  const input = page.locator("#input");
  await input.fill("draft that must survive");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("draft that must survive");
});
