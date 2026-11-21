/**
 * @file src/components/layout/TopBar.tsx
 * Page title · command-palette trigger · view mode · auto-lock countdown · theme toggle.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid, List, Moon, Search, Sun, Waypoints } from "lucide-react";
import { useUIStore, type ViewMode } from "../../store/ui.store";
import { useSessionStore } from "../../store/session.store";
import { useVaultStore } from "../../store/vault.store";

const VIEWS: Array<{ id: ViewMode; icon: typeof List }> = [
  { id: "grid", icon: LayoutGrid },
  { id: "list", icon: List },
  { id: "service", icon: Waypoints },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar() {
  const { t } = useTranslation();
  const { activePage, theme, setTheme, viewMode, setViewMode, setPaletteOpen } = useUIStore();
  const { autoLockMs, lastActivityAt, isUnlocked } = useSessionStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isUnlocked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isUnlocked]);

  // Persist the view choice into vault settings too (ui.store alone reverts on next unlock).
  const chooseView = (v: ViewMode) => {
    setViewMode(v);
    const vault = useVaultStore.getState().vault;
    if (vault)
      useVaultStore.setState({
        vault: { ...vault, settings: { ...vault.settings, viewMode: v } },
        isDirty: true,
      });
  };

  const remainingMs = Math.max(0, autoLockMs - (now - lastActivityAt));
  const time = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;

  return (
    <header className="app-drag titlebar-reserve-controls flex items-center gap-4 px-5 py-3 border-b border-(--border-subtle) bg-(--bg-surface)">
      <h1 className="text-base font-display font-medium shrink-0">
        {t(`topbar.titles.${activePage}`)}
      </h1>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        className="flex-1 max-w-md mx-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border border-(--border-default) bg-(--bg-elevated) text-sm text-(--text-tertiary) hover:border-(--border-strong) transition-colors"
      >
        <Search aria-hidden="true" className="w-4 h-4" />
        <span className="flex-1 text-start">{t("topbar.search")}</span>
        <kbd
          className="text-[10px] border border-(--border-default) rounded px-1.5 py-0.5"
          dir="ltr"
        >
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {isUnlocked && (
          <span
            className="text-xs text-(--text-tertiary) tabular-nums"
            title={t("topbar.autoLockCountdown")}
          >
            {t("topbar.locksIn", { time })}
          </span>
        )}
        {activePage === "vault" && (
          <div
            role="group"
            aria-label={t("topbar.view.label")}
            className="flex items-center bg-(--bg-elevated) rounded-lg p-0.5"
          >
            {VIEWS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => chooseView(id)}
                aria-label={t(`topbar.view.${id}Label`)}
                aria-pressed={viewMode === id}
                title={t(`topbar.view.${id}`)}
                className={`p-1.5 rounded-sm ${viewMode === id ? "bg-(--bg-surface) text-(--text-primary)" : "text-(--text-tertiary) hover:text-(--text-secondary)"}`}
              >
                <Icon aria-hidden="true" className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? t("topbar.toLight") : t("topbar.toDark")}
          className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--bg-elevated) transition-colors"
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" className="w-4 h-4" />
          ) : (
            <Moon aria-hidden="true" className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
}
