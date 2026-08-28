/**
 * @file src/components/layout/TopBar.tsx
 * Page title + view mode toggle + auto-lock countdown + theme toggle.
 */
import React, { useEffect, useState } from "react";
import { useUIStore } from "../../store/ui.store";
import { useSessionStore } from "../../store/session.store";
import { useVaultStore } from "../../store/vault.store";

const TITLES: Record<string, string> = {
  vault: "Vault",
  authenticator: "Authenticator",
  generator: "Password Generator",
  health: "Password Health",
  settings: "Settings",
};

export function TopBar() {
  const { activePage, theme, setTheme, viewMode, setViewMode } = useUIStore();
  const { autoLockMs, lastActivityAt, isUnlocked } = useSessionStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isUnlocked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isUnlocked]);

  // setViewMode(v) alone only updated the in-memory ui.store — it never
  // persisted to vault.settings.viewMode, so the choice silently reverted
  // to "grid" on next unlock. This wrapper writes both.
  const handleSetViewMode = (v: "grid" | "list" | "service") => {
    setViewMode(v);
    const vault = useVaultStore.getState().vault;
    if (vault)
      useVaultStore.setState({
        vault: { ...vault, settings: { ...vault.settings, viewMode: v } },
        isDirty: true,
      });
  };

  const remainingMs = Math.max(0, autoLockMs - (now - lastActivityAt));
  const min = Math.floor(remainingMs / 60_000);
  const sec = Math.floor((remainingMs % 60_000) / 1000);

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <h1 className="text-base font-display font-medium">{TITLES[activePage] ?? activePage}</h1>
      <div className="flex items-center gap-2">
        {isUnlocked && (
          <span
            className="text-xs text-[var(--text-tertiary)] tabular-nums"
            title="Auto-lock countdown"
          >
            Locks in {min}:{sec.toString().padStart(2, "0")}
          </span>
        )}
        {activePage === "vault" && (
          <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5">
            <button
              onClick={() => handleSetViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`px-2 py-1 text-xs rounded ${viewMode === "grid" ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
            >
              Grid
            </button>
            <button
              onClick={() => handleSetViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`px-2 py-1 text-xs rounded ${viewMode === "list" ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
            >
              List
            </button>
            <button
              onClick={() => handleSetViewMode("service")}
              aria-label="Service view"
              aria-pressed={viewMode === "service"}
              className={`px-2 py-1 text-xs rounded ${viewMode === "service" ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
            >
              Service
            </button>
          </div>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}

function IconSun() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
