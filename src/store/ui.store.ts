/**
 * @file src/store/ui.store.ts
 * Theme, accent, active page, viewMode, toasts.
 */
import { create } from "zustand";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
}

export type ActivePage = "vault" | "authenticator" | "generator" | "health" | "settings";
export type ViewMode = "grid" | "list";

interface UIState {
  theme: "dark" | "light";
  accentColor: { hex: string; name: string };
  activePage: ActivePage;
  viewMode: ViewMode;
  toasts: Toast[];
  editEntryId: string | null;  // cross-page request to open edit modal

  setTheme:       (t: "dark" | "light") => void;
  setAccent:      (hex: string, name?: string) => void;
  setActivePage:  (p: ActivePage) => void;
  setViewMode:    (v: ViewMode) => void;
  addToast:       (t: Omit<Toast, "id">) => void;
  removeToast:    (id: string) => void;
  toastSuccess:   (title: string, message?: string) => void;
  toastError:     (title: string, message?: string) => void;
  toastInfo:      (title: string, message?: string) => void;
  openEditEntry:  (id: string) => void;
  consumeEditEntry: () => string | null;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set, get) => ({
  theme: "dark",
  accentColor: { hex: "#6366F1", name: "Indigo" },
  activePage: "vault",
  viewMode: "grid",
  toasts: [],
  editEntryId: null,

  setTheme: (t) => set({ theme: t }),
  setAccent: (hex, name) => set({ accentColor: { hex, name: name ?? hex } }),
  setActivePage: (p) => set({ activePage: p }),
  setViewMode: (v) => set({ viewMode: v }),

  addToast: (t) => {
    const id = `t${++toastCounter}-${Date.now()}`;
    const toast: Toast = { id, ...t };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().removeToast(id), 4000);
  },
  removeToast: (id) => set({ toasts: get().toasts.filter(t => t.id !== id) }),
  toastSuccess: (title, message) => get().addToast({ type: "success", title, message }),
  toastError:   (title, message) => get().addToast({ type: "error",   title, message }),
  toastInfo:    (title, message) => get().addToast({ type: "info",    title, message }),

  openEditEntry: (id) => set({ editEntryId: id }),
  consumeEditEntry: () => {
    const id = get().editEntryId;
    if (id) set({ editEntryId: null });
    return id;
  },
}));
