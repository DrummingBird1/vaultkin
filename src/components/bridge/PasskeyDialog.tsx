/**
 * @file PasskeyDialog.tsx
 * Confirms a passkey request from a website (via the browser extension):
 * saving a new passkey, or signing in with one (choose the account).
 * This click is the user verification for the WebAuthn ceremony.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Fingerprint } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useUIStore } from "../../store/ui.store";

export function PasskeyDialog() {
  const { t } = useTranslation();
  const prompt = useUIStore((s) => s.passkeyPrompt);
  const [choice, setChoice] = useState<string | null>(null);
  if (!prompt) return null;

  const cancel = () => (prompt.kind === "create" ? prompt.resolve(false) : prompt.resolve(null));
  const site = prompt.rpId;
  // The component stays mounted between prompts: ignore a choice from an
  // earlier prompt that isn't one of this prompt's accounts.
  const selected =
    prompt.kind === "get"
      ? prompt.candidates.some((c) => c.credentialId === choice)
        ? choice
        : (prompt.candidates[0]?.credentialId ?? null)
      : null;

  return (
    <Modal
      onClose={cancel}
      labelledBy="passkey-title"
      describedBy="passkey-body"
      className="max-w-md"
    >
      <div className="w-12 h-12 rounded-2xl bg-(--accent-dim) text-(--accent-text) flex items-center justify-center mb-4">
        <Fingerprint aria-hidden="true" className="w-6 h-6" />
      </div>
      <h2 id="passkey-title" className="text-lg font-semibold mb-2">
        {prompt.kind === "create" ? t("passkey.create.title") : t("passkey.get.title")}
      </h2>
      <p id="passkey-body" className="text-sm text-(--text-secondary) mb-4">
        {prompt.kind === "create"
          ? t("passkey.create.body", { site, user: prompt.userName || "—" })
          : t("passkey.get.body", { site })}
      </p>
      <p className="text-xs text-(--text-tertiary) mb-4 break-all" dir="ltr">
        {prompt.origin}
      </p>

      {prompt.kind === "get" && (
        <fieldset className="mb-5">
          <legend className="sv-label">{t("passkey.get.account")}</legend>
          <div className="flex flex-col gap-2">
            {prompt.candidates.map((c) => (
              <label
                key={c.credentialId}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
                  selected === c.credentialId
                    ? "border-(--accent) bg-(--accent-dim)"
                    : "border-(--border-default)"
                }`}
              >
                <input
                  type="radio"
                  name="passkey-account"
                  checked={selected === c.credentialId}
                  onChange={() => setChoice(c.credentialId)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {c.userName || c.title}
                  </span>
                  <span className="block text-xs text-(--text-tertiary) truncate">{c.title}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-3 justify-end">
        <Button onClick={cancel}>{t("passkey.cancel")}</Button>
        <Button
          variant="primary"
          onClick={() =>
            prompt.kind === "create" ? prompt.resolve(true) : prompt.resolve(selected)
          }
          disabled={prompt.kind === "get" && !selected}
        >
          {prompt.kind === "create" ? t("passkey.create.confirm") : t("passkey.get.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
