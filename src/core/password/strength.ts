/**
 * @file src/core/password/strength.ts
 * Password strength analyzer. Approximation of zxcvbn (much smaller).
 */

export interface StrengthAnalysis {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very Weak" | "Weak" | "Fair" | "Strong" | "Very Strong";
  /** Raw character-pool entropy in bits. */
  entropy: number;
  /** Entropy after subtracting penalties for common patterns. */
  effectiveEntropy: number;
  feedback: string[];
  /** i18n keys matching `feedback` (strength.feedback.*), for translated UI. */
  feedbackKeys: StrengthFeedbackKey[];
  /** Compact English display, kept for backward compatibility. */
  crackTimeDisplay: string;
  /** Structured estimate for localized display (see formatCrackTime in the UI). */
  crackTime: CrackTime;
}

export type StrengthFeedbackKey = "empty" | "length" | "common" | "repeated" | "sequence";

/** Offline crack-time estimate: instant, a value in a unit, or effectively never. */
export type CrackTime =
  | { kind: "instant" }
  | { kind: "duration"; unit: "second" | "minute" | "hour" | "day" | "year"; value: number }
  | { kind: "eternity" };

const COMMON_PASSWORDS = new Set([
  "password",
  "123456",
  "123456789",
  "qwerty",
  "abc123",
  "letmein",
  "monkey",
  "111111",
  "iloveyou",
  "admin",
  "welcome",
  "login",
  "passw0rd",
  "master",
  "hello",
  "freedom",
  "whatever",
  "dragon",
  "trustno1",
  "superman",
]);

const SCORE_LABELS = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"] as const;

export function analyzeStrength(pw: string): StrengthAnalysis {
  if (!pw) {
    return {
      score: 0,
      label: "Very Weak",
      entropy: 0,
      effectiveEntropy: 0,
      feedback: ["Enter a password."],
      feedbackKeys: ["empty"],
      crackTimeDisplay: "instant",
      crackTime: { kind: "instant" },
    };
  }

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  pool = Math.max(pool, 1);

  const entropy = pw.length * Math.log2(pool);

  // Penalties
  let penalty = 0;
  const feedback: string[] = [];
  const feedbackKeys: StrengthFeedbackKey[] = [];
  const note = (key: StrengthFeedbackKey, text: string) => {
    feedbackKeys.push(key);
    feedback.push(text);
  };
  if (pw.length < 12) {
    penalty += 10;
    note("length", "Aim for 12+ characters.");
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    penalty += 30;
    note("common", "This is a commonly leaked password.");
  }
  if (/^(.)\1+$/.test(pw)) {
    penalty += 15;
    note("repeated", "Repeated characters add little entropy.");
  }
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw)) {
    penalty += 8;
    note("sequence", "Avoid sequences like 1234 or abcd.");
  }

  const effectiveEntropy = Math.max(0, entropy - penalty);

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (effectiveEntropy >= 80) score = 4;
  else if (effectiveEntropy >= 60) score = 3;
  else if (effectiveEntropy >= 40) score = 2;
  else if (effectiveEntropy >= 25) score = 1;

  // Rough crack time: assume 10^10 guesses/sec (high-end GPU offline).
  const guesses = Math.pow(2, effectiveEntropy);
  const seconds = guesses / 1e10;
  const crackTimeDisplay = humanizeSeconds(seconds);
  const crackTime = toCrackTime(seconds);

  return {
    score,
    label: SCORE_LABELS[score],
    entropy,
    effectiveEntropy,
    feedback,
    feedbackKeys,
    crackTimeDisplay,
    crackTime,
  };
}

// Backwards-compat alias for code that hasn't migrated yet.
export const analyzePassword = analyzeStrength;

function humanizeSeconds(s: number): string {
  if (s < 1) return "instant";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 31_536_000) return `${Math.round(s / 86400)}d`;
  if (s < 31_536_000 * 100) return `${Math.round(s / 31_536_000)}y`;
  if (s < 31_536_000 * 1_000_000) return `${Math.round(s / 31_536_000 / 1000)}k years`;
  return "centuries";
}

const YEAR_S = 31_536_000;
/** More than a billion years: shown as "effectively never" rather than a number. */
const ETERNITY_YEARS = 1e9;

export function toCrackTime(s: number): CrackTime {
  if (!(s >= 1)) return { kind: "instant" };
  if (s < 60) return { kind: "duration", unit: "second", value: Math.round(s) };
  if (s < 3600) return { kind: "duration", unit: "minute", value: Math.round(s / 60) };
  if (s < 86400) return { kind: "duration", unit: "hour", value: Math.round(s / 3600) };
  if (s < YEAR_S) return { kind: "duration", unit: "day", value: Math.round(s / 86400) };
  const years = s / YEAR_S;
  if (years < ETERNITY_YEARS) return { kind: "duration", unit: "year", value: Math.round(years) };
  return { kind: "eternity" };
}
