/**
 * @file CommandPalette.tsx
 * ⌘/Ctrl+K palette (cmdk): fuzzy-search entries, pages, settings sections and
 * app actions. Picking an entry opens a second page with entry actions
 * (copy password / username / one-time code, open, edit).
 *
 * Security notes:
 *  - Search matches on title, username and URL only — never on password,
 *    notes, card or TOTP fields, so typing in the palette can't confirm a
 *    secret by filtering.
 *  - Copies go through ClipboardService (auto-clears after 30 s).
 */
import React, { useMemo, useState } from "react";
import { Command } from "cmdk";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Copy,
  KeyRound,
  Lock,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  Vault,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { useUIStore, type ActivePage } from "../../store/ui.store";
import { useVaultStore } from "../../store/vault.store";
import { lockApplication } from "../../store";
import { ClipboardService } from "../../services/clipboard.service";
import { generateTOTP } from "../../core/totp/totp";
import type { VaultEntry } from "../../core/vault/schema";
import { SETTINGS_SECTIONS } from "../../pages/settings-sections";

const PAGE_ICONS: Record<ActivePage, LucideIcon> = {
  vault: Vault,
  authenticator: Timer,
  generator: Sparkles,
  health: ShieldCheck,
  settings: SettingsIcon,
};

function Item({
  icon: Icon,
  value,
  keywords,
  onSelect,
  children,
  hint,
}: {
  icon: LucideIcon;
  value: string;
  keywords?: string[];
  onSelect: () => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer text-(--text-secondary) data-[selected=true]:bg-(--accent-dim) data-[selected=true]:text-(--text-primary)"
    >
      <Icon aria-hidden="true" className="w-4 h-4 shrink-0 text-(--text-tertiary)" />
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {hint && <span className="text-xs text-(--text-tertiary) shrink-0">{hint}</span>}
    </Command.Item>
  );
}

const group =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-(--text-tertiary)";

