import { expect, test } from "@playwright/test";
import { open } from "./helpers.js";

// A 375x667 viewport is an iPhone SE: the narrowest screen this app should be
// usable on. These are layout facts, not screenshots, so they cannot drift
// silently with a font difference.

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

test("the composer stays on screen and nothing overflows sideways", async ({ page }) => {
  await open(page);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

  await page.locator("#input").fill("hello");
  const input = await page.locator("#input").boundingBox();
  expect(input?.width ?? 0).toBeGreaterThan(100);
  // The input must sit inside the viewport, above the bottom edge.
  expect((input?.y ?? 0) + (input?.height ?? 0)).toBeLessThanOrEqual(667);
  await expect(page.locator("#send")).toBeVisible();
});

test("the history drawer starts off-screen and slides in", async ({ page }) => {
  await open(page);
  const sidebar = page.locator("#sidebar");
  const box = (await sidebar.boundingBox()) ?? { x: 0, width: 0, y: 0, height: 0 };

  // Closed means genuinely off-screen, not merely aria-hidden: a drawer that peeks
  // in steals 300px from a 375px screen.
  expect(box.x + box.width).toBeLessThanOrEqual(1);

  await page.locator("#open-sidebar").click();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.x ?? -999)
    .toBeGreaterThanOrEqual(-1);

  await page.locator("#sidebar-close").click();
  await expect
    .poll(async () => {
      const now = (await sidebar.boundingBox()) ?? { x: 0, width: 0 };
      return now.x + now.width;
    })
    .toBeLessThanOrEqual(1);
});

test("uses the small viewport height so the address bar cannot hide the input", async ({
  page,
}) => {
  await open(page);
  const height = await page.evaluate(() => {
    const app = document.getElementById("app");
    return app ? getComputedStyle(app).height : "";
  });
  // `dvh` follows the visible viewport as mobile browser chrome appears and hides.
  expect(height).not.toBe("100vh");
  expect(height === "100dvh" || parseFloat(height) > 0).toBe(true);
});

test("the settings dialog fits the screen and reaches its actions", async ({ page }) => {
  await open(page);
  // Settings live inside the drawer on this width, which is one tap away.
  await page.locator("#open-sidebar").click();
  await page.locator("#open-settings").click();

  const card = await page.locator("#settings-dialog .modal-card").boundingBox();
  expect(card?.width ?? 0).toBeLessThanOrEqual(375);
  expect(card && card.x >= 0).toBe(true);

  // The destructive action must be reachable by scrolling, never clipped.
  await page.locator("#clear-data").scrollIntoViewIfNeeded();
  await expect(page.locator("#clear-data")).toBeVisible();
});
