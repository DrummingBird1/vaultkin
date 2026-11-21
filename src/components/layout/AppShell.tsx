/**
 * @file src/components/layout/AppShell.tsx
 * Sidebar (nav + lock) + content area with topbar. Owns the app-wide
 * keyboard shortcuts and the command palette.
 */
import React, { Suspense, lazy, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useUIStore } from "../../store/ui.store";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

// Lazy, but preloaded as soon as the shell mounts: otherwise keys typed right
// after the first Ctrl+K are lost while the chunk downloads.
const Onboarding = lazy(() =>
  import("../onboarding/Onboarding").then((m) => ({ default: m.Onboarding })),
);

const loadPalette = () => import("../command/CommandPalette");
const CommandPalette = lazy(() => loadPalette().then((m) => ({ default: m.CommandPalette })));

export function AppShell({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  useEffect(() => {
    void loadPalette();
  }, []);
  const paletteOpen = useUIStore((s) => s.paletteOpen);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const requestNewEntry = useUIStore((s) => s.requestNewEntry);
  const onboardingOpen = useUIStore((s) => s.onboardingOpen);
  const setOnboardingOpen = useUIStore((s) => s.setOnboardingOpen);

  return (
    <div className="flex h-screen bg-(--bg-base) text-(--text-primary)">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
      {onboardingOpen && (
        <Suspense fallback={null}>
          <Onboarding onDone={() => setOnboardingOpen(false)} />
        </Suspense>
      )}
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPaletteOpen(false)} onNewEntry={requestNewEntry} />
        </Suspense>
      )}
    </div>
  );
}
