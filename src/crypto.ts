// WebCrypto helpers for opt-in encrypted memory. Keys are derived from a
// passphrase with PBKDF2 and held only in memory; what lands in IndexedDB or an
// export file is AES-GCM ciphertext. Pure: no DOM, no app state.
import type { EncryptedBlob } from "./types.js";

export const MEMORY_VERIFIER = "localmind-memory-verifier-v1";

/** PBKDF2 parameters for the at-rest vault key. */
export const KEY_DERIVATION = {
  name: "PBKDF2",
  iterations: 310_000,
  hash: "SHA-256",
  keyLength: 256,
} as const;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveMemoryKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(salt),
      iterations: KEY_DERIVATION.iterations,
      hash: KEY_DERIVATION.hash,
    },
    material,
    { name: "AES-GCM", length: KEY_DERIVATION.keyLength },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  const iv: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.data),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** True when the passphrase reproduces the stored verifier (wrong passphrase throws). */
export async function checkVerifier(key: CryptoKey, verifier: EncryptedBlob): Promise<boolean> {
  try {
    return (await decryptJson<string>(key, verifier)) === MEMORY_VERIFIER;
  } catch {
    return false;
  }
}