export function CommandPalette({
  onClose,
  onNewEntry,
}: {
  onClose: () => void;
  onNewEntry: () => void;
}) {
  const { t } = useTranslation();
  const entries = useVaultStore((s) => s.vault?.entries ?? []);
  const selectEntry = useVaultStore((s) => s.selectEntry);
  const { setActivePage, openEditEntry, theme, setTheme, toastSuccess, toastError } = useUIStore();
  const [search, setSearch] = useState("");
  const [entry, setEntry] = useState<VaultEntry | null>(null);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  const copy = async (value: string | undefined, what: string) => {
    if (!value) return;
    const ok = await ClipboardService.copy(value, what);
    onClose();
    if (ok) toastSuccess(t("palette.copied", { what }), t("palette.clearsIn30"));
    else toastError(t("palette.copyFailed"));
  };

  const copyCode = async (e: VaultEntry) => {
    if (!e.totpSecret) return;
    try {
      const { code } = await generateTOTP(e.totpSecret, {
        algorithm: e.totpAlgorithm,
        digits: e.totpDigits,
        period: e.totpPeriod,
      });
      await copy(code, t("palette.what.code"));
    } catch {
      toastError(t("palette.copyFailed"));
    }
  };

  const pages = useMemo(
    () => (Object.keys(PAGE_ICONS) as ActivePage[]).map((p) => ({ id: p, label: t(`nav.${p}`) })),
    [t],
  );

  return (
    <Modal
      onClose={entry ? () => setEntry(null) : onClose}
      label={t("palette.label")}
      className="max-w-xl p-0! overflow-hidden"
    >
      <Command
        label={t("palette.label")}
        loop
        onKeyDown={(e) => {
          if (entry && e.key === "Backspace" && !search) {
            e.preventDefault();
            setEntry(null);
          }
        }}
      >
        <div className="flex items-center gap-2 px-4 border-b border-(--border-subtle)">
          {entry ? (
            <button
              type="button"
              onClick={() => setEntry(null)}
              aria-label={t("palette.back")}
              className="text-(--text-tertiary) hover:text-(--text-primary)"
            >
              <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
            </button>
          ) : (
            <Search aria-hidden="true" className="w-4 h-4 text-(--text-tertiary)" />
          )}
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={
              entry ? t("palette.actionsFor", { title: entry.title }) : t("palette.placeholder")
            }
            className="flex-1 bg-transparent py-3.5 text-sm outline-hidden text-(--text-primary) placeholder-(--text-tertiary)"
          />
          <kbd className="text-[10px] text-(--text-tertiary) border border-(--border-default) rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-(--text-tertiary)">
            {t("palette.empty")}
          </Command.Empty>

          {entry ? (
            <Command.Group heading={entry.title} className={group}>
              {entry.password && (
                <Item
                  icon={KeyRound}
                  value="copy-password"
                  onSelect={() => copy(entry.password, t("palette.what.password"))}
                >
                  {t("palette.copyPassword")}
                </Item>
              )}
              {entry.username && (
                <Item
                  icon={Copy}
                  value="copy-username"
                  onSelect={() => copy(entry.username, t("palette.what.username"))}
                >
                  {t("palette.copyUsername")}
                </Item>
              )}
              {entry.totpSecret && (
                <Item icon={Timer} value="copy-code" onSelect={() => copyCode(entry)}>
                  {t("palette.copyCode")}
                </Item>
              )}
              <Item
                icon={Vault}
                value="open"
                onSelect={() =>
                  run(() => {
                    setActivePage("vault");
                    selectEntry(entry.id);
                  })
                }
              >
                {t("palette.openEntry")}
              </Item>
              <Item
                icon={Pencil}
                value="edit"
                onSelect={() =>
                  run(() => {
                    setActivePage("vault");
                    openEditEntry(entry.id);
                  })
                }
              >
                {t("palette.editEntry")}
              </Item>
            </Command.Group>
          ) : (
            <>
              {entries.length > 0 && (
                <Command.Group heading={t("palette.groups.entries")} className={group}>
                  {entries.map((e) => (
                    <Item
                      key={e.id}
                      icon={KeyRound}
                      value={`entry-${e.id}`}
                      keywords={[e.title, e.username ?? "", e.url ?? ""].filter(Boolean)}
                      hint={e.username}
                      onSelect={() => {
                        setEntry(e);
                        setSearch("");
                      }}
                    >
                      {e.title}
                    </Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t("palette.groups.actions")} className={group}>
                <Item
                  icon={Plus}
                  value="new-entry"
                  keywords={[t("palette.newEntry")]}
                  hint="Ctrl N"
                  onSelect={() => run(onNewEntry)}
                >
                  {t("palette.newEntry")}
                </Item>
                <Item
                  icon={Lock}
                  value="lock"
                  keywords={[t("palette.lock")]}
                  hint="Ctrl L"
                  onSelect={() => run(() => lockApplication("manual"))}
                >
                  {t("palette.lock")}
                </Item>
                <Item
                  icon={theme === "dark" ? Sun : Moon}
                  value="toggle-theme"
                  keywords={[t("palette.toggleTheme")]}
                  onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}
                >
                  {t("palette.toggleTheme")}
                </Item>
              </Command.Group>
              <Command.Group heading={t("palette.groups.goTo")} className={group}>
                {pages.map((p) => (
                  <Item
                    key={p.id}
                    icon={PAGE_ICONS[p.id]}
                    value={`page-${p.id}`}
                    keywords={[p.label]}
                    onSelect={() => run(() => setActivePage(p.id))}
                  >
                    {p.label}
                  </Item>
                ))}
                {SETTINGS_SECTIONS.map((s) => (
                  <Item
                    key={s}
                    icon={SettingsIcon}
                    value={`settings-${s}`}
                    keywords={[t("nav.settings"), t(`settings.${s}.title`)]}
                    onSelect={() => run(() => setActivePage("settings", s))}
                  >
                    {t("nav.settings")} › {t(`settings.${s}.title`)}
                  </Item>
                ))}
              </Command.Group>
            </>
          )}
        </Command.List>
      </Command>
    </Modal>
  );
}
