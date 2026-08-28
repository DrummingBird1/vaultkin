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
 *  - The duress password is hashed with SHA-256 and stored in localStorage
 *    under "sv_duress_hash". Hash only — never the password itself.
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

const DURESS_HASH_KEY = "sv_duress_hash";
const DURESS_TRIGGERED_KEY = "sv_duress_triggered_at";

/** SHA-256 a string and return lowercase hex. */
async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
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
    if (duressPassword.length < 6)
      throw new Error("Duress password must be at least 6 characters");
    const hash = await sha256Hex(duressPassword);
    localStorage.setItem(DURESS_HASH_KEY, hash);
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
    if (!stored) return false;
    const hash = await sha256Hex(enteredPassword);
    // Constant-time comparison (small effort against timing attacks)
    if (hash.length !== stored.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.charCodeAt(i);
    return diff === 0;
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
