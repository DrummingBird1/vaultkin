/**
 * @file App.tsx — Step 7 final wired version.
 * Integrates AppLifecycle (onLock teardown) and ChangePassword modal in Settings.
 */
import React, { useEffect, useRef } from "react";
import { useUIStore }      from "./store/ui.store";
import { useSessionStore } from "./store/session.store";
import { useAutoLock }     from "./hooks/useAutoLock";
import { AppLifecycle }    from "./services/app-lifecycle.service";
import { AppShell }        from "./components/layout/AppShell";
import { UnlockPage }      from "./pages/Unlock.page";
import { VaultPage }       from "./pages/Vault.page";
import { AuthenticatorPage } from "./pages/Authenticator.page";
import { GeneratorPage }   from "./pages/Generator.page";
import { HealthPage }      from "./pages/Health.page";
import { SettingsPage }    from "./pages/Settings.page";

const PAGES: Record<string, React.ReactNode> = {
  vault:         <VaultPage />,
  authenticator: <AuthenticatorPage />,
  generator:     <GeneratorPage />,
  health:        <HealthPage />,
  settings:      <SettingsPage />,
};

export function App() {
  const { theme, accentColor, toasts, removeToast } = useUIStore();
  const { isUnlocked } = useSessionStore();
  const activePage = useUIStore(s => s.activePage);

  // Apply CSS theme vars
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const hex = accentColor.hex;
    document.documentElement.style.setProperty("--accent", hex);
    const rgb = hex.replace("#","").match(/.{2}/g)!.map(h => parseInt(h,16)).join(",");
    document.documentElement.style.setProperty("--accent-rgb", rgb);
  }, [theme, accentColor]);

  // Auto-lock on inactivity
  useAutoLock();

  // Teardown services on lock — but only if the user actually unlocked at least
  // once in this session. Otherwise we'd run the lock teardown on initial mount
  // (when isUnlocked is false but never was true), which can clobber state that
  // the unlock flow is in the middle of setting up.
  const wasUnlocked = useRef(false);
  useEffect(() => {
    if (isUnlocked) {
      wasUnlocked.current = true;
      return;
    }
    if (wasUnlocked.current) {
      AppLifecycle.onLock().catch(console.error);
    }
  }, [isUnlocked]);

  return (
    <>
      {!isUnlocked ? (
        <UnlockPage />
      ) : (
        <AppShell>
          {PAGES[activePage] ?? <VaultPage />}
        </AppShell>
      )}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none"
        style={{ minWidth: 280 }}>
        {toasts.map(toast => (
          <div key={toast.id}
            className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-sm"
            style={{
              background:   "var(--bg-elevated)",
              borderColor:  toast.type === "success" ? "var(--success)" :
                            toast.type === "error"   ? "var(--danger)"  : "var(--border-default)",
              animation:    "slideUp 200ms ease both",
            }}>
            <span className="text-base mt-0.5">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "⚠" : "ℹ"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-sm flex-shrink-0">
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
