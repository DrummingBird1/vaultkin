/**
 * @file src/services/login-capture.service.ts
 * "Save / update this login?" support for the browser extension (ADR 0007).
 *
 *  - loginStatus: is a login the user just submitted new, a changed password
 *    for a saved account, or already saved? Only for the exact host of the
 *    page (no look-alike matches).
 *  - saveLogin: create the login, or update the password of the matching
 *    one (the old version goes to entry history, like any edit).
 *
 * The extension only calls saveLogin after a genuine user click on its banner.
 */
import { useVaultStore } from "../store/vault.store";
import { useUIStore } from "../store/ui.store";
import i18n from "../i18n";
import type { VaultEntry } from "../core/vault/schema";

const MAX = 1024;

function host(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function webOrigin(url: unknown): URL | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function sameHostLogins(entries: VaultEntry[], pageHost: string) {
  return entries.filter((e) => e.type === "login" && host(e.url) === pageHost);
}

export type LoginStatus = "new" | "changed" | "same";

export function loginStatus(
  entries: VaultEntry[],
  url: string,
  username: string,
  password: string,
): LoginStatus {
  const pageHost = host(url);
  if (!pageHost) return "same"; // nothing to offer
  const logins = sameHostLogins(entries, pageHost);
  const account = logins.find((e) => (e.username ?? "") === username);
  if (!account) return logins.some((e) => e.password === password && !username) ? "same" : "new";
  return account.password === password ? "same" : "changed";
}

export function handleLoginStatus(req: Record<string, unknown>) {
  const vault = useVaultStore.getState().vault;
  if (!vault) return { ok: false, error: "locked" };
  const u = webOrigin(req.url);
  const username = typeof req.username === "string" ? req.username.slice(0, MAX) : "";
  const password = typeof req.password === "string" ? req.password : "";
  if (!u || !password || password.length > MAX) return { ok: false, error: "bad-request" };
  return { ok: true, status: loginStatus(vault.entries, u.href, username, password) };
}

export function handleSaveLogin(req: Record<string, unknown>) {
  const s = useVaultStore.getState();
  if (!s.vault) return { ok: false, error: "locked" };
  const u = webOrigin(req.url);
  const username = typeof req.username === "string" ? req.username.slice(0, MAX) : "";
  const password = typeof req.password === "string" ? req.password : "";
  if (!u || !password || password.length > MAX) return { ok: false, error: "bad-request" };
  const pageHost = host(u.href)!;

  const account = sameHostLogins(s.vault.entries, pageHost).find(
    (e) => (e.username ?? "") === username,
  );
  const toast = useUIStore.getState().toastSuccess;
  if (account) {
    if (account.password === password) return { ok: true, result: "unchanged" };
    s.updateEntry(account.id, { password });
    toast(i18n.t("capture.updated"), i18n.t("capture.from", { site: pageHost }));
    return { ok: true, result: "updated", id: account.id };
  }
  const entry = s.addEntry({
    type: "login",
    title: pageHost,
    username,
    password,
    url: u.origin,
    category: "websites",
    tags: [],
    favorite: false,
    customFields: [],
  });
  toast(i18n.t("capture.saved"), i18n.t("capture.from", { site: pageHost }));
  return { ok: true, result: "created", id: entry.id };
}
