// Interface language. The app was English-only while offering coding help for 66
// languages, which is a strange line to draw. This module keeps the translation
// layer small enough to stay honest about what it covers:
//
// - English lives in `index.html`, untouched, so the default experience ships no
//   extra bytes and no runtime lookup.
// - Other locales are separate chunks, loaded only when selected.
// - A missing key falls back to the English sentence, never to a blank element or
//   a raw key, so a half-finished catalog degrades visibly instead of breaking.
import type { Settings } from "./types.js";

export type LocaleCode = "en" | "es" | "de";

export interface LocaleInfo {
  code: LocaleCode;
  /** Name in English, for the settings row. */
  label: string;
  /** Name in the language itself, which is what a speaker looks for. */
  native: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "de", label: "German", native: "Deutsch" },
];

export type Catalog = Readonly<Record<string, string>>;

const CATALOGS: Record<LocaleCode, () => Promise<{ default: Catalog }>> = {
  en: async () => ({ default: {} }),
  es: () => import("./locales/es.js"),
  de: () => import("./locales/de.js"),
};

let active: Catalog = {};

/**
 * Which locale to use, given the saved preference and the browser's list.
 *
 * "system" follows the first language the browser reports that this app actually
 * ships; a browser set to French gets English rather than a half-translated mix.
 */
export function resolveLocale(
  preference: Settings["language"] | string | undefined,
  languages: readonly string[],
): LocaleCode {
  const known = new Set(LOCALES.map((locale) => locale.code));
  if (preference && preference !== "system" && known.has(preference as LocaleCode)) {
    return preference as LocaleCode;
  }
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (known.has(base as LocaleCode)) return base as LocaleCode;
  }
  return "en";
}

/** Look one string up, falling back to the English source text. */
export function translate(text: string, catalog: Catalog): string {
  const hit = catalog[text];
  return typeof hit === "string" && hit.trim() ? hit : text;
}

export function setActiveCatalog(catalog: Catalog): void {
  active = catalog;
}

/** The active locale's version of an English string. */
export function t(text: string): string {
  return translate(text, active);
}

export function activeCatalog(): Catalog {
  return active;
}

export async function loadCatalog(code: LocaleCode): Promise<Catalog> {
  if (code === "en") return {};
  try {
    const module = await CATALOGS[code]();
    const catalog: unknown = module.default;
    return catalog && typeof catalog === "object" ? (catalog as Catalog) : {};
  } catch (error) {
    // A failed chunk fetch must not leave the interface half-translated.
    console.warn("Could not load the language pack", error);
    return {};
  }
}
