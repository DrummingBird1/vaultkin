import { useTranslation } from "react-i18next";
import React from "react";
import { IconPlus, IconSearch, IconTag } from "../icons";

const ghost =
  "flex items-center gap-1.5 text-xs text-(--text-tertiary) hover:text-(--text-secondary) px-3 py-2 rounded-xl border border-(--border-subtle) hover:border-(--border-default) transition-colors";

export function VaultToolbar({
  searchRef,
  search,
  onSearch,
  onTags,
  onImport,
  onExport,
  onAdd,
}: {
  searchRef: React.Ref<HTMLInputElement>;
  search: string;
  onSearch: (text: string) => void;
  onTags: () => void;
  onImport: () => void;
  onExport: () => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-(--border-subtle)">
      <div className="relative flex-1">
        <IconSearch
          aria-hidden="true"
          className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-tertiary) pointer-events-none"
        />
        <input
          ref={searchRef}
          type="search"
          aria-label={t("vault.search")}
          className="w-full bg-(--bg-elevated) border border-(--border-default) rounded-xl ps-9 pe-4 py-2 text-sm text-(--text-primary) placeholder-(--text-tertiary) outline-hidden focus:border-(--accent) transition-colors"
          placeholder={t("vault.searchPlaceholder")}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <button onClick={onTags} className={ghost}>
        <IconTag className="w-3.5 h-3.5" /> {t("vault.tags")}
      </button>
      <button onClick={onImport} className={ghost}>
        {t("vault.import")}
      </button>
      <button onClick={onExport} className={ghost}>
        {t("vault.export")}
      </button>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-(--accent-solid) text-white hover:opacity-90 transition-opacity"
      >
        <IconPlus className="w-4 h-4" /> {t("vault.addEntry")}
      </button>
    </div>
  );
}
