/**
 * @file src/electron/device-unlock.ts
 * "Remember this device": keeps the vault's 64-byte derived key encrypted by
 * the OS keystore (Electron safeStorage: DPAPI on Windows, Keychain on
 * macOS, libsecret/kwallet on Linux), bound to the current OS user.
 *
 * Rules:
 *  - Opt-in. Saved only after the master password was verified (renderer).
 *  - Tied to the vault's KDF salt: a master-password change makes it stale,
 *    and the renderer then clears it.
 *  - Expires 14 days after the last master-password unlock.
 *  - macOS: Touch ID is required before the key is released.
 *  - Refused when the OS keystore is unavailable or only offers the Linux
 *    "basic_text" fallback (which is not encryption).
 */
import { app, safeStorage, systemPreferences } from "electron";
import * as fs from "fs";
import * as path from "path";

export const DEVICE_UNLOCK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Stored {
  v: 1;
  salt: string;
  blob: string; // base64 of safeStorage ciphertext of base64(raw key)
  savedAt: number;
}

export type DeviceUnlockStatus =
  | { supported: false }
  | { supported: true; enrolled: false }
  | { supported: true; enrolled: true; salt: string; expiresAt: number };

const file = () => path.join(app.getPath("userData"), "device-unlock.json");

export function keystoreAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (process.platform === "linux") {
    const backend = safeStorage.getSelectedStorageBackend?.();
    if (backend === "basic_text" || backend === "unknown") return false;
  }
  return true;
}

function read(): Stored | null {
  try {
    const s = JSON.parse(fs.readFileSync(file(), "utf8")) as Stored;
    if (s.v !== 1 || typeof s.salt !== "string" || typeof s.blob !== "string") return null;
    if (Date.now() - s.savedAt > DEVICE_UNLOCK_MAX_AGE_MS) {
      clear();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function status(): DeviceUnlockStatus {
  if (!keystoreAvailable()) return { supported: false };
  const s = read();
  if (!s) return { supported: true, enrolled: false };
  return {
    supported: true,
    enrolled: true,
    salt: s.salt,
    expiresAt: s.savedAt + DEVICE_UNLOCK_MAX_AGE_MS,
  };
}

export function save(salt: string, rawB64: string): boolean {
  if (!keystoreAvailable()) return false;
  const blob = safeStorage.encryptString(rawB64).toString("base64");
  const s: Stored = { v: 1, salt, blob, savedAt: Date.now() };
  fs.writeFileSync(file(), JSON.stringify(s), { mode: 0o600 });
  return true;
}

/** Release the key (after Touch ID on macOS). Null when absent, expired,
 *  for another salt, or the user cancelled. */
export async function load(salt: string): Promise<string | null> {
  const s = read();
  if (!s || s.salt !== salt || !keystoreAvailable()) return null;
  if (process.platform === "darwin" && systemPreferences.canPromptTouchID()) {
    try {
      await systemPreferences.promptTouchID("unlock SecureVault");
    } catch {
      return null;
    }
  }
  try {
    return safeStorage.decryptString(Buffer.from(s.blob, "base64"));
  } catch {
    clear();
    return null;
  }
}

export function clear(): void {
  try {
    fs.rmSync(file(), { force: true });
  } catch {
    /* already gone */
  }
}
