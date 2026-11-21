/**
 * @file src/pages/Settings.page.tsx
 * Composition only — each section owns its own state and lives in
 * src/components/settings/. Section ids double as deep-link anchors
 * (e.g. #security), used by the command palette / router.
 */
import { useTranslation } from "react-i18next";
import React, { useEffect } from "react";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { SecuritySection } from "../components/settings/SecuritySection";
import { DuressSection } from "../components/settings/DuressSection";
import { ExtensionSection } from "../components/settings/ExtensionSection";
import { SyncSection } from "../components/settings/SyncSection";
import { UpdatesSection } from "../components/settings/UpdatesSection";
import { DangerZoneSection } from "../components/settings/DangerZoneSection";

export { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";
import type { SettingsSectionId } from "./settings-sections";

export function SettingsPage({ section }: { section?: SettingsSectionId } = {}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [section]);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-medium">{t("settings.title")}</h1>
      <AppearanceSection />
      <SecuritySection />
      <DuressSection />
      <ExtensionSection />
      <SyncSection />
      <UpdatesSection />
      <DangerZoneSection />
    </div>
  );
}

export default SettingsPage;
