/**
 * @file src/services/ssh-agent.service.ts
 * Renderer half of the SSH agent (desktop). Answers the main process:
 *  - list: public keys of the vault's SSH entries (nothing while locked);
 *  - sign: asks the user to approve, then signs with the entry's key.
 * An approval can be remembered per key for 10 minutes; that memory is
 * cleared on lock.
 */
import { create } from "zustand";
import { useVaultStore } from "../store/vault.store";
import { useSessionStore } from "../store/session.store";
import { publicBlobFromLine, signSsh, SshReader } from "../core/ssh/ssh-key";
import { bytesToBase64, base64ToBytes } from "../core/crypto/encoding";
import type { VaultEntry } from "../core/vault/schema";

const ENABLED_KEY = "sv_ssh_agent"; // localStorage, not secret
const REMEMBER_MS = 10 * 60 * 1000;

export interface PendingSign {
  entry: VaultEntry;
  /** The remote account, parsed from the userauth request when present. */
  user: string | null;
  resolve: (approved: boolean, remember: boolean) => void;
}

/** The approval dialog reads this. */
export const useSshApprovalStore = create<{ pending: PendingSign | null }>(() => ({
  pending: null,
}));

const remembered = new Map<string, number>(); // entry id → until

const api = () => (typeof window !== "undefined" ? window.electron?.sshAgent : undefined);

function sshEntries(): VaultEntry[] {
  if (!useSessionStore.getState().isUnlocked) return [];
  return (useVaultStore.getState().vault?.entries ?? []).filter((e) => e.ssh);
}

function blobOf(e: VaultEntry): string {
  return bytesToBase64(publicBlobFromLine(e.ssh!.publicKey));
}

/** "publickey" userauth request → user name (RFC 4252 §7), if it parses. */
export function userFromSignData(data: Uint8Array): string | null {
  try {
    const r = new SshReader(data);
    r.string(); // session id
    if (r.bytes(1)[0] !== 50) return null; // SSH_MSG_USERAUTH_REQUEST
    return r.text();
  } catch {
    return null;
  }
}

function approve(entry: VaultEntry, user: string | null): Promise<boolean> {
  const until = remembered.get(entry.id);
  if (until && until > Date.now()) return Promise.resolve(true);
  return new Promise((resolve) => {
    useSshApprovalStore.setState({
      pending: {
        entry,
        user,
        resolve: (ok, remember) => {
          useSshApprovalStore.setState({ pending: null });
          if (ok && remember) remembered.set(entry.id, Date.now() + REMEMBER_MS);
          resolve(ok);
        },
      },
    });
  });
}

async function handle(req: { kind: "list" } | { kind: "sign"; keyBlob: string; data: string }) {
  if (req.kind === "list") {
    return sshEntries().map((e) => ({ blob: blobOf(e), comment: e.title }));
  }
  const entry = sshEntries().find((e) => blobOf(e) === req.keyBlob);
  if (!entry?.ssh) return null;
  const data = base64ToBytes(req.data);
  if (!(await approve(entry, userFromSignData(data)))) return null;
  // The user may have locked while the dialog was open.
  if (!useSessionStore.getState().isUnlocked) return null;
  return bytesToBase64(await signSsh(entry.ssh.privateKey, data));
}

export const SshAgentService = {
  isEnabled(): boolean {
    try {
      return localStorage.getItem(ENABLED_KEY) === "1";
    } catch {
      return false;
    }
  },

  /** Start/stop the agent; returns the socket path when running. */
  async setEnabled(on: boolean): Promise<string | null> {
    const a = api();
    if (!a) return null;
    try {
      if (on) localStorage.setItem(ENABLED_KEY, "1");
      else localStorage.removeItem(ENABLED_KEY);
    } catch {
      /* storage blocked: applies to this run only */
    }
    return a.setEnabled(on);
  },

  /** Wire the request listener (once, at app start). Returns a disposer. */
  start(): () => void {
    const a = api();
    if (!a) return () => {};
    const off = a.onRequest(({ id, req }) => {
      handle(req)
        .catch(() => null)
        .then((v) => a.reply(id, v));
    });
    if (this.isEnabled()) void a.setEnabled(true);
    return off;
  },

  /** Lock teardown: forget approvals and refuse anything still pending. */
  onLock(): void {
    remembered.clear();
    useSshApprovalStore.getState().pending?.resolve(false, false);
  },
};
