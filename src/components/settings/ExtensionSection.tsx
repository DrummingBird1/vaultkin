import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { ExtensionBridge } from "../../services/extension-bridge.service";
import { EXTENSION_ID_STORAGE_KEY } from "../../constants";
import { SettingsSection } from "./shared";

export function ExtensionSection() {
  const { toastError, toastSuccess } = useUIStore();
  const entries = useVaultStore((s) => s.vault?.entries);
  // chrome.runtime.sendMessage only exists when the app runs as a page in a
  // Chromium browser; the Electron build has no such API.
  const supported = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
  const [extId, setExtId] = useState(
    () =>
      (typeof localStorage !== "undefined" && localStorage.getItem(EXTENSION_ID_STORAGE_KEY)) || "",
  );

  const save = () => {
    localStorage.setItem(EXTENSION_ID_STORAGE_KEY, extId.trim());
    toastSuccess("Extension ID saved", "");
  };

  const send = async () => {
    if (!extId.trim()) return toastError("No extension ID", "Enter your extension ID first.");
    if (!entries?.length) return toastError("Nothing to send", "Vault is empty.");
    const ok = await ExtensionBridge.syncEntries(extId.trim(), entries);
    if (ok) toastSuccess("Sent to extension", `${entries.length} entries · auto-clears in 5 min.`);
    else toastError("Send failed", "Is the extension installed and the ID correct?");
  };

  const lock = async () => {
    if (!extId.trim()) return;
    await ExtensionBridge.lock(extId.trim());
    toastSuccess("Extension locked", "Its cached entries were cleared.");
  };

  return (
    <SettingsSection
      id="extension"
      title="Browser extension"
      description="Push a minimal snapshot (title, URL, username, password, TOTP) to the companion Chrome extension for autofill. The extension holds it in memory only and auto-clears after 5 minutes idle."
    >
      {supported ? (
        <>
          <label className="sv-label" htmlFor="ext-id">
            Extension ID
          </label>
          <div className="flex gap-2 mb-3">
            <input
              id="ext-id"
              className="sv-input flex-1 font-mono text-sm"
              placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
              value={extId}
              onChange={(e) => setExtId(e.target.value)}
            />
            <button onClick={save} className="sv-btn-secondary px-4">
              Save
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={send} className="sv-btn-primary flex-1">
              Send entries to extension
            </button>
            <button onClick={lock} className="sv-btn-secondary px-4">
              Lock extension
            </button>
          </div>
          <p className="sv-hint mt-2">
            Find the ID at <span className="font-mono">chrome://extensions</span> (Developer mode).
          </p>
        </>
      ) : (
        <p className="sv-hint">
          Not available here — the extension bridge needs SecureVault open as a page in Chrome or
          Edge. It doesn't work from the desktop app.
        </p>
      )}
    </SettingsSection>
  );
}
