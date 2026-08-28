/**
 * @file src/core/vault/schema.ts
 * Public types describing a decrypted vault's shape.
 */

export type CategoryType =
  "websites" | "apps" | "finance" | "gaming" | "servers" | "identity" | "email" | "custom";

export type EntryType = "login" | "note" | "card" | "totp" | "identity";

export interface CustomField {
  id: string;
  label: string;
  value: string;
  type: "text" | "password" | "url" | "email" | "phone" | "note";
  protected: boolean;
}

export interface VaultEntry {
  id: string;
  type: EntryType;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  totpSecret?: string;
  totpAlgorithm?: "SHA1" | "SHA256" | "SHA512";
  totpDigits?: 6 | 8;
  totpPeriod?: 30 | 60;
  category: CategoryType;
  folderId?: string;
  tags: string[];
  favorite: boolean;
  customFields: CustomField[];
  cardNumber?: string;
  cardHolder?: string;
  cardExpiry?: string;
  cardCVV?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId?: string;
  color?: string;
}

export interface VaultSettings {
  autoLockMs: number;
  defaultCategory: CategoryType;
  theme: "dark" | "light" | "high-contrast";
  accentColor: string;
  viewMode: "grid" | "list" | "service";
  /** Lock immediately when the tab/window is hidden (document.hidden), not
   *  just after the auto-lock idle timeout. Opt-in, off by default — the
   *  idle timer already covers most of this, and instant lock-on-blur would
   *  surprise users who just alt-tab briefly. */
  lockOnHide?: boolean;
}

export interface VaultMeta {
  createdAt: string;
  lastModifiedAt: string;
  entryCount?: number;
}

export interface VaultData {
  schemaVersion: number;
  entries: VaultEntry[];
  folders: VaultFolder[];
  settings: VaultSettings;
  meta: VaultMeta;
}

export interface SearchQuery {
  text?: string;
  category?: CategoryType;
  tag?: string;
  folderId?: string;
  favoritesOnly?: boolean;
}
