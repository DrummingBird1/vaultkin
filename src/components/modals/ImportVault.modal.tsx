/**
 * @file ImportVault.modal.tsx
 * @description Multi-format vault importer with conflict resolution.
 *
 * Supports: Bitwarden, 1Password, LastPass, KeePass XML, generic CSV,
 *           and SecureVault native format (.sv).
 *
 * FLOW:
 *   1. User selects file or drags-and-drops
 *   2. Auto-detect format from content
 *   3. Parse and show preview (N entries found, M skipped)
 *   4. Choose conflict policy (skip / overwrite / keep both)
 *   5. Confirm → batch-add entries → toast summary
 */

import React, { useState, useCallback, useRef } from "react";
import { ImportExportService } from "../../services/import-export.service";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import type { VaultEntry } from "../../core/vault/schema";
import type { ImportResult } from "../../services/import-export.service";
import { Modal } from "../ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type ConflictPolicy = "skip" | "overwrite" | "keep_both";
type Step = "upload" | "preview" | "importing" | "done";

const FORMAT_LABELS: Record<string, string> = {
  bitwarden: "Bitwarden",
  "1password": "1Password",
  lastpass: "LastPass",
  keepass: "KeePass XML",
  csv: "Generic CSV",
};

// ─── ImportVaultModal ─────────────────────────────────────────────────────────

