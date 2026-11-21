import React, { useEffect, useState } from "react";
import type { UpdateStatus } from "../../types/electron-bridge";
import { SettingsSection } from "./shared";

/** Desktop-only: window.electron exists only in the Electron build. Manual trigger only. */
export function UpdatesSection() {
  const supported = "electron" in window && !!window.electron?.updates;
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!supported) return;
    return window.electron!.updates.onStatus(setStatus);
  }, [supported]);

  if (!supported) return null;

  const fail = (e: unknown) =>
    setStatus({ status: "error", message: e instanceof Error ? e.message : String(e) });
  const check = () => {
    setStatus({ status: "checking" });
    window.electron?.updates.check().catch(fail);
  };

  return (
    <SettingsSection
      id="updates"
      title="App updates"
      description="Checks GitHub Releases for a newer version. Nothing happens automatically — this only runs when you click the button, and nothing downloads or installs without another explicit click."
    >
      <div className="flex items-center gap-3" aria-live="polite">
        <button
          onClick={check}
          disabled={status?.status === "checking" || status?.status === "downloading"}
          className="sv-btn-secondary disabled:opacity-50"
        >
          Check for updates
        </button>
        {status?.status === "checking" && <span className="sv-hint">Checking…</span>}
        {status?.status === "not-available" && (
          <span className="sv-hint">You're on the latest version.</span>
        )}
        {status?.status === "error" && (
          <span className="sv-hint text-(--danger)">{status.message}</span>
        )}
        {status?.status === "available" && (
          <button
            onClick={() => window.electron?.updates.download().catch(fail)}
            className="sv-btn-primary"
          >
            Download v{status.version}
          </button>
        )}
        {status?.status === "downloading" && (
          <span className="sv-hint">Downloading… {status.percent}%</span>
        )}
        {status?.status === "downloaded" && (
          <button
            onClick={() => window.electron?.updates.quitAndInstall()}
            className="sv-btn-primary"
          >
            Restart & install v{status.version}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}
