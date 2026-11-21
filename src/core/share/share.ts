/**
 * @file src/core/share/share.ts
 * Offline secure sharing of one entry.
 *
 * The entry (only the fields the sender chose) is encrypted with a fresh
 * random AES-256-GCM key into a small JSON "share file". The key is a
 * separate short code ("svk1-…") meant to go over a different channel than the
 * file. No server is involved.
 *
 * The expiry and the sender's display name are bound to the ciphertext as AAD,
 * so they can't be changed without breaking decryption. Expiry is enforced by
 * the receiving app: it limits casual reuse of a leaked file + code. It is
 * not a cryptographic guarantee (someone holding both can decrypt
 * past the date with their own tools).
 */
import { bytesToBase64, base64ToBytes, utf8 } from "../crypto/encoding";
import type { VaultEntry } from "../vault/schema";

export const SHARE_FILE_EXT = ".svshare";
const KEY_PREFIX = "svk1-";

/** Fields a share can carry. Never: id, folder, passkeys, ssh, attachments. */
export type SharedEntry = Pick<
  VaultEntry,
  "type" | "title" | "username" | "password" | "url" | "notes" | "totpSecret" | "customFields"
>;

export interface ShareOptions {
  includePassword: boolean;
  includeTotp: boolean;
  includeNotes: boolean;
  /** Milliseconds from now. */
  expiresInMs: number;
  /** Shown to the recipient ("from …"). */
  from?: string;
}

interface ShareFile {
  v: 1;
  expiresAt: string;
  from: string;
  iv: string;
  data: string;
}

export class ShareExpiredError extends Error {}
export class ShareInvalidError extends Error {}

const b64url = (b: Uint8Array) =>
  bytesToBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) =>
  base64ToBytes(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

const aad = (f: Pick<ShareFile, "expiresAt" | "from">) =>
  utf8(`svshare|1|${f.expiresAt}|${f.from}`);

export function pickShared(e: VaultEntry, o: ShareOptions): SharedEntry {
  return {
    type: e.type === "ssh" ? "note" : e.type,
    title: e.title,
    username: e.username,
    url: e.url,
    password: o.includePassword ? e.password : undefined,
    totpSecret: o.includeTotp ? e.totpSecret : undefined,
    notes: o.includeNotes ? e.notes : undefined,
    customFields: o.includePassword ? e.customFields : e.customFields.filter((f) => !f.protected),
  };
}

/** Returns the file content and the separate key code. */
export async function createShare(
  e: VaultEntry,
  o: ShareOptions,
  now = Date.now(),
): Promise<{ file: string; code: string; expiresAt: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const expiresAt = new Date(now + o.expiresInMs).toISOString();
  const from = (o.from ?? "").slice(0, 80);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad({ expiresAt, from }) },
      key,
      utf8(JSON.stringify(pickShared(e, o))),
    ),
  );
  const file: ShareFile = { v: 1, expiresAt, from, iv: bytesToBase64(iv), data: bytesToBase64(ct) };
  const code = KEY_PREFIX + b64url(raw);
  raw.fill(0);
  return { file: JSON.stringify(file), code, expiresAt };
}

/** Decrypt a share. Throws ShareInvalidError (wrong code / damaged file) or
 *  ShareExpiredError. */
export async function openShare(
  fileText: string,
  code: string,
  now = Date.now(),
): Promise<{ entry: SharedEntry; from: string; expiresAt: string }> {
  let f: ShareFile;
  try {
    f = JSON.parse(fileText);
  } catch {
    throw new ShareInvalidError("Not a SecureVault share file");
  }
  if (!f || f.v !== 1 || typeof f.data !== "string" || typeof f.iv !== "string")
    throw new ShareInvalidError("Not a SecureVault share file");
  const c = code.trim();
  if (!c.startsWith(KEY_PREFIX)) throw new ShareInvalidError("That isn't a share code");
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = unb64url(c.slice(KEY_PREFIX.length));
  } catch {
    throw new ShareInvalidError("That isn't a share code");
  }
  if (raw.length !== 32) throw new ShareInvalidError("That isn't a share code");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  raw.fill(0);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(f.iv), additionalData: aad(f) },
      key,
      base64ToBytes(f.data),
    );
  } catch {
    throw new ShareInvalidError("Wrong code, or the file was changed");
  }
  // Checked after decryption, so expiresAt is known to be authentic.
  if (Date.parse(f.expiresAt) < now) throw new ShareExpiredError("This share has expired");
  const entry = JSON.parse(new TextDecoder().decode(plain)) as SharedEntry;
  return { entry, from: f.from, expiresAt: f.expiresAt };
}
