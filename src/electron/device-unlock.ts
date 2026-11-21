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
 *  - Windows: bound to Windows Hello when available (windows-hello.ts): the
 *    key is additionally wrapped with a secret only a Hello prompt yields.
 *  - macOS: Touch ID is required before the key is released.
 *  - Refused when the OS keystore is unavailable or only offers the Linux
 *    "basic_text" fallback (which is not encryption).
 */
import { app, safeStorage, systemPreferences } from "electron";
import { randomBytes } from "crypto";
import { wrap, unwrap, wrapKeyFromSignature as wrapKey } from "./key-wrap";
import { helloSign, helloSupported } from "./windows-hello";
import * as fs from "fs";
import * as path from "path";

export const DEVICE_UNLOCK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Stored {
  v: 1;
  salt: string;
  /** base64 of safeStorage ciphertext of: base64(raw key), or — with
   *  `hello` — base64(iv || tag || AES-256-GCM(raw key)) under the Hello secret. */
  blob: string;
  savedAt: number;
  /** Windows Hello binding: the (non-secret) challenge that gets signed. */
  hello?: { challenge: string };
}

export type Protection = "hello" | "touchid" | "account";

/** Tests only (unpackaged builds): skip Windows Hello for NEW enrollments. */
const helloDisabledForTests = () => !app.isPackaged && !!process.env.SV_DEVICE_UNLOCK_NO_HELLO;

export type DeviceUnlockStatus =
  | { supported: false }
  | { supported: true; enrolled: false }
  | {
      supported: true;
      enrolled: true;
      salt: string;
      expiresAt: number;
      protection: Protection;
    };

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
    protection: s.hello
      ? "hello"
      : process.platform === "darwin" && systemPreferences.canPromptTouchID()
        ? "touchid"
        : "account",
  };
}

/**
 * Store the key. On Windows with Hello available this prompts Hello (and
 * creates the Hello key the first time); cancelling means nothing is saved.
 */
export async function save(salt: string, rawB64: string): Promise<boolean> {
  if (!keystoreAvailable()) return false;
  let payload = rawB64;
  let hello: Stored["hello"];
  if (process.platform === "win32" && !helloDisabledForTests() && (await helloSupported())) {
    const challenge = randomBytes(32).toString("base64");
    const sig = await helloSign(challenge);
    if (!sig) return false;
    payload = wrap(rawB64, wrapKey(sig));
    hello = { challenge };
  }
  const blob = safeStorage.encryptString(payload).toString("base64");
  const s: Stored = { v: 1, salt, blob, savedAt: Date.now(), ...(hello ? { hello } : {}) };
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
      await systemPreferences.promptTouchID("unlock Vaultkin");
    } catch {
      return null;
    }
  }
  let inner: string;
  try {
    inner = safeStorage.decryptString(Buffer.from(s.blob, "base64"));
  } catch {
    clear();
    return null;
  }
  if (!s.hello) return inner;
  const sig = await helloSign(s.hello.challenge);
  if (!sig) return null; // cancelled: keep the key for next time
  try {
    return unwrap(inner, wrapKey(sig));
  } catch {
    clear(); // Hello key was reset/replaced: this binding can never open again
    return null;
  }
}

/** The master password was just used for this vault: restart the 14-day
 *  window. The key itself is unchanged (same salt → same derived key), so no
 *  Hello prompt is needed. */
export function refresh(salt: string): boolean {
  const s = read();
  if (!s || s.salt !== salt) return false;
  fs.writeFileSync(file(), JSON.stringify({ ...s, savedAt: Date.now() }), { mode: 0o600 });
  return true;
}

export function clear(): void {
  try {
    fs.rmSync(file(), { force: true });
  } catch {
    /* already gone */
  }
}
