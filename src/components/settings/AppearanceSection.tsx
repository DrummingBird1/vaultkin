import React from "react";
import { useTranslation } from "react-i18next";
import { useUIStore, type Theme } from "../../store/ui.store";
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../i18n";
import { SettingsSection, Segmented, persistSettings } from "./shared";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "high-contrast", label: "High Contrast" },
];

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = { en: "English", he: "עברית" };

const ACCENTS = [
  { hex: "#6366F1", name: "Indigo" },
  { hex: "#8B5CF6", name: "Violet" },
  { hex: "#EC4899", name: "Pink" },
  { hex: "#10B981", name: "Emerald" },
  { hex: "#F59E0B", name: "Amber" },
  { hex: "#EF4444", name: "Red" },
];

export function AppearanceSection() {
  const { i18n } = useTranslation();
  const { theme, setTheme, accentColor, setAccent } = useUIStore();

  return (
    <SettingsSection id="appearance" title="Appearance">
      <div className="mb-5">
        <span className="sv-label">Theme</span>
        <Segmented
          label="Theme"
          options={THEME_OPTIONS}
          value={theme}
          onChange={(v) => {
            setTheme(v);
            persistSettings({ theme: v });
          }}
        />
        <p className="sv-hint mt-1">
          High contrast maximizes text/background contrast for low-vision users.
        </p>
      </div>
      <div className="mb-5">
        <span className="sv-label">Language</span>
        <Segmented
          label="Language"
          options={SUPPORTED_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
          value={i18n.language as SupportedLanguage}
          onChange={setLanguage}
        />
        <p className="sv-hint mt-1">
          Only the unlock screen is translated so far — everything past that point is still English
          regardless of this setting.
        </p>
      </div>
      <div>
        <span className="sv-label">Accent color</span>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Accent color">
          {ACCENTS.map((a) => {
            const active = accentColor.hex.toLowerCase() === a.hex.toLowerCase();
            return (
              <button
                key={a.hex}
                type="button"
                onClick={() => {
                  setAccent(a.hex, a.name);
                  persistSettings({ accentColor: a.hex });
                }}
                aria-label={`Accent color ${a.name}`}
                aria-pressed={active}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${active ? "scale-110 border-(--text-primary)" : "border-transparent hover:scale-105"}`}
                style={{ background: a.hex }}
              />
            );
          })}
        </div>
      </div>
    </SettingsSection>
  );
}
