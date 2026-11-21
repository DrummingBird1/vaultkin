/**
 * @file src/pages/Authenticator.page.tsx
 * Live TOTP codes for entries with totpSecret set.
 */
import React, { useEffect, useMemo } from "react";
import { useVaultStore } from "../store/vault.store";
import { useTOTPStore } from "../store/totp.store";
import { useQuickCopy } from "../hooks/useQuickCopy";
import { useTranslation } from "react-i18next";

export function AuthenticatorPage() {
  const { t } = useTranslation();
  const entries = useVaultStore((s) => s.entries);
  const { codes, refresh } = useTOTPStore();
  const quickCopy = useQuickCopy();

  // Memoized: a fresh array every render re-ran the effect below, whose
  // refresh() re-rendered the page → "Maximum update depth exceeded".
  const totpEntries = useMemo(() => entries.filter((e) => !!e.totpSecret), [entries]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await refresh(totpEntries);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [totpEntries, refresh]);

  if (totpEntries.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-display font-medium mb-2">{t("authenticator.title")}</h1>
        <p className="text-sm text-(--text-secondary) mb-6">{t("authenticator.description")}</p>
        <div className="sv-card text-center py-10">
          <p className="text-(--text-tertiary)">{t("authenticator.empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-medium mb-6">{t("authenticator.title")}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {totpEntries.map((entry) => {
          const c = codes.get(entry.id);
          return (
            <div key={entry.id} className="sv-card flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{entry.title}</p>
                <p className="text-xs text-(--text-tertiary) truncate">{entry.username}</p>
                <p className="text-2xl font-mono tracking-widest mt-2">{c?.code ?? "------"}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-xs text-(--text-tertiary) tabular-nums">
                  {t("authenticator.secondsLeft", { count: c?.remaining ?? 0 })}
                </span>
                <button
                  onClick={() => c && quickCopy(c.code, t("authenticator.codeLabel"))}
                  className="sv-btn-secondary text-xs px-3 py-1"
                >
                  {t("authenticator.copy")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-(--text-tertiary) text-center mt-6">
        {t("authenticator.refreshHint")}
      </p>
    </div>
  );
}

export default AuthenticatorPage;
