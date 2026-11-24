/**
 * @file src/services/backup-text.ts
 * Text forms of an encrypted vault backup: the raw payload (a .svault file)
 * and the `SVQR:<i>/<n>:` parts shown as QR codes. Ciphertext only.
 */
const CHUNK_SIZE = 700; // characters per QR (kept well under v40 capacity)

/** Parts are missing, duplicated with different content, or from two series. */
export class IncompleteBackupError extends Error {
  constructor(public readonly missing: number[]) {
    super("Backup parts are missing or do not belong together");
    this.name = "IncompleteBackupError";
  }
}

export function splitBackup(payload: string): string[] {
  const total = Math.ceil(payload.length / CHUNK_SIZE);
  return Array.from(
    { length: total },
    (_, i) => `SVQR:${i + 1}/${total}:${payload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)}`,
  );
}

/** Returns the encrypted payload from a file's text or pasted QR parts (any order). */
export function joinBackup(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("SVQR:")) return trimmed;
  const found = [...trimmed.matchAll(/SVQR:(\d{1,5})\/(\d{1,5}):([\s\S]*?)(?=SVQR:\d|$)/g)];
  const parts = new Map<number, string>();
  let total = 0;
  for (const [, i, n, raw] of found) {
    const index = Number(i);
    // The payload is JSON of base64 and ISO dates: whitespace is only ever
    // line breaks added by the scanner app.
    const part = raw.replace(/\s+/g, "");
    if (total && total !== Number(n)) throw new IncompleteBackupError([]);
    total = Number(n);
    if (parts.has(index) && parts.get(index) !== part) throw new IncompleteBackupError([]);
    parts.set(index, part);
  }
  const missing: number[] = [];
  for (let i = 1; i <= total; i++) if (!parts.has(i)) missing.push(i);
  if (!total || missing.length || parts.size !== total) throw new IncompleteBackupError(missing);
  return Array.from({ length: total }, (_, i) => parts.get(i + 1)).join("");
}
