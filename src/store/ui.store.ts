/**
 * @file src/store/ui.store.ts
 * Theme, accent, active page (+ hash route, see lib/route.ts), viewMode, toasts.
 */
import { create } from "zustand";
import { formatHash, type ActivePage } from "../lib/route";
import type { PairingPrompt } from "../services/bridge.service";

export type { ActivePage };

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
}

export type ViewMode = "grid" | "list" | "service";
export type Theme = "dark" | "light" | "high-contrast";

interface UIState {
  theme: Theme;
  accentColor: { hex: string; name: string };
  activePage: ActivePage;
  /** Optional sub-location within the page, e.g. a Settings section id. */
  activeSection: string | null;
  viewMode: ViewMode;
  toasts: Toast[];
  editEntryId: string | null; // cross-page request to open edit modal
  /** Bumped to ask the Vault page to open the Add Entry dialog (palette, Ctrl+N). */
  newEntryRequest: number;
  paletteOpen: boolean;
  /** First-run guide, opened once after a vault is created. */
  onboardingOpen: boolean;
  /** A browser extension asked to pair; shows the code to compare (ADR 0007). */
  pairingPrompt: PairingPrompt | null;

  setTheme: (t: Theme) => void;
  setAccent: (hex: string, name?: string) => void;
  /** Navigate: updates state and pushes a history entry (#/page/section). */
  setActivePage: (p: ActivePage, section?: string) => void;
  /** Apply a route that came FROM the URL (no history push). */
  applyRoute: (p: ActivePage, section?: string) => void;
  setViewMode: (v: ViewMode) => void;
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  toastSuccess: (title: string, message?: string) => void;
  toastError: (title: string, message?: string) => void;
  toastInfo: (title: string, message?: string) => void;
  openEditEntry: (id: string) => void;
  requestNewEntry: () => void;
  setPaletteOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  setPairingPrompt: (p: PairingPrompt | null) => void;
  consumeEditEntry: () => string | null;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set, get) => ({
  theme: "dark",
  accentColor: { hex: "#6366F1", name: "Indigo" },
  activePage: "vault",
  activeSection: null,
  viewMode: "grid",
  toasts: [],
  editEntryId: null,
  newEntryRequest: 0,
  paletteOpen: false,
  onboardingOpen: false,
  pairingPrompt: null,

  setTheme: (t) => set({ theme: t }),
  setAccent: (hex, name) => set({ accentColor: { hex, name: name ?? hex } }),
  setActivePage: (p, section) => {
    set({ activePage: p, activeSection: section ?? null });
    if (typeof window !== "undefined") {
      const hash = formatHash({ page: p, section });
      if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    }
  },
  applyRoute: (p, section) => set({ activePage: p, activeSection: section ?? null }),
  setViewMode: (v) => set({ viewMode: v }),

  addToast: (t) => {
    const id = `t${++toastCounter}-${Date.now()}`;
    const toast: Toast = { id, ...t };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().removeToast(id), 4000);
  },
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  toastSuccess: (title, message) => get().addToast({ type: "success", title, message }),
  toastError: (title, message) => get().addToast({ type: "error", title, message }),
  toastInfo: (title, message) => get().addToast({ type: "info", title, message }),

  openEditEntry: (id) => set({ editEntryId: id }),
  requestNewEntry: () => {
    get().setActivePage("vault");
    set({ newEntryRequest: get().newEntryRequest + 1 });
  },
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  setPairingPrompt: (p) => set({ pairingPrompt: p }),
  consumeEditEntry: () => {
    const id = get().editEntryId;
    if (id) set({ editEntryId: null });
    return id;
  },
}));
