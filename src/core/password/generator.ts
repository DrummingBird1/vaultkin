/**
 * @file src/core/password/generator.ts
 * Crypto-strong password generator.
 */

export interface GenerateOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  digits?: boolean;
  symbols?: boolean;
  excludeAmbiguous?: boolean;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGIT = "0123456789";
const SYMBL = "!@#$%^&*()-_=+[]{};:,.<>/?";
const AMBIG = "0O1lI|`'\"";

export function generatePassword(opts: GenerateOptions = {}): string {
  const length = Math.max(4, Math.min(128, opts.length ?? 20));
  let alphabet = "";
  if (opts.uppercase ?? true) alphabet += UPPER;
  if (opts.lowercase ?? true) alphabet += LOWER;
  if (opts.digits    ?? true) alphabet += DIGIT;
  if (opts.symbols   ?? true) alphabet += SYMBL;
  if (opts.excludeAmbiguous) {
    for (const ch of AMBIG) alphabet = alphabet.replaceAll(ch, "");
  }
  if (alphabet.length === 0) throw new Error("No character classes selected");

  // crypto.getRandomValues + rejection sampling avoids modulo bias.
  const out: string[] = [];
  const buf = new Uint32Array(length * 2);
  let bi = 0;
  const max = 0xffffffff - (0xffffffff % alphabet.length);
  while (out.length < length) {
    if (bi >= buf.length) { crypto.getRandomValues(buf); bi = 0; }
    const r = buf[bi++];
    if (r > max) continue;
    out.push(alphabet[r % alphabet.length]);
  }
  return out.join("");
}
