/**
 * @file src/components/settings/shared.tsx
 * Building blocks shared by the Settings sections.
 */
import React from "react";
import { useVaultStore } from "../../store/vault.store";
import type { Theme } from "../../store/ui.store";

export type SettingsPatch = Partial<{
  theme: Theme;
  accentColor: string;
  autoLockMs: number;
  lockOnHide: boolean;
}>;

/** Write device settings into the vault so they persist; autosave picks it up via isDirty. */
export function persistSettings(patch: SettingsPatch): void {
  const { vault } = useVaultStore.getState();
  if (!vault) return;
  const settings = { ...vault.settings };
  if (patch.theme) settings.theme = patch.theme;
  if (patch.accentColor) settings.accentColor = patch.accentColor;
  if (patch.autoLockMs !== undefined) settings.autoLockMs = patch.autoLockMs;
  if (patch.lockOnHide !== undefined) settings.lockOnHide = patch.lockOnHide;
  useVaultStore.setState({ vault: { ...vault, settings }, isDirty: true });
}

export function SettingsSection({
  id,
  title,
  description,
  tone,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const headingId = `settings-${id}`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`sv-card scroll-mt-6 ${tone === "danger" ? "border-(--danger)/30" : ""}`}
    >
      <h2
        id={headingId}
        className={`font-medium ${description ? "mb-1" : "mb-4"} ${tone === "danger" ? "text-(--danger)" : ""}`}
      >
        {title}
      </h2>
      {description && <p className="text-sm text-(--text-tertiary) mb-4">{description}</p>}
      {children}
    </section>
  );
}

/** Segmented single-choice control (theme, language). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
            value === o.value
              ? "border-(--accent) bg-(--accent-dim) text-(--accent)"
              : "border-(--border-default) hover:bg-(--bg-elevated)"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
