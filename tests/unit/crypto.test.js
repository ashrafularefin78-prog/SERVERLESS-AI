import { describe, expect, it } from "vitest";
import {
  KEY_DERIVATION,
  LEGACY_KEY_DERIVATION,
  MEMORY_VERIFIER,
  MIN_PASSPHRASE_LENGTH,
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

  it("requires a long passphrase and normalizes it with NFKC", async () => {
    await expect(deriveMemoryKey("short", SALT)).rejects.toThrow(
      `at least ${MIN_PASSPHRASE_LENGTH} characters`,
    );
    const composed = await deriveMemoryKey("école password", SALT);
    const decomposed = await deriveMemoryKey("e\u0301cole password", SALT);
    const legacyRaw = await deriveMemoryKey(
      "e\u0301cole password",
      SALT,
      LEGACY_KEY_DERIVATION.iterations,
      false,
      false,
    );
    await expect(decryptJson(composed, await encryptJson(decomposed, "same"))).resolves.toBe(
      "same",
    );
    await expect(decryptJson(composed, await encryptJson(legacyRaw, "same"))).rejects.toThrow();
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

    expect(blob.data).not.toContain(JSON.stringify(value));
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

  it("binds ciphertext to record AAD when supplied", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    const blob = await encryptJson(key, { secret: true }, "conversations:one");
    await expect(decryptJson(key, blob, "conversations:one")).resolves.toEqual({ secret: true });
    await expect(decryptJson(key, blob, "conversations:two")).rejects.toThrow();
    await expect(decryptJson(key, blob)).rejects.toThrow();
  });

  it("checks the verifier without revealing the passphrase", async () => {
    const key = await deriveMemoryKey(PASSPHRASE, SALT);
    const verifier = await encryptJson(key, MEMORY_VERIFIER);

    await expect(checkVerifier(key, verifier)).resolves.toBe(true);
    const wrong = await deriveMemoryKey("wrong passphrase", SALT);
    await expect(checkVerifier(wrong, verifier)).resolves.toBe(false);
  });
});
