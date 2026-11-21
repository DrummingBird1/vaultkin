import React, { useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { DuressService } from "../../services/duress.service";
import { SettingsSection } from "./shared";

export function DuressSection() {
  const { toastSuccess } = useUIStore();
  const [enrolled, setEnrolled] = useState(() => DuressService.isEnrolled());
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const enroll = async () => {
    setErr("");
    if (pw !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    try {
      await DuressService.enroll(pw, "");
      setEnrolled(true);
      setPw("");
      setConfirm("");
      toastSuccess(
        "Duress password set",
        "Entering it will wipe the local vault and show a decoy.",
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to set duress password.");
    }
  };

  const disable = () => {
    DuressService.disenroll();
    setEnrolled(false);
    toastSuccess("Duress password removed", "");
  };

  return (
    <SettingsSection
      id="duress"
      title="Duress password"
      description="A second password that, when entered at unlock, silently wipes the local vault and opens an empty decoy. For coercion scenarios."
    >
      {enrolled ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-(--success)">✓ A duress password is set.</span>
          <button onClick={disable} className="sv-btn-secondary text-sm px-4">
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            className="sv-input w-full"
            type="password"
            aria-label="Duress password"
            placeholder="Duress password (min 6 chars)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className="sv-input w-full"
            type="password"
            aria-label="Confirm duress password"
            placeholder="Confirm duress password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {err && (
            <p className="sv-error" role="alert">
              {err}
            </p>
          )}
          <button
            onClick={enroll}
            disabled={!pw || !confirm}
            className="sv-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Set duress password
          </button>
          <p className="sv-hint">
            ⚠ Must differ from your master password. Stored as a SHA-256 hash only. Cloud backups
            are not wiped — remove those separately for full protection.
          </p>
        </div>
      )}
    </SettingsSection>
  );
}
