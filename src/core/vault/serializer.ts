/**
 * @file src/core/vault/serializer.ts
 * App-facing crypto façade. Outside `core/`, code calls these functions
 * (and nothing in `engine.ts`).
 */

import { deriveKeys, encryptVault, decryptVault, DEFAULT_KDF, DEFAULT_SALT_BYTES } from "./engine";
import type { SessionKeys, VaultPayload } from "./vault-types";
import type { VaultData } from "./schema";
import { bytesToBase64 } from "../crypto/encoding";

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
    throw new Error("Vault payload is corrupted or not valid JSON");
  }
  if (payload.version !== 1) throw new Error(`Unsupported vault version: ${payload.version}`);

  // KDF is chosen from the payload, so PBKDF2-era vaults still open.
  const keys = await deriveKeys(password, payload.salt, payload.kdf, onProgress);
  const json = await decryptVault(payload, keys);
  const vault = JSON.parse(json) as VaultData;
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
  } catch { /* fall back to vault meta */ }
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
