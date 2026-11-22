import { describe, expect, it } from "vitest";
import { auditLicenses, classify, licenseOf } from "../../scripts/check-dependency-licenses.mjs";

describe("dependency licence classification", () => {
  it.each([
    ["MIT", "permissive"],
    ["ISC", "permissive"],
    ["Apache-2.0", "permissive"],
    ["BSD-3-Clause", "permissive"],
    ["0BSD", "permissive"],
  ])("treats %s as permissive", (license, verdict) => {
    expect(classify(license)).toBe(verdict);
  });

  it.each([["GPL-3.0-only"], ["AGPL-3.0"], ["SSPL-1.0"]])("flags %s as copyleft", (license) => {
    expect(classify(license)).toBe("copyleft");
  });

  it("lets the consumer choose when an OR alternative is permissive", () => {
    // DOMPurify ships under "(MPL-2.0 OR Apache-2.0)"; choosing Apache-2.0 is
    // allowed, so it is not a copyleft dependency.
    expect(classify("(MPL-2.0 OR Apache-2.0)")).toBe("permissive");
    expect(classify("MIT OR GPL-3.0")).toBe("permissive");
  });

  it("keeps copyleft when both sides of an AND are copyleft", () => {
    expect(classify("Apache-2.0 AND LGPL-3.0-or-later")).toBe("copyleft");
  });

  it("does not guess when there is no licence field", () => {
    expect(classify("")).toBe("unknown");
    expect(classify(undefined)).toBe("unknown");
    expect(classify("SEE LICENSE IN LICENSE.txt")).toBe("review");
  });

  it("reads every shape npm allows in the licence field", () => {
    expect(licenseOf({ license: "MIT" })).toBe("MIT");
    expect(licenseOf({ license: { type: "ISC" } })).toBe("ISC");
    expect(licenseOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe(
      "MIT OR Apache-2.0",
    );
    expect(licenseOf({})).toBe("");
  });

  describe("the installed tree", () => {
    it("ships nothing copyleft", async () => {
      const report = await auditLicenses();
      expect(report.attention).toEqual([]);
      expect(report.byVerdict.copyleft ?? 0).toBe(0);
      expect(report.total).toBeGreaterThan(0);
      // Every audited package is classified, so the counts add up to the total.
      const counted = Object.values(report.byVerdict).reduce((sum, value) => sum + value, 0);
      expect(counted).toBe(report.total);
    });

    it("names why a Node-only package is excluded from the shipped count", async () => {
      const report = await auditLicenses();
      for (const row of report.notShipped) {
        expect(row.notShipped).toBeTruthy();
        expect(report.rows.some((entry) => entry.name === row.name)).toBe(true);
      }
    });
  });
});
