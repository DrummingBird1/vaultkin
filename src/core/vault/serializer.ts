/**
 * @file src/core/vault/serializer.ts
 * App-facing crypto façade. Outside `core/`, code calls these functions
 * (and nothing in `engine.ts`).
 */

import { deriveKeys, encryptVault, decryptVault, DEFAULT_KDF, DEFAULT_SALT_BYTES } from "./engine";
import type { SessionKeys, VaultPayload } from "./vault-types";
import type { VaultData } from "./schema";
import { bytesToBase64, base64ToBytes } from "../crypto/encoding";
import { VaultCorruptError } from "../errors";

export interface CreateVaultResult {
  encryptedPayload: string;
  vault: VaultData;
  sessionKeys: SessionKeys;
}

export interface OpenVaultResult {
  vault: VaultData;
  sessionKeys: SessionKeys;
}

function freshSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_BYTES)));
}

/** Create a fresh vault with a brand-new salt + Argon2id key derivation. */
export async function createVault(
  password: string,
  initial: Omit<VaultData, "schemaVersion">,
  onProgress?: (p: number) => void,
): Promise<CreateVaultResult> {
  const keys = await deriveKeys(password, freshSalt(), DEFAULT_KDF, onProgress);
  const vault: VaultData = { schemaVersion: 1, ...initial };
  const payload = await encryptVault(JSON.stringify(vault), keys, vault.meta.createdAt);
  return { encryptedPayload: JSON.stringify(payload), vault, sessionKeys: keys };
}

/** Open an existing encrypted vault payload. Throws on wrong password. */
export async function openVault(
  encryptedPayload: string,
  password: string,
  onProgress?: (p: number) => void,
): Promise<OpenVaultResult> {
  let payload: VaultPayload;
  try {
    payload = JSON.parse(encryptedPayload);
  } catch {
    throw new VaultCorruptError("Vault payload is corrupted or not valid JSON");
  }
  // JSON.parse happily returns non-object values (null, a number, an array,
  // ...) for input that's valid JSON but not a vault payload. Property access
  // on most of those (e.g. `(42).version`) just yields undefined and falls
  // through to the version check below, but `null` throws a raw TypeError —
  // found via fuzzing arbitrary top-level JSON through openVault().
  if (payload === null || typeof payload !== "object") {
    throw new VaultCorruptError("Vault payload is not a valid vault object");
  }
  if (payload.version !== 1)
    throw new VaultCorruptError(`Unsupported vault version: ${payload.version}`);

  // A malformed kdf.name would otherwise be silently treated as the
  // PBKDF2-SHA256 branch in engine.ts's deriveRawBytes() (it only special-
  // cases "Argon2id", anything else falls through), producing a derived key
  // that's simply wrong — surfacing as WrongPasswordError instead of the
  // more accurate "vault is corrupted" message. A non-finite/non-positive
  // iterations count would instead reach crypto.subtle.deriveBits() or
  // hash-wasm's argon2id() and throw whatever raw error type those libraries
  // happen to use for invalid params.
  if (payload.kdf?.name !== "Argon2id" && payload.kdf?.name !== "PBKDF2-SHA256") {
    throw new VaultCorruptError(`Unknown KDF: ${payload.kdf?.name}`);
  }
  if (
    typeof payload.kdf.iterations !== "number" ||
    !Number.isInteger(payload.kdf.iterations) ||
    payload.kdf.iterations <= 0
  ) {
    throw new VaultCorruptError("Vault payload has an invalid KDF iteration count");
  }

  // Validate every base64 field up front. A corrupted or truncated vault
  // file (disk corruption, an interrupted write, a tampered download) can
  // easily leave one of these as garbage, and the underlying atob() call in
  // deriveKeys()/decryptVault() throws a raw, untyped DOMException for
  // invalid base64 — not something callers filtering by
  // `instanceof VaultCorruptError` / `instanceof WrongPasswordError` would
  // catch, so it would surface as an unhandled error instead of the intended
  // "this vault file is corrupted" message. Found via fuzzing malformed
  // payloads through openVault() in serializer.fuzz.test.ts.
  const base64Fields = { salt: payload.salt, iv: payload.iv, data: payload.data, mac: payload.mac };
  for (const [field, value] of Object.entries(base64Fields)) {
    if (typeof value !== "string") {
      throw new VaultCorruptError(`Vault payload field "${field}" is missing or not a string`);
    }
    let decoded: Uint8Array;
    try {
      decoded = base64ToBytes(value);
    } catch {
      throw new VaultCorruptError(`Vault payload field "${field}" is not valid base64`);
    }
    // A too-short salt isn't caught by base64ToBytes() itself (an empty
    // string decodes fine, to zero bytes) — it instead reaches hash-wasm's
    // argon2id() and throws a plain, untyped Error ("Salt should be at least
    // 8 bytes long"), the same class of leak as the invalid-base64 case
    // above. Every real salt this app has ever generated is 16 bytes
    // (DEFAULT_SALT_BYTES in engine.ts); 8 is hash-wasm's own documented
    // floor, used here as a generous lower bound rather than hardcoding 16
    // in case that constant ever changes.
    if (field === "salt" && decoded.length < 8) {
      throw new VaultCorruptError("Vault payload salt is too short to be valid");
    }
  }

  // KDF is chosen from the payload, so PBKDF2-era vaults still open.
  const keys = await deriveKeys(password, payload.salt, payload.kdf, onProgress);
  const json = await decryptVault(payload, keys);
  let vault: VaultData;
  try {
    vault = JSON.parse(json) as VaultData;
  } catch {
    // The HMAC already verified integrity before decryptVault() returned, so
    // this should be unreachable in practice — but if it ever isn't, this
    // should surface as our own typed error (caught via `instanceof` by
    // callers), not a raw SyntaxError.
    throw new VaultCorruptError("Decrypted vault content is not valid JSON");
  }
  return { vault, sessionKeys: keys };
}

