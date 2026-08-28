/**
 * @file Vault.page.tsx — Step 7 final wired version.
 * Integrates AddEditEntry, ConfirmDelete, ImportVault modals into the vault page.
 * Wires through vault.store CRUD actions and ClipboardService for copy.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useVaultStore }       from "../store/vault.store";
import { useUIStore }          from "../store/ui.store";
import { ClipboardService }    from "../services/clipboard.service";
import { ImportExportService } from "../services/import-export.service";
import { HistoryService }      from "../services/history.service";
import { AddEditEntryModal }   from "../components/modals/AddEditEntry.modal";
import { ImportVaultModal }    from "../components/modals/ImportVault.modal";
import { ConfirmDeleteModal }  from "../components/modals/ConfirmDelete.modal";
import type { VaultEntry }     from "../core/vault/schema";

// ─── Inline icons ─────────────────────────────────────────────────────────────
// Tiny SVG primitives that render identically across OSes. Inline keeps the
// dep graph minimal — once we install lucide-react we can swap these out.

const IconClose = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconStar = ({ filled = false, className = "w-4 h-4" }: { filled?: boolean; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const IconEmptyVault = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    <circle cx="12" cy="16" r="1.5" />
  </svg>
);

// ─── Search-term highlighter ──────────────────────────────────────────────────

/** Escape regex metacharacters in the user's search input. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap every case-insensitive occurrence of `query` inside `text` with <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const re = new RegExp(`(${escapeRegex(query)})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-[var(--accent-dim)] text-[var(--accent)] rounded px-0.5">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  );
}

// ─── Entry detail panel ───────────────────────────────────────────────────────

const SHOW_PASSWORD_TIMEOUT_MS = 10_000;

function EntryDetail({
  entry, onEdit, onDelete, onClose,
}: {
  entry: VaultEntry;
  onEdit:   () => void;
  onDelete: () => void;
  onClose:  () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toastSuccess }    = useUIStore();
  const updateEntry         = useVaultStore(s => s.updateEntry);

  // Past versions for this entry (in-memory, cleared on lock).
  const versions = HistoryService.get(entry.id);

  const restoreVersion = (v: VaultEntry) => {
    updateEntry(entry.id, {
      title: v.title, username: v.username, password: v.password, url: v.url,
      notes: v.notes, totpSecret: v.totpSecret, category: v.category,
      tags: v.tags, customFields: v.customFields,
    });
    toastSuccess("Version restored", "Reverted to the selected previous version.");
    setShowHistory(false);
  };

  // Auto-hide the password after a short window. Reduces shoulder-surfing /
  // accidental-screenshot risk if the user wanders off with the panel open.
  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    setSecondsLeft(Math.round(SHOW_PASSWORD_TIMEOUT_MS / 1000));
    hideTimerRef.current = setTimeout(() => {
      setShowPw(false);
      setSecondsLeft(0);
    }, SHOW_PASSWORD_TIMEOUT_MS);
    tickTimerRef.current = setInterval(() => {
      setSecondsLeft(s => (s > 0 ? s - 1 : 0));
    }, 1000);
  }, []);

  const togglePw = useCallback(() => {
    setShowPw(prev => {
      const next = !prev;
      if (next) startHideTimer();
      else {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (tickTimerRef.current) clearInterval(tickTimerRef.current);
        setSecondsLeft(0);
      }
      return next;
    });
  }, [startHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

  const copyField = async (value: string, label: string) => {
    const ok = await ClipboardService.copy(value, label);
    if (ok) toastSuccess(`${label} copied`, `Clears in ${ClipboardService.getRemainingSeconds()}s`);
  };

  return (
    <div className="w-80 flex-shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col"
      style={{ animation: "slideUp 200ms ease both" }}>
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center text-sm font-bold text-[var(--accent)] flex-shrink-0">
            {entry.title[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{entry.title}</p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{entry.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} aria-label="Edit entry" className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors text-xs">Edit</button>
          <button onClick={onClose} aria-label="Close entry details" className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <IconClose />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* URL */}
        {entry.url && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">URL</label>
            <div className="flex items-center gap-2 mt-1">
              <a href={entry.url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[var(--accent)] hover:underline truncate flex-1">{entry.url}</a>
              <button onClick={() => copyField(entry.url!, "URL")} aria-label="Copy URL" className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors text-xs flex-shrink-0">Copy</button>
            </div>
          </div>
        )}

        {/* Username */}
        {entry.username && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Username</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{entry.username}</span>
              <button onClick={() => copyField(entry.username!, "Username")} aria-label="Copy username" className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors text-xs">Copy</button>
            </div>
          </div>
        )}

        {/* Password */}
        {entry.password && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Password</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-[var(--text-primary)] flex-1">
                {showPw ? entry.password : "•".repeat(Math.min(entry.password.length, 20))}
              </span>
              <button onClick={togglePw} aria-label={showPw ? "Hide password" : "Show password"} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors text-xs">
                {showPw ? `Hide (${secondsLeft}s)` : "Show"}
              </button>
              <button onClick={() => copyField(entry.password!, "Password")} aria-label="Copy password" className="text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors text-xs">Copy</button>
            </div>
          </div>
        )}

        {/* Notes */}
        {entry.notes && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Notes</label>
            <p className="text-sm text-[var(--text-secondary)] mt-1 whitespace-pre-wrap leading-relaxed">{entry.notes}</p>
          </div>
        )}

        {/* TOTP badge */}
        {entry.totpSecret && (
          <div className="p-3 bg-[var(--accent-dim)] border border-[var(--accent)]/20 rounded-xl">
            <p className="text-xs font-medium text-[var(--accent)] mb-1">2FA Enabled</p>
            <p className="text-xs text-[var(--text-tertiary)]">TOTP code available in Authenticator tab</p>
          </div>
        )}

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Tags</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {entry.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Custom fields */}
        {entry.customFields?.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Custom Fields</label>
            <div className="mt-1.5 flex flex-col gap-2">
              {entry.customFields.map(f => (
                <div key={f.id} className="flex items-center gap-2 p-2 bg-[var(--bg-elevated)] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-tertiary)]">{f.label}</p>
                    <p className="text-sm font-mono text-[var(--text-primary)] truncate">
                      {f.type === "password" ? "•••••••" : f.value}
                    </p>
                  </div>
                  <button onClick={() => copyField(f.value, f.label)} className="text-[var(--text-tertiary)] hover:text-[var(--accent)] text-xs">Copy</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Version history */}
        {versions.length > 0 && (
          <div>
            <button onClick={() => setShowHistory(v => !v)}
              className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider hover:text-[var(--accent)] transition-colors">
              {showHistory ? "▾" : "▸"} Previous versions ({versions.length})
            </button>
            {showHistory && (
              <div className="mt-2 flex flex-col gap-1.5">
                {versions.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-[var(--bg-elevated)] rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-secondary)] truncate">{v.title}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {v.updatedAt ? new Date(v.updatedAt).toLocaleString() : "earlier version"}
                      </p>
                    </div>
                    <button onClick={() => restoreVersion(v)}
                      className="text-[var(--accent)] hover:underline text-xs flex-shrink-0">Restore</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete button */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <button onClick={onDelete}
          className="w-full text-sm text-[var(--danger)] hover:bg-[var(--danger-dim)] py-2 rounded-xl transition-colors">
          Delete Entry
        </button>
      </div>
    </div>
  );
}

// ─── Entry card (grid view) ───────────────────────────────────────────────────

const EntryCard = React.memo(function EntryCard({ entry, selected, query, onClick, onFavorite }: {
  entry: VaultEntry; selected: boolean; query: string;
  onClick: () => void; onFavorite: () => void;
}) {
  return (
    <div onClick={onClick}
      className={`relative group flex flex-col gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-150 ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-dim)]"
          : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
      }`}>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-base font-bold text-[var(--accent)]">
          {entry.title[0]?.toUpperCase()}
        </div>
        <button onClick={e => { e.stopPropagation(); onFavorite(); }}
          aria-label={entry.favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={entry.favorite}
          className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all ${entry.favorite ? "opacity-100 text-amber-400" : "text-[var(--text-tertiary)] hover:text-amber-400"}`}>
          <IconStar filled={entry.favorite} />
        </button>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
          <Highlight text={entry.title} query={query} />
        </p>
        <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
          <Highlight text={entry.username || entry.url || entry.category} query={query} />
        </p>
      </div>
      {entry.totpSecret && (
        <span className="self-start text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20">
          2FA
        </span>
      )}
    </div>
  );
});

// ─── VaultPage ────────────────────────────────────────────────────────────────

export function VaultPage() {
  const {
    filteredEntries, selectedEntryId, vault,
    selectEntry, deleteEntry, toggleFavorite, searchQuery, setSearchQuery,
  } = useVaultStore();
  const { viewMode, toastSuccess, toastError } = useUIStore();
  const editEntryId     = useUIStore(s => s.editEntryId);
  const consumeEditEntry = useUIStore(s => s.consumeEditEntry);
  const [showAddEdit, setShowAddEdit]     = useState(false);
  const [editingEntry, setEditingEntry]   = useState<VaultEntry | null>(null);
  const [showImport, setShowImport]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<VaultEntry | null>(null);

  const selectedEntry = selectedEntryId
    ? vault?.entries.find(e => e.id === selectedEntryId) ?? null
    : null;

  // Text we'll highlight in titles/usernames. Memoize so EntryCard's
  // React.memo doesn't re-render every time an unrelated state changes.
  const highlightQuery = useMemo(() => (searchQuery.text ?? "").trim(), [searchQuery.text]);

  const handleAdd = useCallback(() => {
    setEditingEntry(null); setShowAddEdit(true);
  }, []);

  const handleEdit = useCallback((entry: VaultEntry) => {
    setEditingEntry(entry); setShowAddEdit(true);
  }, []);

  // Cross-page "Fix" requests from the Health dashboard land here: it sets
  // editEntryId in the ui store and switches to this page. Consume it once and
  // open the edit modal for that entry.
  useEffect(() => {
    if (!editEntryId) return;
    const id = consumeEditEntry();
    const entry = vault?.entries.find(e => e.id === id);
    if (entry) { setEditingEntry(entry); setShowAddEdit(true); }
  }, [editEntryId, consumeEditEntry, vault]);

  const handleDeleteConfirm = useCallback(() => {
    if (!confirmDelete) return;
    deleteEntry(confirmDelete.id);
    selectEntry(null);
    setConfirmDelete(null);
    toastSuccess("Entry deleted", `"${confirmDelete.title}" permanently removed.`);
  }, [confirmDelete, deleteEntry, selectEntry, toastSuccess]);

  const handleExportCSV = useCallback(() => {
    if (!vault?.entries.length) { toastError("Nothing to export", "Vault is empty."); return; }
    const csv = ImportExportService.exportCSV(vault.entries);
    // Browser-portable download. Works under Electron too (Chromium renderer).
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `securevault-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toastSuccess("Export ready", "CSV file saved.");
  }, [vault?.entries, toastSuccess, toastError]);

  return (
    <>
      {showAddEdit && (
        <AddEditEntryModal
          entry={editingEntry}
          onClose={() => { setShowAddEdit(false); setEditingEntry(null); }}
        />
      )}
      {showImport && <ImportVaultModal onClose={() => setShowImport(false)} />}
      {confirmDelete && (
        <ConfirmDeleteModal
          title={confirmDelete.title}
          description="All passwords, TOTP secrets, and custom fields will be lost."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="flex flex-1 overflow-hidden h-full">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)]">
            <input
              className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="Search entries…"
              value={searchQuery.text ?? ""}
              onChange={e => setSearchQuery({ text: e.target.value })}
            />
            <button onClick={() => setShowImport(true)}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors">
              Import
            </button>
            <button onClick={handleExportCSV}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors">
              Export
            </button>
            <button onClick={handleAdd}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity">
              + Add Entry
            </button>
          </div>

          {/* Entry grid/list */}
          <div className="flex-1 overflow-y-auto p-5">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <IconEmptyVault className="w-14 h-14 text-[var(--text-tertiary)]" />
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {vault?.entries.length === 0 ? "Your vault is empty" : "No results found"}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    {vault?.entries.length === 0
                      ? "Add your first entry to get started"
                      : "Try a different search term"}
                  </p>
                </div>
                {vault?.entries.length === 0 && (
                  <button onClick={handleAdd}
                    className="text-sm font-medium px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity">
                    + Add Entry
                  </button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {filteredEntries.map((entry, i) => (
                  <div key={entry.id} style={{ animation: `slideUp 200ms ${i * 20}ms ease both` }}>
                    <EntryCard
                      entry={entry}
                      selected={entry.id === selectedEntryId}
                      query={highlightQuery}
                      onClick={() => selectEntry(entry.id === selectedEntryId ? null : entry.id)}
                      onFavorite={() => toggleFavorite(entry.id)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredEntries.map((entry, i) => (
                  <div key={entry.id}
                    style={{ animation: `slideUp 150ms ${i * 15}ms ease both` }}
                    onClick={() => selectEntry(entry.id === selectedEntryId ? null : entry.id)}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                      entry.id === selectedEntryId
                        ? "bg-[var(--accent-dim)] border border-[var(--accent)]"
                        : "bg-[var(--bg-surface)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                    }`}>
                    <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-sm font-bold text-[var(--accent)] flex-shrink-0">
                      {entry.title[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        <Highlight text={entry.title} query={highlightQuery} />
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">
                        <Highlight text={entry.username || ""} query={highlightQuery} />
                      </p>
                    </div>
                    {entry.totpSecret && <span className="text-[10px] bg-[var(--accent-dim)] text-[var(--accent)] px-1.5 py-0.5 rounded-full border border-[var(--accent)]/20">2FA</span>}
                    {entry.favorite && <IconStar filled className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — `key` forces a fresh instance per entry so internal
            UI state (e.g. showPw) does not leak across entries. */}
        {selectedEntry && (
          <EntryDetail
            key={selectedEntry.id}
            entry={selectedEntry}
            onEdit={() => handleEdit(selectedEntry)}
            onDelete={() => setConfirmDelete(selectedEntry)}
            onClose={() => selectEntry(null)}
          />
        )}
      </div>
    </>
  );
}
