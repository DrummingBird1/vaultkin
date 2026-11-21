/**
 * @file Onboarding.tsx
 * First-run guide, opened once right after a new vault is created:
 *   1. Recovery Kit — the only way back in if the master password is lost.
 *   2. Bring passwords over — opens the importer.
 *   3. Work faster — keyboard shortcuts, language.
 * Each step can be skipped; nothing here is required to use the vault.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Download, Keyboard, LifeBuoy } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { RecoveryKitModal } from "../modals/RecoveryKit.modal";
import { ImportVaultModal } from "../modals/ImportVault.modal";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../i18n";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = { en: "English", he: "עברית" };
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const STEPS = [
  { id: "recovery", icon: LifeBuoy },
  { id: "import", icon: Download },
  { id: "shortcuts", icon: Keyboard },
] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(0);
  const [sub, setSub] = useState<"recovery" | "import" | null>(null);
  const [kitSaved, setKitSaved] = useState(false);
  const step = STEPS[index];
  const Icon = step.icon;
  const last = index === STEPS.length - 1;

  if (sub === "recovery")
    return (
      <RecoveryKitModal
        onClose={() => {
          setSub(null);
          setKitSaved(true);
        }}
      />
    );
  if (sub === "import") return <ImportVaultModal onClose={() => setSub(null)} />;

  return (
    <Modal
      onClose={onDone}
      labelledBy="onboarding-title"
      describedBy="onboarding-body"
      className="max-w-lg"
    >
      <div className="flex items-center gap-2 mb-6" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-8 bg-(--accent)" : "w-3 bg-(--border-strong)"}`}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {t("onboarding.progress", { current: index + 1, total: STEPS.length })}
      </p>

      <div className="w-12 h-12 rounded-2xl bg-(--accent-dim) text-(--accent-text) flex items-center justify-center mb-4">
        <Icon aria-hidden="true" className="w-6 h-6" />
      </div>
      <h2 id="onboarding-title" className="text-xl font-display font-semibold mb-2">
        {t(`onboarding.${step.id}.title`)}
      </h2>
      <div id="onboarding-body" className="text-sm text-(--text-secondary) leading-relaxed mb-6">
        {t(`onboarding.${step.id}.body`)}
      </div>

      {step.id === "recovery" && (
        <Button variant="primary" onClick={() => setSub("recovery")} className="w-full mb-2">
          {kitSaved ? t("onboarding.recovery.again") : t("onboarding.recovery.action")}
        </Button>
      )}
      {step.id === "import" && (
        <Button variant="primary" onClick={() => setSub("import")} className="w-full mb-2">
          {t("onboarding.import.action")}
        </Button>
      )}
      {step.id === "shortcuts" && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm mb-5">
            {(
              [
                [`${mod} K`, "palette"],
                [`${mod} N`, "newEntry"],
                [`${mod} L`, "lock"],
                ["/", "search"],
              ] as const
            ).map(([keys, id]) => (
              <React.Fragment key={id}>
                <dt>
                  <kbd
                    dir="ltr"
                    className="text-xs border border-(--border-default) rounded-md px-1.5 py-0.5 bg-(--bg-elevated)"
                  >
                    {keys}
                  </kbd>
                </dt>
                <dd className="text-(--text-secondary)">{t(`onboarding.shortcuts.${id}`)}</dd>
              </React.Fragment>
            ))}
          </dl>
          <div role="group" aria-label={t("settings.appearance.language")} className="flex gap-2">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                aria-pressed={i18n.language === l}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  i18n.language === l
                    ? "border-(--accent) bg-(--accent-dim) text-(--accent-text)"
                    : "border-(--border-default) hover:bg-(--bg-elevated)"
                }`}
              >
                {LANGUAGE_LABELS[l]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-(--border-subtle)">
        <Button variant="ghost" onClick={onDone}>
          {t("onboarding.skip")}
        </Button>
        <div className="flex gap-2">
          {index > 0 && (
            <Button
              onClick={() => setIndex(index - 1)}
              icon={<ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />}
            >
              {t("onboarding.back")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => (last ? onDone() : setIndex(index + 1))}
            icon={last ? undefined : <ArrowRight className="w-4 h-4 rtl:-scale-x-100" />}
          >
            {last ? t("onboarding.finish") : t("onboarding.next")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
