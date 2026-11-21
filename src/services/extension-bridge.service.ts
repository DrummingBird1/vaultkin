/**
 * @file src/services/extension-bridge.service.ts
 * Push a minimal entry snapshot to the companion Chrome extension via
 * chrome.runtime.sendMessage (externally_connectable). No-op outside Chrome.
 */
import type { VaultEntry } from "../core/vault/schema";

interface ExtensionEntry {
  id: string;
  title: string;
  url?: string;
  username?: string;
  password?: string;
  totpSecret?: string;
}

export const ExtensionBridge = {
  async syncEntries(extensionId: string, entries: VaultEntry[]): Promise<boolean> {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return false;
    if (!extensionId) return false;
    const minimal: ExtensionEntry[] = entries.map((e) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      username: e.username,
      password: e.password,
      totpSecret: e.totpSecret,
    }));
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        extensionId,
        { type: "SV_SYNC_ENTRIES", entries: minimal },
        (resp: any) => resolve(!!resp?.ok),
      );
    });
  },
  async lock(extensionId: string): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage(extensionId, { type: "SV_LOCK" }, () => {});
  },
};
