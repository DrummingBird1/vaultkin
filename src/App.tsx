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
import type { SettingsSectionId } from "./pages/settings-sections";
import { AppLifecycle } from "./services/app-lifecycle.service";
import { AppShell } from "./components/layout/AppShell";
import { UnlockPage } from "./pages/Unlock.page";
import { VaultPage } from "./pages/Vault.page";
import { Toaster } from "./components/ui/Toaster";
import { PairingDialog } from "./components/bridge/PairingDialog";
import { PasskeyDialog } from "./components/bridge/PasskeyDialog";
import { SshApprovalDialog } from "./components/bridge/SshApprovalDialog";
import { SshAgentService } from "./services/ssh-agent.service";
import { BridgeService } from "./services/bridge.service";
import { lockApplication } from "./store";

import { readableAccent, solidAccent } from "./lib/contrast";
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

/**
 * Route → page. Memoized and self-subscribing so App re-renders (e.g. the
 * auto-lock activity tracker on every keypress) don't re-render the page.
 */
const Pages = React.memo(function Pages() {
  const activePage = useUIStore((s) => s.activePage);
  const activeSection = useUIStore((s) => s.activeSection);
  return (
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
  );
});

export function App() {
  const { theme, accentColor } = useUIStore();
  const { isUnlocked } = useSessionStore();
  useHashRoute(isUnlocked);

  // Apply CSS theme vars
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const hex = accentColor.hex;
    document.documentElement.style.setProperty("--accent", hex);
    // Filled buttons put white text on the accent; keep that at 4.5:1 for any chosen color.
    document.documentElement.style.setProperty("--accent-solid", solidAccent(hex));
    // Accent-colored TEXT must reach 4.5:1 on every surface of the current theme.
    const css = getComputedStyle(document.documentElement);
    const surfaces = ["--bg-base", "--bg-surface", "--bg-elevated", "--bg-overlay"].map((v) =>
      css.getPropertyValue(v).trim(),
    );
    document.documentElement.style.setProperty("--accent-text", readableAccent(hex, surfaces));
    // Desktop: native window controls follow the theme.
    window.electron?.window
      ?.setTitleBarTheme({
        color: css.getPropertyValue("--bg-surface").trim(),
        symbolColor: css.getPropertyValue("--text-secondary").trim(),
      })
      .catch(() => {});
    const rgb = hex
      .replace("#", "")
      .match(/.{2}/g)!
      .map((h) => parseInt(h, 16))
      .join(",");
    document.documentElement.style.setProperty("--accent-rgb", rgb);
  }, [theme, accentColor]);

  // Desktop window chrome + Quick Access hotkey (Electron only).
  useEffect(() => {
    const bridge = window.electron;
    if (!bridge?.window) return;
    document.documentElement.dataset.titlebar = bridge.platform === "darwin" ? "inset" : "overlay";
    // Reserve exactly the space of the native caption buttons. They are on the
    // right normally, but on the LEFT when Windows itself runs in a
    // right-to-left language (e.g. Hebrew Windows) — measure both sides.
    const wco = (
      navigator as Navigator & {
        windowControlsOverlay?: EventTarget & { getTitlebarAreaRect(): DOMRect; visible: boolean };
      }
    ).windowControlsOverlay;
    const measure = () => {
      const r = wco?.visible ? wco.getTitlebarAreaRect() : null;
      const root = document.documentElement.style;
      if (!r || r.width <= 0) {
        // No measurement: keep the CSS default (140px on the right).
        root.removeProperty("--titlebar-reserve-left");
        root.removeProperty("--titlebar-reserve-right");
        return;
      }
      const left = Math.max(0, Math.round(r.x));
      const right = Math.max(0, Math.round(window.innerWidth - (r.x + r.width)));
      root.setProperty("--titlebar-reserve-left", `${left}px`);
      root.setProperty("--titlebar-reserve-right", `${right}px`);
    };
    measure();
    wco?.addEventListener("geometrychange", measure);
    window.addEventListener("resize", measure);
    const offQuickAccess = bridge.window.onQuickAccess(() => {
      if (useSessionStore.getState().isUnlocked) useUIStore.getState().setPaletteOpen(true);
      else document.querySelector<HTMLInputElement>('input[type="password"]')?.focus();
    });
    // Sleep / screen lock / user switch locks the vault right away.
    const offSystemLock = bridge.window.onSystemLock?.(() => {
      if (useSessionStore.getState().isUnlocked) lockApplication("inactivity");
    });
    return () => {
      offQuickAccess();
      offSystemLock?.();
      wco?.removeEventListener("geometrychange", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Browser-extension bridge (desktop only). Runs while locked too, so a
  // connecting extension is told "locked" instead of getting no answer.
  useEffect(() => BridgeService.start(), []);
  // SSH agent (desktop, opt-in): answers ssh with keys from the vault.
  useEffect(() => SshAgentService.start(), []);

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
          <Pages />
        </AppShell>
      )}

      {isUnlocked && <PairingDialog />}
      {isUnlocked && <PasskeyDialog />}
      {isUnlocked && <SshApprovalDialog />}
      <Toaster />
    </>
  );
}

export default App;