/** Re-encrypt the (mutated) in-memory vault with the SAME session keys.
 *  The keys carry their salt + KDF params, so the payload re-opens correctly. */
export async function saveVault(vault: VaultData, sessionKeys: SessionKeys): Promise<string> {
  vault.meta.lastModifiedAt = new Date().toISOString();
  vault.meta.entryCount = vault.entries.length;
  const payload = await encryptVault(JSON.stringify(vault), sessionKeys, vault.meta.createdAt);
  return JSON.stringify(payload);
}

/**
 * Re-encrypt preserving the original createdAt from the existing on-disk
 * payload. Used by autosave. (Salt + KDF are carried by the session keys.)
 */
export async function reEncryptVault(
  vault: VaultData,
  sessionKeys: SessionKeys,
  existingPayloadJson: string,
): Promise<string> {
  let createdAt = vault.meta.createdAt;
  try {
    const existing = JSON.parse(existingPayloadJson) as VaultPayload;
    createdAt = existing.createdAt ?? createdAt;
  } catch {
    /* fall back to vault meta */
  }
  vault.meta.lastModifiedAt = new Date().toISOString();
  vault.meta.entryCount = vault.entries.length;
  const payload = await encryptVault(JSON.stringify(vault), sessionKeys, createdAt);
  return JSON.stringify(payload);
}

/** Change master password: derive new keys (new salt, Argon2id), re-encrypt. */
export async function changeMasterPassword(
  vault: VaultData,
  newPassword: string,
  onProgress?: (p: number) => void,
): Promise<{ encryptedPayload: string; sessionKeys: SessionKeys }> {
  const newKeys = await deriveKeys(newPassword, freshSalt(), DEFAULT_KDF, onProgress);
  vault.meta.lastModifiedAt = new Date().toISOString();
  const payload = await encryptVault(JSON.stringify(vault), newKeys, vault.meta.createdAt);
  return { encryptedPayload: JSON.stringify(payload), sessionKeys: newKeys };
}
