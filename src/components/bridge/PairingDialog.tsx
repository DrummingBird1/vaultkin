/**
 * @file PairingDialog.tsx
 * Shown when a browser extension asks to pair (ADR 0007). The user compares
 * the 6-digit code with the one in the extension popup; only a match should
 * be approved. Approving pins the extension's public key in the vault.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { PlugZap } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useUIStore } from "../../store/ui.store";
import { BridgeService } from "../../services/bridge.service";
import { describeExtensionOrigin } from "../../lib/browser-origin";

export function PairingDialog() {
  const { t } = useTranslation();
  const prompt = useUIStore((s) => s.pairingPrompt);
  if (!prompt) return null;
  const extId = describeExtensionOrigin(prompt.origin);
  const code = `${prompt.code.slice(0, 3)} ${prompt.code.slice(3)}`;

  return (
    <Modal
      onClose={() => void BridgeService.resolvePairing(false)}
      role="alertdialog"
      labelledBy="pair-title"
      describedBy="pair-body"
      className="max-w-md"
    >
      <div className="w-12 h-12 rounded-2xl bg-(--accent-dim) text-(--accent-text) flex items-center justify-center mb-4">
        <PlugZap aria-hidden="true" className="w-6 h-6" />
      </div>
      <h2 id="pair-title" className="text-lg font-semibold mb-2">
        {t("bridge.pair.title")}
      </h2>
      <p id="pair-body" className="text-sm text-(--text-secondary) mb-5">
        {t("bridge.pair.body")}
      </p>
      <p
        className="text-center font-mono text-4xl tracking-[0.2em] py-4 rounded-xl bg-(--bg-elevated) border border-(--border-default) mb-3"
        dir="ltr"
        aria-label={t("bridge.pair.codeLabel", { code: prompt.code.split("").join(" ") })}
      >
        {code}
      </p>
      <p className="text-xs text-(--text-tertiary) mb-6 break-all" dir="ltr">
        {t("bridge.pair.extension")}: {extId}
      </p>
      <div className="flex gap-3 justify-end">
        <Button onClick={() => void BridgeService.resolvePairing(false)}>
          {t("bridge.pair.reject")}
        </Button>
        <Button variant="primary" onClick={() => void BridgeService.resolvePairing(true)}>
          {t("bridge.pair.accept")}
        </Button>
      </div>
    </Modal>
  );
}
