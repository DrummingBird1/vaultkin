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
  crackTimeDisplay: string;
}

const COMMON_PASSWORDS = new Set([
  "password","123456","123456789","qwerty","abc123","letmein","monkey",
  "111111","iloveyou","admin","welcome","login","passw0rd","master",
  "hello","freedom","whatever","dragon","trustno1","superman",
]);

const SCORE_LABELS = ["Very Weak","Weak","Fair","Strong","Very Strong"] as const;

export function analyzeStrength(pw: string): StrengthAnalysis {
  if (!pw) {
    return { score: 0, label: "Very Weak", entropy: 0, effectiveEntropy: 0, feedback: ["Enter a password."], crackTimeDisplay: "instant" };
  }

  let pool = 0;
  if (/[a-z]/.test(pw))     pool += 26;
  if (/[A-Z]/.test(pw))     pool += 26;
  if (/\d/.test(pw))        pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  pool = Math.max(pool, 1);

  const entropy = pw.length * Math.log2(pool);

  // Penalties
  let penalty = 0;
  const feedback: string[] = [];
  if (pw.length < 12) { penalty += 10; feedback.push("Aim for 12+ characters."); }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) { penalty += 30; feedback.push("This is a commonly leaked password."); }
  if (/^(.)\1+$/.test(pw))   { penalty += 15; feedback.push("Repeated characters add little entropy."); }
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw)) {
    penalty += 8; feedback.push("Avoid sequences like 1234 or abcd.");
  }

  const effectiveEntropy = Math.max(0, entropy - penalty);

  let score: 0|1|2|3|4 = 0;
  if (effectiveEntropy >= 80) score = 4;
  else if (effectiveEntropy >= 60) score = 3;
  else if (effectiveEntropy >= 40) score = 2;
  else if (effectiveEntropy >= 25) score = 1;

  // Rough crack time: assume 10^10 guesses/sec (high-end GPU offline).
  const guesses = Math.pow(2, effectiveEntropy);
  const seconds = guesses / 1e10;
  const crackTimeDisplay = humanizeSeconds(seconds);

  return {
    score,
    label: SCORE_LABELS[score],
    entropy,
    effectiveEntropy,
    feedback,
    crackTimeDisplay,
  };
}

// Backwards-compat alias for code that hasn't migrated yet.
export const analyzePassword = analyzeStrength;

function humanizeSeconds(s: number): string {
  if (s < 1) return "instant";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s/60)}m`;
  if (s < 86400) return `${Math.round(s/3600)}h`;
  if (s < 31_536_000) return `${Math.round(s/86400)}d`;
  if (s < 31_536_000 * 100) return `${Math.round(s/31_536_000)}y`;
  if (s < 31_536_000 * 1_000_000) return `${Math.round(s/31_536_000/1000)}k years`;
  return "centuries";
}
