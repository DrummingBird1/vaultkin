/**
 * @file src/core/vault/schema.ts
 * Public types describing a decrypted vault's shape.
 */
import type { StoredPasskey } from "../passkey/authenticator";
import type { VaultAttachment } from "./attachment";

export type CategoryType =
  "websites" | "apps" | "finance" | "gaming" | "servers" | "identity" | "email" | "custom";

export type EntryType = "login" | "note" | "card" | "totp" | "identity" | "ssh";

/** An Ed25519 SSH key (OpenSSH formats; see core/ssh/ssh-key.ts). */
export interface SshKeyData {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

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
  /** Passkeys saved for this login (software WebAuthn authenticator). */
  passkeys?: StoredPasskey[];
  /** SSH key for type "ssh" (served by the SSH agent on desktop). */
  ssh?: SshKeyData;
  /** Encrypted files (keys here; ciphertext in services/attachment-store). */
  attachments?: VaultAttachment[];
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
  /** WebDAV sync credentials. Encrypted with the rest of the vault, so they
   *  are only readable while it is unlocked (never in browser storage). */
  sync?: {
    url: string;
    username: string;
    password: string;
    /** Version of the server file this vault last pushed or merged. */
    seen?: string;
  };
}

export interface VaultMeta {
  createdAt: string;
  lastModifiedAt: string;
  entryCount?: number;
}

/** Marks an entry as deleted so sync merge doesn't resurrect it (schema v2). */
export interface VaultTombstone {
  id: string;
  deletedAt: string;
}

/** A browser extension the user paired with this vault (ADR 0007). */
export interface PairedExtension {
  /** chrome-extension://<id>/ as reported by the browser, not by the extension. */
  origin: string;
  /** The extension's ECDH P-256 public key (raw, base64), pinned at pairing. */
  publicKey: string;
  pairedAt: string;
  lastSeenAt?: string;
}

/** Bridge identity + pairings. Lives inside the encrypted vault. */
export interface VaultBridge {
  appPublicKey: string;
  /** ECDH private key as JWK; only ever in memory while unlocked or encrypted at rest. */
  appPrivateJwk: JsonWebKey;
  paired: PairedExtension[];
}

export interface VaultData {
  /** Optional, added on first use of the browser bridge. */
  bridge?: VaultBridge;
  /** See CURRENT_SCHEMA_VERSION in migrations.ts. */
  schemaVersion: number;
  entries: VaultEntry[];
  folders: VaultFolder[];
  tombstones: VaultTombstone[];
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
