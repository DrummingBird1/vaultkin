/**
 * @file src/components/layout/Sidebar.tsx
 * Primary nav: the 5 pages, lock button at the bottom.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyRound,
  Lock,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useUIStore, type ActivePage } from "../../store/ui.store";
import { lockApplication } from "../../store";

const NAV: Array<{ id: ActivePage; icon: LucideIcon }> = [
  { id: "vault", icon: KeyRound },
  { id: "authenticator", icon: Timer },
  { id: "generator", icon: Sparkles },
  { id: "health", icon: ShieldCheck },
  { id: "settings", icon: Settings },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { activePage, setActivePage } = useUIStore();

  return (
    <aside className="w-56 shrink-0 bg-(--bg-surface) border-e border-(--border-subtle) flex flex-col">
      <div className="app-drag titlebar-reserve-traffic-lights p-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-(--accent-dim) border border-(--accent)/20 flex items-center justify-center text-(--accent-text)">
          <Lock aria-hidden="true" className="w-4 h-4" />
        </div>
        <span className="font-display font-semibold text-(--text-primary)">{t("app.name")}</span>
      </div>
      <nav aria-label={t("nav.primary")} className="flex-1 px-3 flex flex-col gap-0.5">
        {NAV.map(({ id, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-(--accent-dim) text-(--accent-text)"
                  : "text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary)"
              }`}
            >
              <Icon aria-hidden="true" className="w-4 h-4 shrink-0" />
              {t(`nav.${id}`)}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-(--border-subtle)">
        <button
          onClick={() => lockApplication("manual")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-(--text-secondary) hover:bg-(--danger-dim) hover:text-(--danger) transition-colors"
        >
          <Lock aria-hidden="true" className="w-4 h-4" /> {t("nav.lock")}
        </button>
      </div>
    </aside>
  );
}
