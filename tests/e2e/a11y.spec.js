import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { open } from "./helpers.js";

// Contrast is measured on whatever is painted at that instant, so a mid-fade
// element can fail an audit it would pass a frame later. The app honours the
// reduced-motion preference, which makes the audit deterministic and exercises
// that preference at the same time.
test.use({ reducedMotion: "reduce" });

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page, name) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, `${name}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

test("welcome screen meets automated WCAG accessibility checks", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "New chat" })).toBeVisible();
  await expectNoA11yViolations(page, "welcome screen");
});

test("conversation and Settings meet automated WCAG accessibility checks", async ({ page }) => {
  await open(page);
  await page.locator("#input").fill("hello");
  await page.locator("#send").click();
  await expect(page.locator(".msg.assistant .msg-text").last()).toContainText("Hey");
  // The demo reply can finish before the assertion runs on a fast engine, and the
  // region is cleared afterwards. What matters is that it announced the state.
  await expect(page.locator("#announcement")).toHaveText(
    /Assistant is responding\.|Response complete\./,
  );
  await expectNoA11yViolations(page, "conversation while response streams");
  await page.locator("#open-settings").click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await expectNoA11yViolations(page, "Settings dialog");
});

test("model picker is operable from the keyboard and restores trigger focus", async ({ page }) => {
  await open(page);
  const trigger = page.locator("#composer-model-trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#composer-model-pop")).toBeVisible();
  await expect(page.locator("#composer-model-search")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#composer-model-list .model-option").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#composer-model-pop")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("model storage readout is readable and lists what is stored", async ({ page }) => {
  await open(page);
  await page.locator("#open-settings").click();
  const summary = page.locator("#model-storage-summary");
  await expect(summary).toContainText(/No model weights|model stored|models stored/, {
    timeout: 15_000,
  });
  await expect(page.locator("#env-gpu-limits")).not.toHaveText("Not checked");
  await expectNoA11yViolations(page, "Settings with the model storage list");
});

test("the mobile drawer passes an audit while it is open", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page);
  await page.locator("#open-sidebar").click();
  await expect(page.locator("#sidebar")).toBeInViewport();
  await expectNoA11yViolations(page, "mobile drawer");
});

test("selecting an uncensored model keeps a warning on screen", async ({ page }) => {
  await open(page);
  await page.locator("#open-settings").click();
  const warning = page.locator("#model-safety-warning");
  await expect(warning).toBeHidden();

  await page.locator("#model-trigger").click();
  const row = page.locator(
    '#model-list [data-model-id="gguf:qwen2.5-coder-1.5b-abliterated-q4km"]',
  );
  await row.scrollIntoViewIfNeeded();
  await row.click();

  await expect(warning).toBeVisible();
  await expect(warning).toContainText("refusal behaviour removed");
  await expect(warning.locator("a")).toHaveAttribute("href", "./docs/content-safety.md");
  await expectNoA11yViolations(page, "Settings with a safety warning");
});
