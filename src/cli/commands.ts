/**
 * @file src/cli/commands.ts
 * Pure logic behind the `sv` CLI (no I/O): find entries, read fields, fill
 * templates. The vault is opened by sv.ts with the same serializer as the app.
 */
import type { VaultData, VaultEntry } from "../core/vault/schema";
import { generateTOTP } from "../core/totp/totp";

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** Exact (case-insensitive) title or id match first, then a unique substring match. */
export function findEntry(vault: VaultData, query: string): VaultEntry {
  const q = query.trim().toLowerCase();
  const exact = vault.entries.filter((e) => e.id === query || e.title.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const hits = exact.length
    ? exact
    : vault.entries.filter((e) => e.title.toLowerCase().includes(q));
  if (hits.length === 0) throw new CliError(`No entry matches "${query}"`, 3);
  if (hits.length > 1)
    throw new CliError(
      `"${query}" matches ${hits.length} entries; be more specific or use the id:\n` +
        hits.map((e) => `  ${e.id}  ${e.title}`).join("\n"),
      2,
    );
  return hits[0];
}

export const FIELDS = ["password", "username", "url", "notes", "totp", "title", "ssh-public-key"];

/** A field's value; custom fields by label. Throws when missing. */
export async function readField(e: VaultEntry, field: string, now = Date.now()): Promise<string> {
  const f = field.toLowerCase();
  let v: string | undefined;
  if (f === "password") v = e.password;
  else if (f === "username") v = e.username;
  else if (f === "url") v = e.url;
  else if (f === "notes") v = e.notes;
  else if (f === "title") v = e.title;
  else if (f === "ssh-public-key") v = e.ssh?.publicKey;
  else if (f === "totp") {
    if (e.totpSecret)
      v = (
        await generateTOTP(e.totpSecret, {
          algorithm: e.totpAlgorithm,
          digits: e.totpDigits,
          period: e.totpPeriod,
          time: now,
        })
      ).code;
  } else v = e.customFields.find((c) => c.label.toLowerCase() === f)?.value;
  if (v === undefined || v === "") throw new CliError(`"${e.title}" has no ${field}`, 3);
  return v;
}

/** One line per entry: id, type, title, username. Never secrets. */
export function listEntries(vault: VaultData, filter?: string): string {
  const q = filter?.toLowerCase();
  return vault.entries
    .filter((e) => !q || e.title.toLowerCase().includes(q))
    .map((e) => [e.id, e.type, e.title, e.username ?? ""].join("\t"))
    .join("\n");
}

/** {{ sv://<title or id>/<field> }}; title may be percent-encoded. */
const REF = /\{\{\s*sv:\/\/([^/}\s]+)\/([^}\s]+)\s*\}\}/g;

export async function inject(template: string, vault: VaultData): Promise<string> {
  const refs = [...template.matchAll(REF)];
  const values = new Map<string, string>();
  for (const m of refs) {
    if (values.has(m[0])) continue;
    const entry = findEntry(vault, decodeURIComponent(m[1]));
    values.set(m[0], await readField(entry, decodeURIComponent(m[2])));
  }
  return template.replace(REF, (whole) => values.get(whole)!);
}
