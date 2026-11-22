import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCALES, loadCatalog, resolveLocale, translate } from "../../src/i18n.js";
import de from "../../src/locales/de.js";
import es from "../../src/locales/es.js";

describe("resolveLocale", () => {
  const codes = LOCALES.map((locale) => locale.code);

  it("honours an explicit choice", () => {
    for (const code of codes) expect(resolveLocale(code, ["fr-FR"])).toBe(code);
  });

  it("follows the browser when the preference is system", () => {
    expect(resolveLocale("system", ["es-MX", "en-US"])).toBe("es");
    expect(resolveLocale("system", ["de-AT"])).toBe("de");
    expect(resolveLocale(undefined, ["en-GB"])).toBe("en");
  });

  it("falls back to English rather than a half-translated interface", () => {
    expect(resolveLocale("system", ["fr-CA", "ja-JP"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
    expect(resolveLocale("klingon", ["de"])).toBe("de");
  });
});

describe("translate", () => {
  const catalog = { Settings: "Ajustes" };

  it("returns the translation when there is one", () => {
    expect(translate("Settings", catalog)).toBe("Ajustes");
  });

  it("falls back to the English source for a missing or blank entry", () => {
    expect(translate("Memory", catalog)).toBe("Memory");
    expect(translate("Settings", { Settings: "   " })).toBe("Settings");
    expect(translate("Settings", { Settings: "" })).toBe("Settings");
  });
});

describe("locale catalogs", () => {
  /** Every key the markup asks for, taken from the real index.html. */
  async function markedKeys() {
    const html = await readFile(path.join(process.cwd(), "index.html"), "utf8");
    const keys = new Set();
    for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
      keys.add(match[1]);
    }
    return keys;
  }

  it("translates every key the markup marks, in every locale", async () => {
    const keys = await markedKeys();
    expect(keys.size).toBeGreaterThan(50);
    for (const [name, catalog] of [
      ["es", es],
      ["de", de],
    ]) {
      const missing = [...keys].filter((key) => !(key in catalog));
      expect(missing, `${name} is missing: ${missing.join(" | ")}`).toEqual([]);
    }
  });

  it("carries no key the markup does not use", async () => {
    const keys = await markedKeys();
    for (const [name, catalog] of [
      ["es", es],
      ["de", de],
    ]) {
      // The language row itself is translated at runtime, so its keys are not in
      // the markup; everything else has to be.
      const runtime = new Set([
        "Follow the browser",
        "Replies are not translated: the assistant answers in the language you write in.",
        "Ask for code, paste a bug, or include an error message...",
        "Loaded",
        "Load model",
      ]);
      const stale = Object.keys(catalog).filter((key) => !keys.has(key) && !runtime.has(key));
      expect(stale, `${name} has unused keys: ${stale.join(" | ")}`).toEqual([]);
    }
  });

  it("does not leave a string identical to English by accident", async () => {
    // Some words are the same in both languages ("General", "Tutor"). Listing them
    // keeps a copy-paste mistake from looking like a translation.
    // "Passphrase" is the German word too, and "General"/"Tutor" are spelled the
    // same in both languages.
    const identicalAllowed = new Set(["General", "Tutor", "Coder", "Passphrase"]);
    for (const [name, catalog] of [
      ["es", es],
      ["de", de],
    ]) {
      const suspicious = Object.entries(catalog)
        .filter(([key, value]) => key === value && !identicalAllowed.has(key))
        .map(([key]) => key);
      expect(suspicious, `${name} copies English for: ${suspicious.join(" | ")}`).toEqual([]);
    }
  });

  it("loads a catalog through the same path the app uses", async () => {
    await expect(loadCatalog("es")).resolves.toBeTypeOf("object");
    await expect(loadCatalog("en")).resolves.toEqual({});
  });
});
