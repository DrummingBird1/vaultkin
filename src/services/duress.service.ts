/**
 * @file duress.service.ts
 * @description Duress (panic) password support.
 *
 * THREAT MODEL:
 *  - Coercion attack: someone forces the user to unlock the vault.
 *  - The user types the duress password instead of the real master.
 *  - The vault appears to "open" but shows decoy data, AND the real vault
 *    is silently wiped from local storage.
 *  - To the attacker, this looks like a successful unlock with sparse data —
 *    indistinguishable from a user who hasn't added much yet.
 *
 * IMPLEMENTATION:
 *  - The duress password is hashed with salted Argon2id (19 MiB, t=2, p=1)
 *    and stored in localStorage under "sv_duress_hash" as
 *    `argon2id$<salt b64>$<hash hex>`. Hash only — never the password itself.
 *    Older installs stored an unsalted SHA-256 hex; it is still recognised
 *    and is replaced the next time the user enrolls.
 *  - On every unlock attempt, we first check if the entered password's hash
 *    matches the stored duress hash. If yes → trigger duress mode.
 *  - In duress mode:
 *      1. The real encrypted vault payload is deleted (IPCService.vault.delete())
 *      2. A fresh empty decoy vault is created with the duress password as
 *         its master, so subsequent unlocks with the same password keep "working".
 *      3. Optionally: an alert is logged so the user (after the situation
 *         resolves) knows it was triggered.
 *
 * LIMITATIONS:
 *  - Synced backups (WebDAV, etc.) are NOT touched. The user must remove
 *    those manually before any duress event for full protection.
 *  - A sophisticated attacker who knows about duress passwords can potentially
 *    detect the trigger by observing that storage has been overwritten — but
 *    plausible deniability is the goal here, not perfect concealment.
 */

import { argon2id } from "hash-wasm";

const DURESS_HASH_KEY = "sv_duress_hash";
const DURESS_TRIGGERED_KEY = "sv_duress_triggered_at";

const ARGON = { memorySize: 19 * 1024, iterations: 2, parallelism: 1, hashLength: 32 };

/** SHA-256 hex, only to recognise a hash enrolled before M4. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function argonHex(password: string, salt: Uint8Array): Promise<string> {
  return argon2id({ password, salt, ...ARGON, outputType: "hex" });
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const DuressService = {
  /** Has the user enrolled a duress password? */
  isEnrolled(): boolean {
    return !!localStorage.getItem(DURESS_HASH_KEY);
  },

  /** Enroll or replace the duress password. */
  async enroll(duressPassword: string, realPassword: string): Promise<void> {
    if (!duressPassword) throw new Error("Duress password cannot be empty");
    if (duressPassword === realPassword)
      throw new Error("Duress password must be different from the master password");
    if (duressPassword.length < 6) throw new Error("Duress password must be at least 6 characters");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await argonHex(duressPassword, salt);
    localStorage.setItem(DURESS_HASH_KEY, `argon2id$${b64(salt)}$${hash}`);
  },

  /** Remove the duress password (disable duress feature). */
  disenroll(): void {
    localStorage.removeItem(DURESS_HASH_KEY);
    localStorage.removeItem(DURESS_TRIGGERED_KEY);
  },

  /**
   * Check if the entered password matches the enrolled duress password.
   * Use BEFORE attempting to decrypt the vault.
   */
  async isDuress(enteredPassword: string): Promise<boolean> {
    const stored = localStorage.getItem(DURESS_HASH_KEY);
    if (!stored || !enteredPassword) return false;
    const parts = stored.split("$");
    if (parts.length === 3 && parts[0] === "argon2id") {
      const hash = await argonHex(enteredPassword, unb64(parts[1]));
      return constantTimeEqual(hash, parts[2]);
    }
    return constantTimeEqual(await sha256Hex(enteredPassword), stored); // legacy
  },

  /** Mark that the duress trigger fired (for later forensic review by the user). */
  markTriggered(): void {
    localStorage.setItem(DURESS_TRIGGERED_KEY, new Date().toISOString());
  },

  /** Check if duress was triggered while the user was away. */
  wasTriggered(): string | null {
    return localStorage.getItem(DURESS_TRIGGERED_KEY);
  },

  /** Clear the triggered flag (after the user has acknowledged it). */
  acknowledgeTrigger(): void {
    localStorage.removeItem(DURESS_TRIGGERED_KEY);
  },
};
