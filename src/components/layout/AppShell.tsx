/**
 * @file src/components/layout/AppShell.tsx
 * Two-pane shell: sidebar (nav + lock) + content area with topbar.
 */
import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-(--bg-base) text-(--text-primary)">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
