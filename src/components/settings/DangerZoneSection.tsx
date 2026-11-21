import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { IPCService } from "../../services/ipc.service";
import { lockApplication } from "../../store";
import { SettingsSection } from "./shared";

export function DangerZoneSection() {
  const { toastError } = useUIStore();
  const [typed, setTyped] = useState("");

  const del = async () => {
    if (typed !== "DELETE") return toastError("Confirmation required", "Type DELETE to confirm.");
    try {
      await IPCService.vault.delete();
      lockApplication("manual");
      window.location.reload();
    } catch (e: unknown) {
      toastError("Delete failed", e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <SettingsSection
      id="danger"
      title="Danger zone"
      tone="danger"
      description="Permanently delete the local vault. Cloud backups are not touched."
    >
      <input
        className="sv-input w-full mb-3"
        aria-label="Type DELETE to confirm"
        placeholder="Type DELETE to enable the button"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <button
        onClick={del}
        disabled={typed !== "DELETE"}
        className="sv-btn-danger w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Delete local vault
      </button>
    </SettingsSection>
  );
}
