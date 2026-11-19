import { expect } from "@playwright/test";

/**
 * Open the model picker, scroll to the option with the given `id` and pick it.
 * Pass `""` for the built-in assistant. The picker may already be open when a
 * test calls this, and the trigger toggles, so close it first.
 */
export async function pickModel(page, id) {
  const pop = page.locator("#model-pop");
  if (await pop.isVisible()) {
    await page.locator("#model-trigger").click();
    await expect(pop).toBeHidden();
  }
  await page.locator("#model-trigger").click();
  await expect(pop).toBeVisible();
  const row = page.locator(`#model-list [data-model-id="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(pop).toBeHidden();
}
