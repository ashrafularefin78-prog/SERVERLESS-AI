import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetTrustedTypesForTests,
  setHTML,
  setSanitizerForTests,
  trustedHTML,
  trustedTypesEnforced,
} from "../../src/trusted-types.js";

// These run in a browser, not in this environment, so the sanitizer's behaviour
// is asserted by tests/e2e/trusted-types.spec.js. What is testable here is the
// plumbing: whether the policy is used, created once, and degraded safely.

function fakeNode() {
  return { innerHTML: "" };
}

beforeEach(() => {
  // No DOM here, so supply a stub. Real sanitizing is asserted in the browser.
  setSanitizerForTests({ sanitize: (html) => html.replace(/<script>[\s\S]*?<\/script>/gi, "") });
});

afterEach(() => {
  delete globalThis.trustedTypes;
  setSanitizerForTests(null);
  resetTrustedTypesForTests();
});

describe("trusted types plumbing", () => {
  it("assigns through the policy when the browser provides one", () => {
    const names = [];
    const received = [];
    globalThis.trustedTypes = {
      createPolicy(name) {
        names.push(name);
        return {
          createHTML(html) {
            received.push(html);
            return { wrapped: html };
          },
        };
      },
    };
    resetTrustedTypesForTests();

    expect(trustedTypesEnforced()).toBe(true);
    const node = fakeNode();
    setHTML(node, "<b>x</b>");

    expect(names).toEqual(["localmind"]);
    // The policy receives the sanitized value, not the raw input.
    expect(received).toEqual(["<b>x</b>"]);
    expect(node.innerHTML).toEqual({ wrapped: "<b>x</b>" });
  });

  it("creates the policy once, not on every assignment", () => {
    let created = 0;
    globalThis.trustedTypes = {
      createPolicy() {
        created += 1;
        return { createHTML: (html) => html };
      },
    };
    resetTrustedTypesForTests();
    setHTML(fakeNode(), "<i>a</i>");
    setHTML(fakeNode(), "<i>b</i>");
    trustedHTML("<i>c</i>");
    expect(created).toBe(1);
  });

  it("falls back to a string when there is no Trusted Types API", () => {
    const node = fakeNode();
    expect(trustedTypesEnforced()).toBe(false);
    setHTML(node, "<i>fallback</i>");
    expect(node.innerHTML).toBe("<i>fallback</i>");
  });

  it("does not cache a policy the CSP refused", () => {
    globalThis.trustedTypes = {
      createPolicy() {
        throw new Error("CSP does not allow this policy name");
      },
    };
    resetTrustedTypesForTests();
    expect(trustedTypesEnforced()).toBe(false);
    const node = fakeNode();
    setHTML(node, "<i>still works</i>");
    expect(node.innerHTML).toBe("<i>still works</i>");
  });

  it("returns a string or a trusted value from trustedHTML", () => {
    expect(typeof trustedHTML("<b>x</b>")).toBe("string");
  });
});
