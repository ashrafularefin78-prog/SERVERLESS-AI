import { describe, expect, it } from "vitest";
import {
  KEY_DERIVATION,
  MEMORY_VERIFIER,
  checkVerifier,
  decryptJson,
  deriveMemoryKey,
  encryptJson,
  randomSalt,
} from "../../src/crypto.js";

const PASSPHRASE = "correct horse battery staple";
const SALT = randomSalt();

describe("vault key derivation", () => {
  it("uses 2026-appropriate PBKDF2 parameters", () => {
    expect(KEY_DERIVATION.name).toBe("PBKDF2");
    expect(KEY_DERIVATION.hash).toBe("SHA-256");
    expect(KEY_DERIVATION.keyLength).toBe(256);
    expect(KEY_DERIVATION.iterations).toBeGreaterThanOrEqual(310_000);
  });

  it("derives a non-extractable AES-GCM key", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
  });

  it("generates a fresh salt each time", () => {
    expect(randomSalt()).not.toBe(randomSalt());
  });
});

describe("encryptJson / decryptJson", () => {
  it("round-trips structured data", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    const value = { messages: [{ role: "user", content: "hi" }], count: 1 };
    const blob = await encryptJson(key, value);

    expect(blob.data).not.toContain("hi");
    await expect(decryptJson(key, blob)).resolves.toEqual(value);
  });

  it("uses a fresh IV so identical plaintext encrypts differently", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    const first = await encryptJson(key, "same");
    const second = await encryptJson(key, "same");

    expect(first.iv).not.toBe(second.iv);
    expect(first.data).not.toBe(second.data);
  });

  it("fails with a key derived from another passphrase", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    const other = await deriveMemoryKey("a different passphrase", SALT);
    const blob = await encryptJson(key, "secret");

    await expect(decryptJson(other, blob)).rejects.toThrow();
  });

  it("checks the verifier without revealing the passphrase", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    const verifier = await encryptJson(key, MEMORY_VERIFIER);

    await expect(checkVerifier(key, verifier)).resolves.toBe(true);
    const wrong = await deriveMemoryKey("wrong passphrase", SALT);
    await expect(checkVerifier(wrong, verifier)).resolves.toBe(false);
  });
});
