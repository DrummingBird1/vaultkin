/** Settings section ids — anchors for #/settings/<id> and command-palette targets.
 *  Kept out of Settings.page.tsx so importing them doesn't pull in the lazy page. */
export const SETTINGS_SECTIONS = [
  "appearance",
  "security",
  "duress",
  "extension",
  "sync",
  "updates",
  "danger",
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];
