// Trusted Types sink.
//
// With `require-trusted-types-for 'script'` in the CSP, assigning a plain string
// to `innerHTML` throws. Every HTML sink in the app goes through `setHTML`, so
// the policy is the single audited place where a string becomes markup, and it
// sanitizes on the way through. A bug at a call site therefore cannot inject
// markup: the last hand on the value is DOMPurify.
//
// Browsers without Trusted Types (Firefox, Safari) take the same sanitizing
// path and assign a string, because the assignment is not restricted there.

import DOMPurify from "dompurify";

export const TRUSTED_TYPES_POLICY = "localmind";

/**
 * Permissive enough for the app's own markup — inline SVG icons via `<use>`,
 * table wrappers, code blocks — and strict about anything executable:
 * scripts, event handlers, and `javascript:` URLs are removed, and there is no
 * configuration here that would let them back in.
 */
const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  // The icon sprite is `<svg><use href="#i-name">`; `use` is off by default
  // because it can pull in markup from elsewhere, so it is allowed here and
  // the hook below refuses any reference that is not a local fragment.
  ADD_TAGS: ["use"],
  ADD_ATTR: ["href", "xlink:href", "target", "rel", "aria-hidden", "focusable"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "meta", "link"],
  FORBID_ATTR: ["srcdoc", "srcset"],
};

/** Minimal local shape: `TrustedHTML` is not in the standard TS DOM lib. */
export interface TrustedHTMLValue {
  readonly __trustedHTML: never;
}

type TrustedHTMLPolicy = {
  createHTML: (html: string) => unknown;
  createScriptURL?: (url: string) => unknown;
};

interface TrustedTypesWindow {
  createPolicy?: (
    name: string,
    rules: {
      createHTML: (html: string) => string;
      createScriptURL?: (url: string) => string;
    },
  ) => TrustedHTMLPolicy;
}

let policy: TrustedHTMLPolicy | null = null;
let resolved = false;

function trustedTypes(): TrustedTypesWindow | undefined {
  const scope = globalThis as { trustedTypes?: TrustedTypesWindow };
  return scope.trustedTypes;
}

function policyFor(): TrustedHTMLPolicy | null {
  if (resolved) return policy;
  resolved = true;

  const api = trustedTypes();
  if (!api?.createPolicy) return null;

  try {
    policy = api.createPolicy(TRUSTED_TYPES_POLICY, {
      createHTML: (html: string) => sanitizeHTML(html),
      createScriptURL: (url: string) => {
        const base = (globalThis as { location?: { origin: string } }).location?.origin;
        const parsed = new URL(url, (globalThis as { document?: Document }).document?.baseURI);
        if (base && parsed.origin !== base) {
          throw new TypeError("Only same-origin script URLs are allowed.");
        }
        return parsed.href;
      },
    });
  } catch {
    // The CSP does not allow this policy name, or it already exists. Fall back
    // to direct assignment: under enforcement the assignment fails loudly,
    // which is better than silently trusting an unsanitized string.
    policy = null;
  }
  return policy;
}

interface Purifier {
  sanitize: (html: string, options?: Record<string, unknown>) => string;
  addHook?: (
    name: string,
    hook: (node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }) => void,
  ) => void;
}

const LOCAL_FRAGMENT = /^#[A-Za-z0-9_-]+$/;

let purifier: Purifier | null = null;
let testPurifier: Purifier | null = null;

/**
 * `dompurify` resolves to a ready instance in a browser bundle and to the
 * factory elsewhere, so accept both. There is no safe fallback without a DOM:
 * rather than pass markup through unsanitized, this refuses to run, and unit
 * tests supply a stub through `setSanitizerForTests`.
 * @internal
 */
export function setSanitizerForTests(sanitizer: Purifier | null) {
  testPurifier = sanitizer;
  purifier = null;
}

function purifierInstance(): Purifier {
  if (testPurifier) return testPurifier;
  if (purifier) return purifier;

  const imported = DOMPurify as unknown as Purifier | ((window?: unknown) => Purifier);
  const resolved =
    typeof imported === "function"
      ? imported((globalThis as { window?: unknown }).window)
      : imported;

  if (typeof resolved?.sanitize !== "function") {
    throw new Error("HTML sanitizing requires a browser environment.");
  }
  // Narrow, never widen: an icon may point at a fragment in this document and
  // at nothing else.
  resolved.addHook?.("uponSanitizeAttribute", (node, data) => {
    if ((data.attrName === "href" || data.attrName === "xlink:href") && node.nodeName === "use") {
      if (!LOCAL_FRAGMENT.test(data.attrValue)) data.keepAttr = false;
    }
  });
  purifier = resolved;
  return purifier;
}

export function sanitizeHTML(html: string): string {
  return purifierInstance().sanitize(html, SANITIZE_OPTIONS);
}

/**
 * Sanitize with stricter, caller-supplied options. Exported so the markdown
 * renderer uses this module's DOMPurify instance: two copies would each try to
 * create the `dompurify` policy, the second would be refused by the CSP, and
 * sanitizing would start returning empty output.
 */
export function sanitizeWith(html: string, options: Record<string, unknown>): string {
  return purifierInstance().sanitize(html, options);
}

/** Convert untrusted markup into a value safe for an HTML sink. */
export function trustedHTML(html: string): string | TrustedHTMLValue {
  const cleaned = sanitizeHTML(html);
  const active = policyFor();
  if (!active) return cleaned;
  return active.createHTML(cleaned) as TrustedHTMLValue;
}

/** The only way the app assigns markup to a node. */
export function setHTML<T extends Element>(target: T, html: string): T {
  target.innerHTML = trustedHTML(html) as string;
  return target;
}

/**
 * The service worker URL is the only script URL the app hands to the browser, so
 * the policy accepts same-origin paths only.
 */
export function trustedScriptURL(url: string): string | URL {
  const active = policyFor();
  if (!active?.createScriptURL) return url;
  return active.createScriptURL(url) as unknown as string;
}

/** True when the browser enforces Trusted Types on this page. */
export function trustedTypesEnforced(): boolean {
  return policyFor() !== null;
}

/** Test seam: forget the memoized policy so a stub can be installed. */
export function resetTrustedTypesForTests() {
  policy = null;
  resolved = false;
}
