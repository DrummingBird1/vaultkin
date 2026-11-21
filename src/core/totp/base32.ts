/**
 * @file src/core/totp/base32.ts
 * RFC 4648 Base32 codec. TOTP secrets use this encoding.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode a Base32 string (case-insensitive, padding optional) to bytes. */
export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  const out: number[] = [];
  let bits = 0,
    value = 0;
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid Base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Loose Base32 validator used by the AddEditEntry modal. */
export function validateBase32Secret(input: string): boolean {
  if (!input) return false;
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  if (clean.length === 0) return false;
  return /^[A-Z2-7]+$/.test(clean);
}
