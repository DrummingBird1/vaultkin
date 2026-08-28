/**
 * @file src/core/vault/engine.test.ts
 * Unit tests for the low-level crypto engine (deriveKeys/encryptVault/
 * decryptVault) — the layer serializer.ts builds on. Real WebCrypto, no
 * mocking (see tests/setup.ts's header comment on the project's stance on
 * mocking crypto).
 */
import { describe, it, expect } from "vitest";
import { deriveKeys, encryptVault, decryptVault, DEFAULT_KDF, PBKDF2_FALLBACK } from "./engine";
import { WrongPasswordError } from "../errors";
import { bytesToBase64 } from "../crypto/encoding";

const PASSWORD = "correct-horse-battery-staple-77!";

function freshSaltB64(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

describe("deriveKeys", () => {
  it("derives usable AES-GCM + HMAC keys under Argon2id", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    expect(keys.encKey).toBeDefined();
    expect(keys.macKey).toBeDefined();
    expect(keys.kdf).toEqual(DEFAULT_KDF);
  });

  it("derives usable keys under the legacy PBKDF2-SHA256 path", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), PBKDF2_FALLBACK);
    expect(keys.encKey).toBeDefined();
    expect(keys.macKey).toBeDefined();
    expect(keys.kdf.name).toBe("PBKDF2-SHA256");
  });

  it("is deterministic for the same password + salt + KDF", async () => {
    const salt = freshSaltB64();
    const k1 = await deriveKeys(PASSWORD, salt, DEFAULT_KDF);
    const k2 = await deriveKeys(PASSWORD, salt, DEFAULT_KDF);
    // CryptoKey is opaque/non-extractable — compare via a signature made with each.
    const msg = new TextEncoder().encode("probe");
    const s1 = await crypto.subtle.sign("HMAC", k1.macKey, msg);
    const s2 = await crypto.subtle.sign("HMAC", k2.macKey, msg);
    expect(new Uint8Array(s1)).toEqual(new Uint8Array(s2));
  });

  it("derives different keys for different salts", async () => {
    const k1 = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const k2 = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const msg = new TextEncoder().encode("probe");
    const s1 = await crypto.subtle.sign("HMAC", k1.macKey, msg);
    const s2 = await crypto.subtle.sign("HMAC", k2.macKey, msg);
    expect(new Uint8Array(s1)).not.toEqual(new Uint8Array(s2));
  });

  it("rejects an empty password", async () => {
    await expect(deriveKeys("", freshSaltB64(), DEFAULT_KDF)).rejects.toThrow();
  });

  it("reports progress via onProgress, ending at 1", async () => {
    const seen: number[] = [];
    await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF, (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("encryptVault / decryptVault", () => {
  it("round-trips plaintext through encrypt then decrypt", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const plaintext = JSON.stringify({ hello: "world", n: 42 });
    const payload = await encryptVault(plaintext, keys);
    const decrypted = await decryptVault(payload, keys);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const p1 = await encryptVault("same plaintext", keys);
    const p2 = await encryptVault("same plaintext", keys);
    expect(p1.iv).not.toBe(p2.iv);
    expect(p1.data).not.toBe(p2.data);
  });

  it("stamps version 1 and carries the salt/kdf from the session keys", async () => {
    const salt = freshSaltB64();
    const keys = await deriveKeys(PASSWORD, salt, DEFAULT_KDF);
    const payload = await encryptVault("{}", keys);
    expect(payload.version).toBe(1);
    expect(payload.salt).toBe(salt);
    expect(payload.kdf).toEqual(DEFAULT_KDF);
  });

  it("throws WrongPasswordError when decrypting with keys derived from a different password", async () => {
    const salt = freshSaltB64();
    const keys = await deriveKeys(PASSWORD, salt, DEFAULT_KDF);
    const payload = await encryptVault("secret data", keys);
    const wrongKeys = await deriveKeys("a totally different password", salt, DEFAULT_KDF);
    await expect(decryptVault(payload, wrongKeys)).rejects.toThrow(WrongPasswordError);
  });

  it("throws WrongPasswordError when the MAC doesn't match (tampered ciphertext)", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const payload = await encryptVault("secret data", keys);
    const tampered = { ...payload, data: payload.data.slice(0, -4) + "AAAA" };
    await expect(decryptVault(tampered, keys)).rejects.toThrow(WrongPasswordError);
  });

  it("throws WrongPasswordError when the MAC itself is tampered", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const payload = await encryptVault("secret data", keys);
    const tampered = { ...payload, mac: payload.mac.slice(0, -4) + "AAAA" };
    await expect(decryptVault(tampered, keys)).rejects.toThrow(WrongPasswordError);
  });

  it("verifies the MAC before attempting AES decryption (fails closed, not silently)", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const payload = await encryptVault("secret data", keys);
    // Corrupt the IV — if the engine attempted decrypt before MAC-checking it
    // could throw a generic DOMException instead of the typed error.
    const tampered = { ...payload, iv: payload.iv.slice(0, -4) + "AAAA" };
    await expect(decryptVault(tampered, keys)).rejects.toThrow(WrongPasswordError);
  });

  it("round-trips unicode content", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const plaintext = "unicode payload: 日本語 🔒 emoji test";
    const payload = await encryptVault(plaintext, keys);
    expect(await decryptVault(payload, keys)).toBe(plaintext);
  });

  it("preserves a supplied createdAt and always refreshes updatedAt", async () => {
    const keys = await deriveKeys(PASSWORD, freshSaltB64(), DEFAULT_KDF);
    const createdAt = "2020-01-01T00:00:00.000Z";
    const payload = await encryptVault("{}", keys, createdAt);
    expect(payload.createdAt).toBe(createdAt);
    expect(payload.updatedAt).not.toBe(createdAt);
  });
});
