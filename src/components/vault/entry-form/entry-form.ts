/**
 * @file entry-form.ts
 * Pure, testable logic behind the Add/Edit Entry form: URL normalization and
 * validation, TOTP secret cleanup, entry-type inference, payload building.
 * Validation returns i18n KEYS (entry.errors.*); the UI translates them.
 */
import type {
  CategoryType,
  CustomField,
  EntryType,
  SshKeyData,
  VaultEntry,
} from "../../../core/vault/schema";
import { validateBase32Secret } from "../../../core/totp/base32";

export type EntryTab = "login" | "notes" | "card" | "ssh" | "fields";

export interface EntryFormState {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  totpSecret: string;
  category: CategoryType;
  favorite: boolean;
  tags: string[];
  customFields: CustomField[];
  cardNumber: string;
  cardHolder: string;
  cardExpiry: string;
  cardCVV: string;
  ssh: SshKeyData | null;
}

/** Label: t(`entry.categories.${value}`). */
export const CATEGORIES: Array<{ value: CategoryType; emoji: string }> = [
  { value: "websites", emoji: "🌐" },
  { value: "apps", emoji: "📱" },
  { value: "finance", emoji: "💳" },
  { value: "gaming", emoji: "🎮" },
  { value: "servers", emoji: "🖥️" },
  { value: "identity", emoji: "🪪" },
  { value: "email", emoji: "📧" },
  { value: "custom", emoji: "📁" },
];

export function initialState(entry?: VaultEntry | null): EntryFormState {
  return {
    title: entry?.title ?? "",
    username: entry?.username ?? "",
    password: entry?.password ?? "",
    url: entry?.url ?? "",
    notes: entry?.notes ?? "",
    totpSecret: entry?.totpSecret ?? "",
    category: entry?.category ?? "websites",
    favorite: entry?.favorite ?? false,
    tags: entry?.tags ?? [],
    customFields: entry?.customFields ?? [],
    cardNumber: entry?.cardNumber ?? "",
    cardHolder: entry?.cardHolder ?? "",
    cardExpiry: entry?.cardExpiry ?? "",
    cardCVV: entry?.cardCVV ?? "",
    ssh: entry?.ssh ?? null,
  };
}

/** Which tab to open for an existing entry. */
export function initialTab(entry?: VaultEntry | null): EntryTab {
  if (entry?.type === "card") return "card";
  if (entry?.type === "note") return "notes";
  if (entry?.type === "ssh") return "ssh";
  return "login";
}

/** Prepend https:// when the user typed a bare host. */
export function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t || t.includes("://")) return t;
  return "https://" + t;
}

export function isValidWebUrl(raw: string): boolean {
  if (!raw) return true;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function cleanTotpSecret(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s/g, "");
}

export function totpError(secret: string): string {
  return secret && !validateBase32Secret(secret) ? "entry.errors.totpBase32" : "";
}

/**
 * Entry type: an existing entry keeps its type (previously every save forced
 * "login", silently turning cards and notes into logins). A new entry is a
 * card / note only when that's all it contains.
 */
export function inferType(s: EntryFormState, existing?: EntryType): EntryType {
  if (existing) return existing;
  const hasLogin = !!(s.username.trim() || s.password || s.url.trim() || s.totpSecret);
  if (hasLogin) return "login";
  if (s.ssh) return "ssh";
  if (s.cardNumber.trim()) return "card";
  if (s.notes.trim()) return "note";
  return "login";
}

export interface ValidationErrors {
  title?: string;
  url?: string;
  totp?: string;
}

export function validate(s: EntryFormState): ValidationErrors {
  const e: ValidationErrors = {};
  if (!s.title.trim()) e.title = "entry.errors.title";
  const url = normalizeUrl(s.url);
  if (url && !isValidWebUrl(url)) e.url = "entry.errors.url";
  if (s.totpSecret && !validateBase32Secret(s.totpSecret)) e.totp = "entry.errors.totp";
  return e;
}

export function buildPayload(
  s: EntryFormState,
  opts: { existing?: VaultEntry | null; folderId?: string },
): Omit<VaultEntry, "id" | "createdAt" | "updatedAt"> {
  const keepTotp = opts.existing;
  return {
    type: inferType(s, opts.existing?.type),
    title: s.title.trim(),
    username: s.username.trim(),
    password: s.password,
    url: normalizeUrl(s.url) || undefined,
    notes: s.notes.trim() || undefined,
    totpSecret: s.totpSecret || undefined,
    // Keep an imported entry's non-default TOTP parameters on edit.
    totpAlgorithm: keepTotp?.totpAlgorithm ?? "SHA1",
    totpDigits: keepTotp?.totpDigits ?? 6,
    totpPeriod: keepTotp?.totpPeriod ?? 30,
    category: s.category,
    folderId: opts.existing ? opts.existing.folderId : opts.folderId,
    tags: s.tags,
    favorite: s.favorite,
    customFields: s.customFields,
    cardNumber: s.cardNumber.trim() || undefined,
    cardHolder: s.cardHolder.trim() || undefined,
    cardExpiry: s.cardExpiry.trim() || undefined,
    cardCVV: s.cardCVV.trim() || undefined,
    ssh: s.ssh ?? undefined,
  };
}
