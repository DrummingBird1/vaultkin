/**
 * @file src/services/folder-sync.service.ts
 * Renderer side of folder sync (desktop). The main process owns the folder
 * and refuses to overwrite a copy another device changed; this tracks the
 * last result for the UI.
 */
import { create } from "zustand";

export type FolderState = "off" | "ok" | "conflict" | "error";

export const useFolderSyncStore = create<{ state: FolderState; dir: string | null }>(() => ({
  state: "off",
  dir: null,
}));

const api = () => (typeof window !== "undefined" ? window.electron?.folderSync : undefined);

export const FolderSyncService = {
  available: () => !!api(),

  async refresh(): Promise<void> {
    const s = await api()?.status();
    useFolderSyncStore.setState((p) => ({
      dir: s?.dir ?? null,
      state: s ? (p.state === "off" ? "ok" : p.state) : "off",
    }));
  },

  async choose(): Promise<void> {
    const s = await api()?.choose();
    useFolderSyncStore.setState({ dir: s?.dir ?? null, state: s ? "ok" : "off" });
  },

  async stop(): Promise<void> {
    await api()?.clear();
    useFolderSyncStore.setState({ dir: null, state: "off" });
  },

  /** After every save. `force` only after the user resolved a conflict. */
  async push(payload: string, force = false): Promise<FolderState> {
    const a = api();
    if (!a) return "off";
    const r = await a.write(payload, force).catch(() => "error" as const);
    const state: FolderState = r === "written" ? "ok" : r;
    useFolderSyncStore.setState({ state });
    return state;
  },

  /** The folder copy, or null if there is none. */
  pull: (): Promise<string | null> => api()?.read() ?? Promise.resolve(null),
};
