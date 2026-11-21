/**
 * @file src/services/passkey.service.ts
 * Passkey requests arriving over the extension bridge (ADR 0007). Every create
 * and every sign-in needs the user's confirmation in the unlocked app
 * (PasskeyDialog); that confirmation is the user-verification (UV) step.
 *
 * Defense in depth on top of the extension's checks: the app re-validates the
 * RP ID against the page origin, and for sign-in parses clientDataJSON itself
 * (type, origin) before signing it.
 */
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import {
  createPasskey,
  fromB64u,
  rpIdAllowed,
  signAssertion,
  type StoredPasskey,
} from "../core/passkey/authenticator";
import { registrableDomain } from "../core/vault/grouping";
import type { VaultEntry } from "../core/vault/schema";

const isPublicSuffix = (d: string) => registrableDomain(`x.${d}`) === `x.${d}`;
const MAX_FIELD = 512;

export interface PasskeyCandidate {
  entryId: string;
  credentialId: string;
  userName: string;
  title: string;
}

export type PasskeyPrompt =
  | {
      kind: "create";
      rpId: string;
      origin: string;
      userName: string;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: "get";
      rpId: string;
      origin: string;
      candidates: PasskeyCandidate[];
      resolve: (credentialId: string | null) => void;
    };

function ask<T>(prompt: (resolve: (v: T) => void) => PasskeyPrompt): Promise<T> {
  return new Promise<T>((resolve) => {
    useUIStore.getState().setPasskeyPrompt(
      prompt((v) => {
        useUIStore.getState().setPasskeyPrompt(null);
        resolve(v);
      }),
    );
  });
}

function str(v: unknown, max = MAX_FIELD): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

function allPasskeys(entries: VaultEntry[]): Array<{ entry: VaultEntry; pk: StoredPasskey }> {
  return entries.flatMap((entry) => (entry.passkeys ?? []).map((pk) => ({ entry, pk })));
}

export type PasskeyReply = Record<string, unknown> & { ok: boolean; error?: string };

export async function handlePasskeyCreate(req: Record<string, unknown>): Promise<PasskeyReply> {
  const origin = str(req.origin);
  const rpId = str(req.rpId, 253);
  const userHandle = str(req.userHandle, 128);
  const userName = str(req.userName) ?? "";
  if (!origin || !rpId || !userHandle) return { ok: false, error: "bad-request" };
  if (!rpIdAllowed(rpId, origin, isPublicSuffix)) return { ok: false, error: "security" };
  const vault = useVaultStore.getState().vault;
  if (!vault) return { ok: false, error: "locked" };

  const exclude = new Set(
    Array.isArray(req.exclude) ? req.exclude.filter((x): x is string => typeof x === "string") : [],
  );
  if (allPasskeys(vault.entries).some(({ pk }) => pk.rpId === rpId && exclude.has(pk.credentialId)))
    return { ok: false, error: "excluded" };

  const approved = await ask<boolean>((resolve) => ({
    kind: "create",
    rpId,
    origin,
    userName,
    resolve,
  }));
  if (!approved) return { ok: false, error: "cancelled" };

  const r = await createPasskey({
    rpId,
    userHandle,
    userName,
    userDisplayName: str(req.userDisplayName) ?? undefined,
    userVerified: true,
  });

  // Attach to the login for this site + username if there is one, else create a login.
  const s = useVaultStore.getState();
  const current = s.vault;
  if (!current) return { ok: false, error: "locked" };
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const match = current.entries.find(
    (e) =>
      e.type === "login" &&
      (e.username ?? "") === userName &&
      !!e.url &&
      (() => {
        try {
          const h = new URL(e.url.includes("://") ? e.url : `https://${e.url}`).hostname.replace(
            /^www\./,
            "",
          );
          return h === host || h.endsWith(`.${rpId}`) || h === rpId;
        } catch {
          return false;
        }
      })(),
  );
  if (match) {
    // Same user re-registering replaces their old passkey for this RP.
    const kept = (match.passkeys ?? []).filter(
      (p) => !(p.rpId === rpId && p.userHandle === userHandle),
    );
    s.updateEntry(match.id, { passkeys: [...kept, r.passkey] });
  } else {
    s.addEntry({
      type: "login",
      title: rpId,
      username: userName,
      url: origin,
      category: "websites",
      tags: [],
      favorite: false,
      customFields: [],
      passkeys: [r.passkey],
    });
  }
  return {
    ok: true,
    credentialId: r.passkey.credentialId,
    attestationObject: r.attestationObject,
    authenticatorData: r.authenticatorData,
    publicKeySpki: r.publicKeySpki,
  };
}

export async function handlePasskeyGet(req: Record<string, unknown>): Promise<PasskeyReply> {
  const origin = str(req.origin);
  const rpId = str(req.rpId, 253);
  const clientDataB64 = str(req.clientDataJSON, 4096);
  if (!origin || !rpId || !clientDataB64) return { ok: false, error: "bad-request" };
  if (!rpIdAllowed(rpId, origin, isPublicSuffix)) return { ok: false, error: "security" };

  // Never sign client data that names another origin or isn't a get.
  const clientData = fromB64u(clientDataB64);
  let parsed: { type?: unknown; origin?: unknown; challenge?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(clientData));
  } catch {
    return { ok: false, error: "bad-request" };
  }
  if (
    parsed.type !== "webauthn.get" ||
    parsed.origin !== origin ||
    typeof parsed.challenge !== "string"
  )
    return { ok: false, error: "security" };

  const vault = useVaultStore.getState().vault;
  if (!vault) return { ok: false, error: "locked" };
  const allow = Array.isArray(req.allow)
    ? new Set(req.allow.filter((x): x is string => typeof x === "string"))
    : null;
  const matches = allPasskeys(vault.entries).filter(
    ({ pk }) => pk.rpId === rpId && (!allow?.size || allow.has(pk.credentialId)),
  );
  if (matches.length === 0) return { ok: false, error: "none" };

  const chosen = await ask<string | null>((resolve) => ({
    kind: "get",
    rpId,
    origin,
    candidates: matches.map(({ entry, pk }) => ({
      entryId: entry.id,
      credentialId: pk.credentialId,
      userName: pk.userName,
      title: entry.title,
    })),
    resolve,
  }));
  const pick = matches.find(({ pk }) => pk.credentialId === chosen);
  if (!pick) return { ok: false, error: "cancelled" };
  const a = await signAssertion(pick.pk, clientData, true);
  return { ok: true, ...a };
}