export function ImportVaultModal({ onClose }: Props) {
  const { vault, addEntry, updateEntry } = useVaultStore();
  const { toastSuccess, toastError } = useUIStore();

  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [detectedFormat, setDetectedFormat] = useState("");
  const [fileName, setFileName] = useState("");
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("skip");
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── File processing ────────────────────────────────────────────────────────

  const processFile = useCallback(
    async (file: File) => {
      if (file.size > 50 * 1024 * 1024) {
        toastError("File too large", "Import files must be under 50 MB.");
        return;
      }

      const content = await file.text();
      const format = ImportExportService.detectFormat(content);
      const parsed = await ImportExportService.import(content, format);

      setFileName(file.name);
      setDetectedFormat(FORMAT_LABELS[format] ?? format);
      setResult(parsed);
      setStep("preview");
    },
    [toastError],
  );

  // ── Drop zone ──────────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!result) return;
    setStep("importing");

    // Build a key → existing entry id map so "overwrite" can actually replace
    // (case/whitespace-insensitive on title; exact match on username).
    const dedupeKey = (title?: string, username?: string) =>
      `${(title ?? "").trim().toLowerCase()}::${(username ?? "").trim()}`;
    const existingByKey = new Map<string, string>(
      (vault?.entries ?? []).map((e) => [dedupeKey(e.title, e.username), e.id]),
    );

    let imported = 0;
    let skipped = 0;
    const total = result.entries.length;

    for (let i = 0; i < total; i++) {
      const partial = result.entries[i] as Partial<VaultEntry>;
      const key = dedupeKey(partial.title, partial.username);

      setProgress(Math.round(((i + 1) / total) * 100));

      const existingId = existingByKey.get(key);
      if (existingId) {
        if (conflictPolicy === "skip") {
          skipped++;
          continue;
        }
        if (conflictPolicy === "overwrite") {
          // Replace the existing entry in-place so we don't accumulate duplicates.
          updateEntry(existingId, {
            type: partial.type ?? "login",
            title: partial.title ?? "Imported Entry",
            username: partial.username ?? "",
            password: partial.password ?? "",
            url: partial.url,
            notes: partial.notes,
            totpSecret: partial.totpSecret,
            totpAlgorithm: "SHA1",
            totpDigits: 6,
            totpPeriod: 30,
            category: partial.category ?? "websites",
            tags: partial.tags ?? [],
            favorite: partial.favorite ?? false,
            customFields: partial.customFields ?? [],
            cardNumber: partial.cardNumber,
            cardHolder: partial.cardHolder,
            cardExpiry: partial.cardExpiry,
            cardCVV: partial.cardCVV,
          } as any);
          imported++;
          continue;
        }
        // "keep_both" — fall through to addEntry
      }

      addEntry({
        type: partial.type ?? "login",
        title: partial.title ?? "Imported Entry",
        username: partial.username ?? "",
        password: partial.password ?? "",
        url: partial.url,
        notes: partial.notes,
        totpSecret: partial.totpSecret,
        totpAlgorithm: "SHA1",
        totpDigits: 6,
        totpPeriod: 30,
        category: partial.category ?? "websites",
        tags: partial.tags ?? [],
        favorite: partial.favorite ?? false,
        customFields: partial.customFields ?? [],
        cardNumber: partial.cardNumber,
        cardHolder: partial.cardHolder,
        cardExpiry: partial.cardExpiry,
        cardCVV: partial.cardCVV,
      } as any);

      imported++;
    }

    setImportedCount(imported);
    setSkippedCount(skipped);
    setStep("done");
    toastSuccess(
      "Import complete",
      `${imported} entries imported${skipped > 0 ? `, ${skipped} skipped` : ""}.`,
    );
  }, [result, vault, conflictPolicy, addEntry, updateEntry, toastSuccess]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal onClose={onClose} label="Import vault">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Import Vault</h2>
          <p className="text-xs text-(--text-tertiary) mt-0.5">
            Bitwarden · 1Password · LastPass · KeePass · CSV
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-(--text-tertiary) hover:text-(--text-primary) p-1 rounded-lg transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* ── Step: Upload ── */}
      {step === "upload" && (
        <>
          <div
            ref={dropRef}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 ${
              isDragging
                ? "border-(--accent) bg-(--accent-dim)"
                : "border-(--border-default) bg-(--bg-elevated)"
            }`}
          >
            <div className="text-4xl mb-3">📂</div>
            <p className="font-medium text-(--text-primary) mb-1">Drop your export file here</p>
            <p className="text-sm text-(--text-tertiary) mb-5">or click to browse</p>
            <label className="sv-btn-secondary text-sm cursor-pointer">
              Browse File
              <input
                type="file"
                className="hidden"
                accept=".json,.csv,.xml,.sv"
                onChange={handleFileInput}
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {Object.entries(FORMAT_LABELS).map(([fmt, label]) => (
              <div
                key={fmt}
                className="flex items-center gap-2 p-3 bg-(--bg-elevated) rounded-xl border border-(--border-subtle)"
              >
                <span className="w-2 h-2 rounded-full bg-(--accent)" />
                <span className="text-sm text-(--text-secondary)">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Step: Preview ── */}
      {step === "preview" && result && (
        <>
          {/* Summary card */}
          <div className="bg-(--bg-elevated) border border-(--border-default) rounded-2xl p-5 mb-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">📄</span>
              <div>
                <p className="font-medium text-(--text-primary) text-sm">{fileName}</p>
                <p className="text-xs text-(--text-tertiary)">Detected: {detectedFormat}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-(--text-primary)">{result.imported}</p>
                <p className="text-xs text-(--text-tertiary)">Entries found</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-(--warning)">{result.skipped}</p>
                <p className="text-xs text-(--text-tertiary)">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-(--danger)">{result.errors.length}</p>
                <p className="text-xs text-(--text-tertiary)">Errors</p>
              </div>
            </div>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="mb-4 p-3 bg-(--danger-dim) border border-(--danger)/20 rounded-xl max-h-28 overflow-y-auto">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-(--danger) py-0.5">
                  ⚠ {err}
                </p>
              ))}
            </div>
          )}

          {/* Preview list */}
          <div className="mb-5 max-h-40 overflow-y-auto flex flex-col gap-1">
            {result.entries.slice(0, 20).map((e: any, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-(--bg-elevated) border border-(--border-subtle)"
              >
                <div className="w-6 h-6 rounded-sm bg-(--accent-dim) flex items-center justify-center text-xs font-bold text-(--accent)">
                  {(e.title ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-(--text-primary) truncate">
                    {e.title ?? "Untitled"}
                  </p>
                  <p className="text-xs text-(--text-tertiary) truncate">
                    {e.username ?? e.url ?? ""}
                  </p>
                </div>
                {e.totpSecret && (
                  <span className="text-[10px] bg-(--accent-dim) text-(--accent) px-1.5 py-0.5 rounded-sm">
                    2FA
                  </span>
                )}
              </div>
            ))}
            {result.entries.length > 20 && (
              <p className="text-xs text-(--text-tertiary) text-center py-2">
                + {result.entries.length - 20} more entries
              </p>
            )}
          </div>

          {/* Conflict policy */}
          <div className="mb-5">
            <label className="sv-label">Duplicate handling</label>
            <div className="flex flex-col gap-2">
              {(
                [
                  [
                    "skip",
                    "Skip duplicates",
                    "Keep your existing entries for any title+username match.",
                  ],
                  [
                    "overwrite",
                    "Overwrite existing",
                    "Replace existing entries with imported versions.",
                  ],
                  ["keep_both", "Keep both", "Import everything, even if duplicates exist."],
                ] as Array<[ConflictPolicy, string, string]>
              ).map(([val, label, desc]) => (
                <label
                  key={val}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    conflictPolicy === val
                      ? "border-(--accent) bg-(--accent-dim)"
                      : "border-(--border-default) bg-(--bg-elevated) hover:border-(--border-strong)"
                  }`}
                >
                  <input
                    type="radio"
                    name="conflict"
                    value={val}
                    checked={conflictPolicy === val}
                    onChange={() => setConflictPolicy(val)}
                    className="mt-0.5 accent-(--accent)"
                  />
                  <div>
                    <p className="text-sm font-medium text-(--text-primary)">{label}</p>
                    <p className="text-xs text-(--text-tertiary)">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="sv-btn-secondary px-4"
            >
              ← Back
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="sv-btn-secondary px-4">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="sv-btn-primary px-5"
                disabled={result.imported === 0}
              >
                Import {result.imported} Entries
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Step: Importing ── */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-12 gap-5">
          <div className="w-16 h-16 rounded-2xl bg-(--accent-dim) flex items-center justify-center text-2xl animate-pulse">
            📥
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2 bg-(--bg-elevated) rounded-full overflow-hidden">
              <div
                className="h-full bg-(--accent) rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-(--text-tertiary) text-center mt-2">{progress}% complete</p>
          </div>
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === "done" && (
        <div className="flex flex-col items-center text-center py-8 gap-4">
          <div className="w-16 h-16 rounded-full bg-(--success-dim) flex items-center justify-center text-3xl">
            ✅
          </div>
          <div>
            <h3 className="text-lg font-semibold text-(--text-primary)">Import Complete</h3>
            <p className="text-(--text-tertiary) mt-1">
              <span className="text-(--success) font-semibold">{importedCount}</span> entries added
              {skippedCount > 0 && (
                <>
                  , <span className="text-(--warning) font-semibold">{skippedCount}</span> skipped
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="sv-btn-primary px-8 mt-2">
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
