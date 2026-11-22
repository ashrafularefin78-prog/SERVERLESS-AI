import { expect, test } from "@playwright/test";

import { open } from "./helpers.js";

/**
 * The interface chrome follows the browser by default, and can be pinned in
 * Settings. Model output is never translated: it answers in the language the user
 * writes in, which is the model's job, not the interface's.
 */

test.describe("a Spanish browser", () => {
  test.use({ locale: "es-ES" });

  test("gets a Spanish interface without changing any setting", async ({ page }) => {
    await open(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#open-settings")).toHaveText("Ajustes");
    await expect(page.locator("#input")).toHaveAttribute(
      "placeholder",
      "Pregunta lo que quieras...",
    );
    await expect(page.locator("#announcement")).toHaveAttribute("aria-live", "polite");
  });

  test("keeps the warning text in the language it was written in", async ({ page }) => {
    await open(page);
    await page.locator("#open-settings").click();
    await expect(page.locator("#settings-title")).toHaveText("Ajustes");
    await expect(page.locator("#model-load")).toHaveText("Descargar y cargar");
    // Help paragraphs are deliberately English: a translated label over an English
    // explanation is honest, a machine-translated security note is not.
    await expect(page.locator("#settings-dialog h3").first()).toHaveText("Modelo de IA");
  });

  test("can be switched back to English from Settings", async ({ page }) => {
    await open(page);
    await page.locator("#open-settings").click();
    await page.selectOption("#language-select", "en");
    await expect(page.locator("#settings-title")).toHaveText("Settings");
    await page.keyboard.press("Escape");
    await expect(page.locator("#input")).toHaveAttribute("placeholder", "Ask anything...");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("a German browser", () => {
  test.use({ locale: "de-DE" });

  test("gets German chrome and an English reply when asked in English", async ({ page }) => {
    await open(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("#open-settings")).toHaveText("Einstellungen");

    await page.locator("#input").fill("hello");
    await page.locator("#send").click();
    await expect(page.locator(".msg.assistant .msg-text").last()).toContainText("Hey");
  });
});

test("a browser language the app does not ship falls back to English", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR" });
  const french = await context.newPage();
  try {
    await french.goto("/");
    await expect(french.locator("html")).toHaveAttribute("lang", "en");
    await expect(french.locator("#open-settings")).toHaveText("Settings");
  } finally {
    await context.close();
  }
});
