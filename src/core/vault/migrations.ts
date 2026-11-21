/**
 * @file src/core/vault/migrations.ts
 * Forward-only migrations for the DECRYPTED vault document (`schemaVersion`).
 *
 * The encrypted envelope (`VaultPayload.version`, engine.ts) is versioned
 * separately: it changes only when the crypto format changes. This file
 * handles the shape of the JSON inside it.
 *
 * Rules:
 *  - Each step takes version N and returns version N+1. Steps never skip.
 *  - Steps must be pure and idempotent on already-migrated fields, so a
 *    half-written document can't be corrupted by running a step twice.
 *  - A document newer than CURRENT_SCHEMA_VERSION is refused (VaultCorruptError)
 *    instead of being opened and silently downgraded on the next save.
 *
 * Called by serializer.openVault() only; nothing outside core/ uses it.
 */
import type { VaultData } from "./schema";
import { VaultCorruptError } from "../errors";

export const CURRENT_SCHEMA_VERSION = 2;

type AnyDoc = Record<string, unknown> & { schemaVersion?: unknown };
type Step = (doc: AnyDoc) => AnyDoc;

/**
 * v1 → v2
 *  - `tombstones: []` — deleted-entry markers so a sync merge can tell
 *    "deleted here" apart from "never existed here".
 *  - Every entry gets `createdAt`/`updatedAt` (falls back to vault creation
 *    time), so last-writer-wins merge never compares against `undefined`.
 */
const v1ToV2: Step = (doc) => {
  const meta = (doc.meta ?? {}) as { createdAt?: string };
  const fallback = typeof meta.createdAt === "string" ? meta.createdAt : new Date(0).toISOString();
  const entries = Array.isArray(doc.entries) ? doc.entries : [];
  return {
    ...doc,
    schemaVersion: 2,
    tombstones: Array.isArray(doc.tombstones) ? doc.tombstones : [],
    entries: entries.map((e: Record<string, unknown>) => {
      const createdAt = typeof e.createdAt === "string" ? e.createdAt : fallback;
      const updatedAt = typeof e.updatedAt === "string" ? e.updatedAt : createdAt;
      return { ...e, createdAt, updatedAt };
    }),
  };
};

/** STEPS[n] migrates from version n+1 to n+2. */
const STEPS: Step[] = [v1ToV2];

export function migrateVault(raw: unknown): { vault: VaultData; migrated: boolean } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VaultCorruptError("Decrypted vault is not an object");
  }
  let doc = raw as AnyDoc;
  // Documents written before schemaVersion existed are treated as v1.
  let version = doc.schemaVersion === undefined ? 1 : doc.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new VaultCorruptError(`Invalid vault schemaVersion: ${String(version)}`);
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new VaultCorruptError(
      `Vault was written by a newer SecureVault (schema ${version}); update the app to open it.`,
    );
  }
  if (!Array.isArray(doc.entries) || !Array.isArray(doc.folders)) {
    throw new VaultCorruptError("Decrypted vault is missing entries or folders");
  }
  const start = version;
  while (version < CURRENT_SCHEMA_VERSION) {
    doc = STEPS[version - 1](doc);
    version++;
  }
  return { vault: doc as unknown as VaultData, migrated: version !== start };
}
