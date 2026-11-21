/**
 * @file src/core/vault/engine.ts
 * Low-level crypto primitives — standard Web Crypto for AES-GCM + HMAC, and
 * hash-wasm for Argon2id key derivation.
 *
 * KDF: new vaults use **Argon2id** (64 MiB, t=3, p=1) via hash-wasm (a pure
 * WASM build that bundles inline — no native toolchain, works under Vite and
 * Node). Vaults created by the earlier PBKDF2-SHA256 build still open: the
 * derivation path is chosen from the payload's `kdf.name`, so the format is
 * backward compatible.
 */

import { argon2id } from "hash-wasm";
import { utf8, bytesToBase64, base64ToBytes, constantTimeEqual } from "../crypto/encoding";
import type { SessionKeys, VaultPayload, KdfParams } from "./vault-types";
import { WrongPasswordError } from "../errors";

const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Default KDF for newly created vaults. */
export const DEFAULT_KDF: KdfParams = {
  name: "Argon2id",
  iterations: 3,
  memoryKiB: 65536, // 64 MiB
  parallelism: 1,
};

const PBKDF2_ITERATIONS = 600_000;

/** Derive 64 raw key bytes from the password using the given KDF. */
async function deriveRawBytes(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  kdf: KdfParams,
  onProgress?: (p: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (kdf.name === "Argon2id") {
    onProgress?.(0.2);
    const out = await argon2id({
      password,
      salt,
      parallelism: kdf.parallelism ?? 1,
      iterations: kdf.iterations,
      memorySize: kdf.memoryKiB ?? 65536,
      hashLength: 64,
      outputType: "binary",
    });
    onProgress?.(0.9);
    return out as Uint8Array<ArrayBuffer>;
  }
  // PBKDF2-SHA256 (legacy / fallback)
  onProgress?.(0.2);
  const baseKey = await crypto.subtle.importKey("raw", utf8(password), { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: kdf.iterations, hash: "SHA-256" },
    baseKey,
    512,
  );
  onProgress?.(0.9);
  return new Uint8Array(bits) as Uint8Array<ArrayBuffer>;
}

/** 64 raw key bytes from the master password (32 enc || 32 mac). The caller
 *  must wipe them; only the device-unlock path ever holds them for longer
 *  than an import. */
export async function deriveRawKey(
  password: string,
  saltB64: string,
  kdf: KdfParams,
  onProgress?: (p: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!password) throw new Error("master password is required");
  onProgress?.(0.1);
  return deriveRawBytes(password, base64ToBytes(saltB64), kdf, onProgress);
}

/** Import 64 raw key bytes as non-extractable session keys. */
export async function importSessionKeys(
  raw: Uint8Array<ArrayBuffer>,
  saltB64: string,
  kdf: KdfParams,
): Promise<SessionKeys> {
  if (raw.length !== 64) throw new Error("raw key must be 64 bytes");
  const encKey = await crypto.subtle.importKey(
    "raw",
    raw.subarray(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const macKey = await crypto.subtle.importKey(
    "raw",
    raw.subarray(32, 64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return { encKey, macKey, salt: saltB64, kdf };
}

/** Derive enc + mac CryptoKeys from the master password. */
export async function deriveKeys(
  password: string,
  saltB64: string,
  kdf: KdfParams,
  onProgress?: (p: number) => void,
): Promise<SessionKeys> {
  const raw = await deriveRawKey(password, saltB64, kdf, onProgress);
  const keys = await importSessionKeys(raw, saltB64, kdf);
  onProgress?.(1);
  raw.fill(0); // best-effort wipe of the derived bytes
  return keys;
}

/** Canonical MAC input — binds every non-secret parameter to the ciphertext. */
function macInput(kdf: KdfParams, salt: string, iv: string, data: string): Uint8Array<ArrayBuffer> {
  return utf8(
    `v1|${kdf.name}|${kdf.iterations}|${kdf.memoryKiB ?? 0}|${kdf.parallelism ?? 0}|${salt}|${iv}|${data}`,
  );
}

/** Encrypt vault JSON → VaultPayload. Salt + KDF come from the session keys. */
export async function encryptVault(
  vaultJson: string,
  keys: SessionKeys,
  createdAt?: string,
): Promise<VaultPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keys.encKey, utf8(vaultJson)),
  );

  const ivB64 = bytesToBase64(iv);
  const dataB64 = bytesToBase64(ct);
  const macSig = new Uint8Array(
    await crypto.subtle.sign("HMAC", keys.macKey, macInput(keys.kdf, keys.salt, ivB64, dataB64)),
  );

  return {
    version: 1,
    kdf: keys.kdf,
    salt: keys.salt,
    iv: ivB64,
    data: dataB64,
    mac: bytesToBase64(macSig),
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Decrypt VaultPayload → JSON string. Throws on MAC mismatch / wrong password. */
export async function decryptVault(payload: VaultPayload, keys: SessionKeys): Promise<string> {
  // Verify MAC FIRST — never attempt AES decrypt on a tampered payload.
  const givenMac = base64ToBytes(payload.mac);
  const computedMac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      keys.macKey,
      macInput(payload.kdf, payload.salt, payload.iv, payload.data),
    ),
  );
  if (!constantTimeEqual(givenMac, computedMac)) {
    // By design we can't distinguish "wrong password" from "tampered file" —
    // both fail the same MAC check. Message stays generic; callers that want
    // to special-case corruption vs. wrong-password use VaultCorruptError at
    // the JSON-parse layer in serializer.ts instead.
    throw new WrongPasswordError(
      "Vault integrity check failed (wrong master password or tampered file)",
    );
  }

  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
      keys.encKey,
      base64ToBytes(payload.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError("Failed to decrypt vault (wrong master password or corrupt data)");
  }
}

export const DEFAULT_SALT_BYTES = SALT_BYTES;
export const PBKDF2_FALLBACK: KdfParams = { name: "PBKDF2-SHA256", iterations: PBKDF2_ITERATIONS };
