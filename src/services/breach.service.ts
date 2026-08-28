/**
 * @file breach.service.ts
 * @description Have I Been Pwned password breach check via k-anonymity.
 *
 * PRIVACY MODEL:
 *  - Computes SHA-1 of the password in-browser
 *  - Sends ONLY the first 5 hex chars of the hash to api.pwnedpasswords.com
 *  - The API returns ~500 candidate hash suffixes
 *  - We do the final match locally — the password never leaves the device
 *
 * This is the same model used by Bitwarden, 1Password, and Firefox Lockwise.
 * Reference: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

import { HIBP_TIMEOUT_MS, HIBP_CONCURRENCY, HIBP_CACHE_MAX } from "../constants";

const HIBP_RANGE_API = "https://api.pwnedpasswords.com/range/";

export interface BreachResult {
  /** Number of times this password has been seen in known breaches */
  count: number;
  /** True if the password has been seen at least once */
  isPwned: boolean;
}

/** SHA-1 a string and return uppercase hex. */
async function sha1Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

export const BreachService = {
  /**
   * Check if a password has been seen in any known data breach.
   * Returns count > 0 if pwned. Throws on network failure.
   *
   * Cached results are kept in a session-scope Map (cleared on lock).
   */
  _cache: new Map<string, BreachResult>(),

  async check(password: string): Promise<BreachResult> {
    if (!password) return { count: 0, isPwned: false };

    // Check cache first (keyed by hash, not password, to avoid extra hashing).
    // On a hit, re-insert to mark it most-recently-used for LRU eviction.
    const hash = await sha1Hex(password);
    const cached = this._cache.get(hash);
    if (cached) {
      this._cache.delete(hash);
      this._cache.set(hash, cached);
      return cached;
    }

    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // A stalled HIBP request must not block the Health dashboard's batch scan
    // indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(HIBP_RANGE_API + prefix, {
        headers: { "Add-Padding": "true" }, // padding obscures real result count
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HIBP API returned ${res.status}`);

    const text = await res.text();
    const lines = text.split("\n");
    let count = 0;
    for (const line of lines) {
      const [s, c] = line.trim().split(":");
      if (s === suffix) {
        count = parseInt(c, 10) || 0;
        break;
      }
    }

    const result: BreachResult = { count, isPwned: count > 0 };
    this._cache.set(hash, result);
    if (this._cache.size > HIBP_CACHE_MAX) {
      // Drop the oldest entry (Map iteration is insertion order).
      const oldest = this._cache.keys().next().value;
      if (oldest !== undefined) this._cache.delete(oldest);
    }
    return result;
  },

  /** Bulk-check an array of passwords. Returns map of password → result. */
  async checkBatch(passwords: string[]): Promise<Map<string, BreachResult>> {
    const out = new Map<string, BreachResult>();
    // Bounded concurrency: HIBP's range API has generous rate limits, and
    // requests are pure GET + 5-hex-chars only — but unbounded parallelism
    // would still mean opening N sockets for a vault with hundreds of unique
    // passwords. HIBP_CONCURRENCY is a safe middle ground that cuts wall time
    // ~6x vs serial.
    let i = 0;
    const workers = Array.from(
      { length: Math.min(HIBP_CONCURRENCY, passwords.length) },
      async () => {
        while (true) {
          const idx = i++;
          if (idx >= passwords.length) return;
          const pw = passwords[idx];
          try {
            out.set(pw, await this.check(pw));
          } catch {
            out.set(pw, { count: 0, isPwned: false });
          }
        }
      },
    );
    await Promise.all(workers);
    return out;
  },

  /** Clear the in-memory cache. Called on lock. */
  clearCache() {
    this._cache.clear();
  },
};
