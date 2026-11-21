/**
 * @file src/pages/Authenticator.page.tsx
 * Live TOTP codes for entries with totpSecret set.
 */
import React, { useEffect } from "react";
import { useVaultStore } from "../store/vault.store";
import { useTOTPStore } from "../store/totp.store";
import { useQuickCopy } from "../hooks/useQuickCopy";

export function AuthenticatorPage() {
  const entries = useVaultStore((s) => s.entries);
  const { codes, refresh } = useTOTPStore();
  const quickCopy = useQuickCopy();

  const totpEntries = entries.filter((e) => !!e.totpSecret);

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
        <h1 className="text-2xl font-display font-medium mb-2">Authenticator</h1>
        <p className="text-sm text-(--text-secondary) mb-6">
          Live TOTP codes appear here for any vault entry with a 2FA secret set.
        </p>
        <div className="sv-card text-center py-10">
          <p className="text-(--text-tertiary)">
            No 2FA entries yet. Add a TOTP secret to any login in the Vault page to see codes here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-medium mb-6">Authenticator</h1>
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
                  {c?.remaining ?? 0}s
                </span>
                <button
                  onClick={() => c && quickCopy(c.code, "TOTP code")}
                  className="sv-btn-secondary text-xs px-3 py-1"
                >
                  Copy
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-(--text-tertiary) text-center mt-6">
        Codes refresh automatically every second.
      </p>
    </div>
  );
}

export default AuthenticatorPage;
