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

/**
 * Answer the license gate that appears before a download with unverified or
 * restricted terms. Accepting is remembered per license, so later downloads of
 * the same license in the same profile skip the prompt.
 */
export async function acceptLicenseIfShown(page) {
  const dialog = page.locator("#license-dialog");
  // The gate opens after an async cache probe, so this waits for it to appear.
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.locator("#license-accept").check();
  await page.locator("#license-ok").click();
  await expect(dialog).toBeHidden();
  return true;
}

/**
 * Community GGUF builds run through wllama, which needs WebAssembly JSPI. Only
 * Chromium ships it, so these specs are skipped on Firefox and WebKit instead of
 * failing on a documented platform requirement.
 */
export async function skipWithoutJspi(page, test) {
  const jspi = await page.evaluate(
    () => typeof WebAssembly !== "undefined" && "Suspending" in WebAssembly,
  );
  test.skip(!jspi, "Community GGUF downloads require WebAssembly JSPI (Chromium only).");
}
