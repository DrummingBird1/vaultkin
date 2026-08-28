/**
 * @file src/core/vault/vault-types.ts
 * Single source of truth for crypto-layer types. Both `engine.ts` and
 * `serializer.ts` import from here to avoid the import cycle that caused
 * the original black-screen crash.
 */

import type { VaultData } from "./schema";

/** KDF descriptor — non-secret parameters needed to re-derive the key. */
export interface KdfParams {
  name: "PBKDF2-SHA256" | "Argon2id";
  iterations: number; // PBKDF2 iterations OR Argon2 time cost (t)
  memoryKiB?: number; // Argon2 only
  parallelism?: number; // Argon2 only
}

export interface SessionKeys {
  encKey: CryptoKey;
  macKey: CryptoKey;
  /** KDF salt (base64) these keys were derived from. Carried so re-encryption
   *  reuses the same salt — otherwise a fresh salt would no longer match the
   *  in-memory keys and the vault would fail its integrity check on re-open. */
  salt: string;
  /** Full KDF descriptor these keys were derived with (name + cost params). */
  kdf: KdfParams;
}

/**
 * The on-disk vault payload. Contains the encrypted blob plus the
 * non-secret parameters needed to re-derive the key on next unlock.
 */
export interface VaultPayload {
  version: 1;
  kdf: KdfParams;
  salt: string; // base64
  iv: string; // base64 — 12 bytes for AES-GCM
  data: string; // base64 ciphertext
  mac: string; // base64 HMAC-SHA256 over (kdf params || iv || data)
  createdAt: string;
  updatedAt: string;
}

/** Wipe in-memory references to session keys (Crypto API CryptoKey is opaque
 *  to JS, so we can't zero the bytes — we just drop the references). */
export function wipeSessionKeys(_keys: SessionKeys | null): void {
  // CryptoKey is non-extractable; GC will reclaim it once references drop.
}

/** A blank vault, used when creating a fresh one. */
export function createDefaultVaultData(): Omit<VaultData, "schemaVersion"> {
  const now = new Date().toISOString();
  return {
    entries: [],
    folders: [],
    settings: {
      autoLockMs: 5 * 60 * 1000,
      defaultCategory: "websites",
      theme: "dark",
      accentColor: "#6366F1",
      viewMode: "grid",
      lockOnHide: false,
    },
    meta: {
      createdAt: now,
      lastModifiedAt: now,
      entryCount: 0,
    },
  };
}
