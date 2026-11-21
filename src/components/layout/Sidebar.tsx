/**
 * @file src/components/layout/Sidebar.tsx
 * Primary nav. Icons + labels for the 5 pages, lock button at the bottom.
 */
import React from "react";
import { useUIStore, type ActivePage } from "../../store/ui.store";
import { lockApplication } from "../../store";

const NAV: Array<{ id: ActivePage; label: string; icon: React.ReactNode }> = [
  { id: "vault", label: "Vault", icon: <IconKey /> },
  { id: "authenticator", label: "Authenticator", icon: <IconShield /> },
  { id: "generator", label: "Generator", icon: <IconWand /> },
  { id: "health", label: "Health", icon: <IconHeart /> },
  { id: "settings", label: "Settings", icon: <IconGear /> },
];

export function Sidebar() {
  const { activePage, setActivePage } = useUIStore();

  return (
    <aside className="w-56 shrink-0 bg-(--bg-surface) border-r border-(--border-subtle) flex flex-col">
      <div className="p-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-(--accent-dim) border border-(--accent)/20 flex items-center justify-center text-(--accent)">
          <IconLock />
        </div>
        <span className="font-display font-semibold text-(--text-primary)">SecureVault</span>
      </div>
      <nav className="flex-1 px-3 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-(--accent-dim) text-(--accent)"
                  : "text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary)"
              }`}
            >
              <span className="w-4 h-4 shrink-0">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-(--border-subtle)">
        <button
          onClick={() => lockApplication("manual")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-(--text-secondary) hover:bg-(--danger-dim) hover:text-(--danger) transition-colors"
        >
          <IconLock /> Lock vault
        </button>
      </div>
    </aside>
  );
}

// ── Inline SVG icons ─────────────────────────────────────────────────────────
function IconLock() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconKey() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconWand() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
