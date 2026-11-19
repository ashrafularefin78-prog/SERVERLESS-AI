import { expect } from "@playwright/test";

/**
 * Open the model picker, scroll to the option with the given `id` and pick it.
 * Pass `""` for the built-in assistant.
 */
export async function pickModel(page, id) {
  await page.locator("#model-trigger").click();
  await expect(page.locator("#model-pop")).toBeVisible();
  const row = page.locator(`#model-list [data-model-id="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(page.locator("#model-pop")).toBeHidden();
}
