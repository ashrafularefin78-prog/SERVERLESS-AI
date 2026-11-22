import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { open } from "./helpers.js";

// The first-run introduction. These specs use `page.goto` directly, because `open()`
// deliberately dismisses the dialog for every other spec.

test("introduces itself once, then never again", async ({ page }) => {
  await page.goto("/");

  const dialog = page.locator("#welcome-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Welcome to LocalMind");
  // The device line comes from the same detector the welcome screen uses, so it
  // states a real capability instead of a marketing claim.
  await expect(page.locator("#welcome-device-title")).not.toBeEmpty();
  await expect(page.locator("#welcome-device-reason")).not.toBeEmpty();

  await page.locator("#welcome-start").click();
  await expect(dialog).toBeHidden();

  // Dismissed means dismissed: a reload must not greet the same person again.
  await page.reload();
  await expect(page.locator("#welcome-dialog")).toBeHidden();
  await expect(page.locator(".welcome")).toBeVisible();
});

test("treats Escape as a choice and remembers it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#welcome-dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#welcome-dialog")).toBeHidden();

  await page.reload();
  await expect(page.locator("#welcome-dialog")).toBeHidden();
});

test("opens the model picker from the introduction", async ({ page }) => {
  await page.goto("/");
  // Without WebGPU there is no model to recommend, so the secondary action is
  // hidden rather than leading to a download that cannot run.
  const hasRecommendation = await page.locator("#welcome-model").isVisible();
  if (hasRecommendation) {
    await page.locator("#welcome-model").click();
    await expect(page.locator("#settings-dialog")).toBeVisible();
  } else {
    await page.locator("#welcome-start").click();
  }
  await expect(page.locator("#welcome-dialog")).toBeHidden();
});

test("the introduction meets the same accessibility bar as the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#welcome-dialog")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include("#welcome-dialog")
    .analyze();
  expect(results.violations).toEqual([]);
});

test("stays out of the way of the debug link", async ({ page }) => {
  // `?debug=true` is a maintainer link; opening two modals at once would stack them.
  await page.goto("/?debug=true");
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await expect(page.locator("#welcome-dialog")).toBeHidden();
});

test("does not block a returning user with no completed introduction on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const dialog = page.locator("#welcome-dialog");
  await expect(dialog).toBeVisible();
  // The dialog has to fit a phone, including both actions.
  const box = await page.locator("#welcome-start").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box && box.x + box.width <= 375).toBe(true);
  await open(page);
  await expect(dialog).toBeHidden();
});
