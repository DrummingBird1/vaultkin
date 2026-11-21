/**
 * @file src/core/password/generator.ts
 * Crypto-strong password + passphrase generation.
 */
import { WORDLIST } from "./wordlist";

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
  if (opts.digits ?? true) alphabet += DIGIT;
  if (opts.symbols ?? true) alphabet += SYMBL;
  if (opts.excludeAmbiguous) {
    for (const ch of AMBIG) alphabet = alphabet.replaceAll(ch, "");
  }
  if (alphabet.length === 0) throw new Error("No character classes selected");

  // crypto.getRandomValues + rejection sampling avoids modulo bias.
  //
  // CRITICAL: the buffer must be filled *before* the loop reads from it. It's
  // sized at length*2 specifically to leave headroom for rejection-sampling
  // retries — but that headroom means a naive "refill only when exhausted"
  // check never fires during the first pass (out.length reaches `length`,
  // and the loop exits, long before bi reaches buf.length). A previous
  // version of this function only called crypto.getRandomValues() inside
  // that exhaustion check, so it silently read a zero-initialized Uint32Array
  // for the entire first (and, in every normal call, only) pass — every
  // "randomly generated" password was the first alphabet character repeated
  // `length` times. Verified with a real crypto call in unit tests; always
  // prime the buffer immediately after allocating it.
  const out: string[] = [];
  const buf = new Uint32Array(length * 2);
  crypto.getRandomValues(buf);
  let bi = 0;
  const max = 0xffffffff - (0xffffffff % alphabet.length);
  while (out.length < length) {
    if (bi >= buf.length) {
      crypto.getRandomValues(buf);
      bi = 0;
    }
    const r = buf[bi++];
    if (r > max) continue;
    out.push(alphabet[r % alphabet.length]);
  }
  return out.join("");
}

export interface PassphraseOptions {
  /** Number of words. Default 5. */
  words?: number;
  /** Separator between words. Default "-". */
  separator?: string;
  /** Capitalize the first letter of each word. Default true. */
  capitalize?: boolean;
  /** Append a random 2-digit number to one word for a bit of extra entropy
   *  and to satisfy sites that require "at least one digit". Default true. */
  includeNumber?: boolean;
}

/** Pick `count` crypto-random indices into `WORDLIST` (with replacement —
 *  Diceware passphrases traditionally allow word repeats; the entropy math
 *  assumes independent draws). */
function randomWordIndices(count: number): number[] {
  const out: number[] = [];
  const buf = new Uint32Array(count * 2);
  crypto.getRandomValues(buf); // must prime before reading — see generatePassword() above
  let bi = 0;
  const max = 0xffffffff - (0xffffffff % WORDLIST.length);
  while (out.length < count) {
    if (bi >= buf.length) {
      crypto.getRandomValues(buf);
      bi = 0;
    }
    const r = buf[bi++];
    if (r > max) continue;
    out.push(r % WORDLIST.length);
  }
  return out;
}

export function generatePassphrase(opts: PassphraseOptions = {}): string {
  const wordCount = Math.max(3, Math.min(10, opts.words ?? 5));
  const separator = opts.separator ?? "-";
  const capitalize = opts.capitalize ?? true;
  const includeNumber = opts.includeNumber ?? true;

  const indices = randomWordIndices(wordCount);
  const words = indices.map((i) => {
    const w = WORDLIST[i];
    return capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });

  if (includeNumber) {
    const digitBuf = new Uint32Array(1);
    crypto.getRandomValues(digitBuf);
    const digits = String(digitBuf[0] % 100).padStart(2, "0");
    const pos = digitBuf[0] % words.length;
    words[pos] = words[pos] + digits;
  }

  return words.join(separator);
}

/** Entropy (bits) of a passphrase generated with the given options, for
 *  display alongside the result — independent of analyzeStrength's
 *  character-class heuristics, which underestimate dictionary-word entropy. */
export function passphraseEntropyBits(wordCount: number, includeNumber = true): number {
  const perWord = Math.log2(WORDLIST.length);
  const numberBits = includeNumber ? Math.log2(100) : 0; // 2-digit suffix, one of 100
  return Math.round(wordCount * perWord + numberBits);
}
