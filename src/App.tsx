/**
 * @file App.tsx
 * Root: theme vars, auto-lock, lock teardown, hash routing (useHashRoute),
 * page switch with lazy loading, toast stack.
 */
import React, { useEffect, useRef, Suspense, lazy } from "react";
import { useUIStore } from "./store/ui.store";
import { useSessionStore } from "./store/session.store";
import { useAutoLock } from "./hooks/useAutoLock";
import { useHashRoute } from "./hooks/useHashRoute";
import type { SettingsSectionId } from "./pages/Settings.page";
import { AppLifecycle } from "./services/app-lifecycle.service";
import { AppShell } from "./components/layout/AppShell";
import { UnlockPage } from "./pages/Unlock.page";
import { VaultPage } from "./pages/Vault.page";

// Route-based code splitting: Vault/Unlock stay eager (the pages basically
// everyone hits every session), the rest lazy-load on first visit. Shaves
// real weight off the initial bundle for a page most sessions never open.
const AuthenticatorPage = lazy(() =>
  import("./pages/Authenticator.page").then((m) => ({ default: m.AuthenticatorPage })),
);
const GeneratorPage = lazy(() =>
  import("./pages/Generator.page").then((m) => ({ default: m.GeneratorPage })),
);
const HealthPage = lazy(() =>
  import("./pages/Health.page").then((m) => ({ default: m.HealthPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings.page").then((m) => ({ default: m.SettingsPage })),
);

function PageLoadingFallback() {
  return (
    <div
      className="flex-1 flex items-center justify-center text-sm text-(--text-tertiary)"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

export function App() {
  const { theme, accentColor, toasts, removeToast } = useUIStore();
  const { isUnlocked } = useSessionStore();
  const activePage = useUIStore((s) => s.activePage);
  const activeSection = useUIStore((s) => s.activeSection);
  useHashRoute(isUnlocked);

  // Apply CSS theme vars
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const hex = accentColor.hex;
    document.documentElement.style.setProperty("--accent", hex);
    const rgb = hex
      .replace("#", "")
      .match(/.{2}/g)!
      .map((h) => parseInt(h, 16))
      .join(",");
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
          <Suspense fallback={<PageLoadingFallback />}>
            {activePage === "authenticator" ? (
              <AuthenticatorPage />
            ) : activePage === "generator" ? (
              <GeneratorPage />
            ) : activePage === "health" ? (
              <HealthPage />
            ) : activePage === "settings" ? (
              <SettingsPage section={(activeSection as SettingsSectionId) ?? undefined} />
            ) : (
              <VaultPage />
            )}
          </Suspense>
        </AppShell>
      )}

      {/* Toast container — role="status"/aria-live so screen readers announce
          new toasts (e.g. "Entry deleted", autosave errors) without the user
          needing to be focused on this corner of the screen. aria-atomic is
          deliberately false: only the newly-added toast should be announced,
          not the entire stack re-read every time one more toast appears. */}
      <div
        className="fixed bottom-4 right-4 z-300 flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
        aria-atomic="false"
        style={{ minWidth: 280 }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-xs"
            style={{
              background: "var(--bg-elevated)",
              borderColor:
                toast.type === "success"
                  ? "var(--success)"
                  : toast.type === "error"
                    ? "var(--danger)"
                    : "var(--border-default)",
              animation: "slideUp 200ms ease both",
            }}
          >
            <span className="text-base mt-0.5">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "⚠" : "ℹ"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-(--text-primary) truncate">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-(--text-tertiary) mt-0.5 truncate">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-(--text-tertiary) hover:text-(--text-primary) transition-colors text-sm shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
