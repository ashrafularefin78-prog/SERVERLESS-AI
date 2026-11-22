import { describe, expect, it } from "vitest";
import { describeRedaction, redactPII } from "../../src/privacy/redact.js";

describe("redactPII", () => {
  it("replaces an email address with a numbered placeholder", () => {
    const result = redactPII("Mail john.doe@example.com about the invoice.");
    expect(result.text).toBe("Mail [EMAIL_1] about the invoice.");
    expect(result.counts).toEqual({ EMAIL: 1 });
    expect(result.total).toBe(1);
  });

  it("keeps one placeholder per distinct value and numbers in order", () => {
    const result = redactPII(
      "Write to a@b.co, then to c@d.org, then back to a@b.co for the follow-up.",
    );
    expect(result.text).toBe(
      "Write to [EMAIL_1], then to [EMAIL_2], then back to [EMAIL_1] for the follow-up.",
    );
    expect(result.counts).toEqual({ EMAIL: 2 });
  });

  it("matches case-insensitively for the same address", () => {
    const result = redactPII("John@Example.com and john@example.com");
    expect(result.text).toBe("[EMAIL_1] and [EMAIL_1]");
  });

  it("redacts card numbers that pass the Luhn check", () => {
    const result = redactPII("Charge 4242 4242 4242 4242 today.");
    expect(result.text).toBe("Charge [CARD_1] today.");
  });

  it("leaves numbers that fail the Luhn check alone", () => {
    const text = "Order 4242 4242 4242 4241 shipped.";
    expect(redactPII(text).text).toBe(text);
  });

  it("redacts phone numbers with formatting and leaves short numbers alone", () => {
    expect(redactPII("Call +44 20 7946 0958 now.").text).toBe("Call [PHONE_1] now.");
    expect(redactPII("Call (555) 123-4567 today.").text).toBe("Call [PHONE_1] today.");

    // Version strings, prices, and years must survive: over-redaction destroys the
    // meaning of a prompt as surely as leaking it.
    for (const text of [
      "Upgrade from 10.2.3 to 10.2.4.",
      "It costs 1 250 000 dollars.",
      "That was in 1998-1999.",
      "Add 512 and 1024.",
    ]) {
      expect(redactPII(text).text).toBe(text);
    }
  });

  it("redacts IBANs only when the checksum holds", () => {
    expect(redactPII("Pay GB82 WEST 1234 5698 7654 32 please.").text).toBe("Pay [IBAN_1] please.");
    // Same shape, wrong check digits.
    expect(redactPII("Pay GB83 WEST 1234 5698 7654 32 please.").text).toBe(
      "Pay GB83 WEST 1234 5698 7654 32 please.",
    );
  });

  it("redacts API tokens and JWTs", () => {
    const result = redactPII(
      "Use sk-abcdefghijklmnopqrstuvwx and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signaturepart",
    );
    expect(result.text).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(result.text).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(result.counts).toEqual({ SECRET: 2 });
  });

  it("redacts a US social security number but not an invalid area code", () => {
    expect(redactPII("SSN 123-45-6789 on file.").text).toBe("SSN [SSN_1] on file.");
    expect(redactPII("Ref 666-45-6789 on file.").text).toBe("Ref 666-45-6789 on file.");
  });

  it("redacts IPv4 addresses and leaves out-of-range groups", () => {
    expect(redactPII("from 192.168.4.20 at noon").text).toBe("from [IPV4_1] at noon");
    expect(redactPII("version 999.1.1.1 is not an address").text).toBe(
      "version 999.1.1.1 is not an address",
    );
  });

  it("is idempotent", () => {
    const once = redactPII("Mail a@b.co or call +1 415 555 0100.").text;
    const twice = redactPII(once);
    expect(twice.text).toBe(once);
    expect(twice.total).toBe(0);
  });

  it("handles empty and non-string input", () => {
    expect(redactPII("")).toEqual({ text: "", counts: {}, total: 0 });
    expect(redactPII(undefined).total).toBe(0);
  });

  it("summarizes without repeating a value", () => {
    const result = redactPII("a@b.co and c@d.co, card 4242424242424242");
    const summary = describeRedaction(result);
    expect(summary).toContain("3 identifiers");
    expect(summary).toContain("2 email");
    expect(summary).not.toContain("a@b.co");
    expect(summary).not.toContain("4242424242424242");
  });
});
