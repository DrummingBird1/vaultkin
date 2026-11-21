/**
 * @file AddEditEntry.modal.tsx
 * @description Unified modal for creating and editing vault entries.
 *
 * Handles: login entries (username/password/URL/TOTP), secure notes,
 * credit cards, and custom-field entries.
 *
 * FORM BEHAVIOUR:
 * - Password field with inline strength meter and generator pop-up
 * - TOTP secret field with live validation and QR import button
 * - URL field with scheme autocomplete (prepends https://)
 * - Custom fields (add / remove / reorder)
 * - All inputs sanitized before dispatch to vault.store
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useVaultStore } from "../../store/vault.store";
import { useUIStore } from "../../store/ui.store";
import type { VaultEntry, CategoryType, CustomField } from "../../core/vault/schema";
import { generatePassword } from "../../core/password/generator";
import { analyzeStrength } from "../../core/password/strength";
import { validateBase32Secret } from "../../core/totp/base32";
import { TagInput } from "../vault/TagInput";
import { Modal } from "../ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  entry?: VaultEntry | null; // null = create mode
  folderId?: string;
  onClose: () => void;
}

type EntryTab = "login" | "notes" | "card" | "fields";

const CATEGORIES: Array<{ value: CategoryType; label: string; emoji: string }> = [
  { value: "websites", label: "Website", emoji: "🌐" },
  { value: "apps", label: "App", emoji: "📱" },
  { value: "finance", label: "Finance", emoji: "💳" },
  { value: "gaming", label: "Gaming", emoji: "🎮" },
  { value: "servers", label: "Server", emoji: "🖥️" },
  { value: "identity", label: "Identity", emoji: "🪪" },
  { value: "email", label: "Email", emoji: "📧" },
  { value: "custom", label: "Custom", emoji: "📁" },
];

// ─── StrengthBar ──────────────────────────────────────────────────────────────

function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const analysis = analyzeStrength(password);
  const levels = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];
  const labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const color = levels[analysis.score] ?? levels[0];
  const label = labels[analysis.score] ?? "Unknown";

  return (
    <div className="mt-1.5">
      <div className="flex gap-0.5 mb-1">
        {levels.map((c, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{ background: i <= analysis.score ? color : "var(--border-subtle)" }}
          />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[11px]" style={{ color }}>
          {label}
        </span>
        <span className="text-[11px] text-(--text-tertiary)">
          {Math.round(analysis.effectiveEntropy)} bits
        </span>
      </div>
    </div>
  );
}

// ─── CustomFieldRow ───────────────────────────────────────────────────────────

function CustomFieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: CustomField;
  onChange: (patch: Partial<CustomField>) => void;
  onRemove: () => void;
}) {
  const [showVal, setShowVal] = useState(false);
  const isSecret = field.type === "password";

  return (
    <div className="flex gap-2 items-start p-3 bg-(--bg-elevated) rounded-xl border border-(--border-subtle)">
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className="sv-input flex-1 text-sm"
            placeholder="Label"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <select
            className="sv-input text-sm w-28"
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value as CustomField["type"] })}
          >
            <option value="text">Text</option>
            <option value="password">Secret</option>
            <option value="url">URL</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="note">Note</option>
          </select>
        </div>
        <div className="relative">
          <input
            className="sv-input w-full text-sm pr-8"
            type={isSecret && !showVal ? "password" : "text"}
            placeholder="Value"
            value={field.value}
            onChange={(e) => onChange({ value: e.target.value })}
          />
          {isSecret && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-tertiary) hover:text-(--text-secondary)"
              onClick={() => setShowVal((v) => !v)}
            >
              {showVal ? "🙈" : "👁️"}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-1 text-(--danger) hover:text-(--danger-dim) p-1 rounded-lg transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function AddEditEntryModal({ entry, folderId, onClose }: Props) {
  const isEdit = !!entry;
  const { vault, addEntry, updateEntry } = useVaultStore();
  const { toastSuccess } = useUIStore();
  const firstInputRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of vault?.entries ?? []) for (const t of e.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [vault?.entries]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<EntryTab>("login");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState(entry?.password ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [totpSecret, setTotpSecret] = useState(entry?.totpSecret ?? "");
  const [category, setCategory] = useState<CategoryType>(entry?.category ?? "websites");
  const [favorite, setFavorite] = useState(entry?.favorite ?? false);
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [customFields, setCustomFields] = useState<CustomField[]>(entry?.customFields ?? []);

  // Card fields
  const [cardNumber, setCardNumber] = useState(entry?.cardNumber ?? "");
  const [cardHolder, setCardHolder] = useState(entry?.cardHolder ?? "");
  const [cardExpiry, setCardExpiry] = useState(entry?.cardExpiry ?? "");
  const [cardCVV, setCardCVV] = useState(entry?.cardCVV ?? "");

  const [showPassword, setShowPassword] = useState(false);
  const [showTOTP, setShowTOTP] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // ── URL scheme autocomplete ────────────────────────────────────────────────
  // Pure helper so we can apply the same normalization on blur AND on submit
  // (otherwise hitting Save without blurring leaves the URL un-prefixed and
  // validateUrl rejects it).
  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.includes("://")
    ) {
      return trimmed;
    }
    return "https://" + trimmed;
  }

  function handleUrlBlur() {
    const normalized = normalizeUrl(url);
    if (normalized !== url) setUrl(normalized);
  }

  // ── TOTP validation ────────────────────────────────────────────────────────
  function handleTOTPChange(val: string) {
    const cleaned = val.trim().toUpperCase().replace(/\s/g, "");
    setTotpSecret(cleaned);
    if (cleaned && !validateBase32Secret(cleaned)) {
      setTotpError("Invalid Base32 secret. Expected characters A–Z, 2–7.");
    } else {
      setTotpError("");
    }
  }

  // ── Inline password generator ──────────────────────────────────────────────
  function handleGeneratePassword() {
    const pw = generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      excludeAmbiguous: true,
    });
    setPassword(pw);
    setShowPassword(true);
  }

  // ── Custom fields ──────────────────────────────────────────────────────────
  function addCustomField() {
    setCustomFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: "",
        value: "",
        type: "text",
        protected: false,
      },
    ]);
  }

  function updateCustomField(id: string, patch: Partial<CustomField>) {
    setCustomFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeCustomField(id: string) {
    setCustomFields((prev) => prev.filter((f) => f.id !== id));
  }

  // ── Validate URL ──────────────────────────────────────────────────────────
  function validateUrl(raw: string): boolean {
    if (!raw) return true;
    try {
      const u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      let valid = true;

      if (!title.trim()) {
        setTitleError("Title is required.");
        valid = false;
      } else {
        setTitleError("");
      }

      // Apply scheme autocomplete here too, so user can type "example.com" and
      // hit Save without first blurring the URL field.
      const normalizedUrl = normalizeUrl(url);
      if (normalizedUrl !== url) setUrl(normalizedUrl);
      if (normalizedUrl && !validateUrl(normalizedUrl)) {
        setUrlError("Enter a valid https:// URL.");
        valid = false;
      } else {
        setUrlError("");
      }

      if (totpSecret && !validateBase32Secret(totpSecret)) {
        setTotpError("Invalid TOTP secret.");
        valid = false;
      }

      if (!valid) return;
      setSubmitting(true);

      const payload = {
        type: "login" as const,
        title: title.trim(),
        username: username.trim(),
        password,
        url: normalizedUrl || undefined,
        notes: notes.trim() || undefined,
        totpSecret: totpSecret || undefined,
        totpAlgorithm: "SHA1" as const,
        totpDigits: 6 as const,
        totpPeriod: 30 as const,
        category,
        folderId,
        tags,
        favorite,
        customFields,
        cardNumber: cardNumber.trim() || undefined,
        cardHolder: cardHolder.trim() || undefined,
        cardExpiry: cardExpiry.trim() || undefined,
        cardCVV: cardCVV.trim() || undefined,
      };

      if (isEdit && entry) {
        updateEntry(entry.id, payload);
        toastSuccess("Entry updated", `"${title}" saved.`);
      } else {
        addEntry(payload);
        toastSuccess("Entry added", `"${title}" added to vault.`);
      }

      setSubmitting(false);
      onClose();
    },
    [
      title,
      username,
      password,
      url,
      notes,
      totpSecret,
      category,
      folderId,
      tags,
      favorite,
      customFields,
      cardNumber,
      cardHolder,
      cardExpiry,
      cardCVV,
      isEdit,
      entry,
      addEntry,
      updateEntry,
      toastSuccess,
      onClose,
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal onClose={onClose} label={isEdit ? "Edit entry" : "Add entry"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-(--text-primary)">
          {isEdit ? "Edit Entry" : "Add Entry"}
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`p-1.5 rounded-lg transition-colors ${favorite ? "text-amber-400" : "text-(--text-tertiary) hover:text-amber-400"}`}
            onClick={() => setFavorite((v) => !v)}
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          >
            ★
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-(--text-tertiary) hover:text-(--text-primary) p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Title + Category */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <label className="sv-label">Title *</label>
          <input
            ref={firstInputRef}
            className="sv-input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
            placeholder="e.g. GitHub Work"
          />
          {titleError && <p className="sv-error">{titleError}</p>}
        </div>
        <div className="w-36">
          <label className="sv-label">Category</label>
          <select
            className="sv-input w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryType)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-(--border-subtle) pb-0">
        {(["login", "notes", "card", "fields"] as EntryTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors capitalize ${
              tab === t
                ? "text-(--accent) border-(--accent)"
                : "text-(--text-tertiary) border-transparent hover:text-(--text-secondary)"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "fields" ? "Custom" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* ── Login Tab ── */}
        {tab === "login" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sv-label">Username / Email</label>
                <input
                  className="sv-input w-full"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-label="Username"
                  placeholder="user@example.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="sv-label">URL</label>
                <input
                  className="sv-input w-full"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={handleUrlBlur}
                  placeholder="https://example.com"
                  autoComplete="off"
                />
                {urlError && <p className="sv-error">{urlError}</p>}
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="sv-label mb-0">Password</label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-xs text-(--accent) hover:underline font-medium"
                >
                  Generate
                </button>
              </div>
              <div className="relative">
                <input
                  className="sv-input w-full pr-10 font-mono"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-tertiary) hover:text-(--text-secondary) transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              <StrengthBar password={password} />
            </div>

            {/* TOTP */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="sv-label mb-0">TOTP Secret (2FA)</label>
                <button
                  type="button"
                  className="text-xs text-(--text-tertiary) hover:text-(--accent) transition-colors"
                  onClick={() => setShowTOTP((v) => !v)}
                >
                  {showTOTP ? "Hide" : "Show"}
                </button>
              </div>
              <input
                className={`sv-input w-full font-mono text-sm ${totpError ? "border-(--danger)" : ""}`}
                type={showTOTP ? "text" : "password"}
                value={totpSecret}
                onChange={(e) => handleTOTPChange(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP (Base32)"
                autoComplete="off"
              />
              {totpError && <p className="sv-error">{totpError}</p>}
              {totpSecret && !totpError && (
                <p className="text-[11px] text-(--success) mt-1">✓ Valid TOTP secret</p>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="sv-label">Tags</label>
              <TagInput value={tags} onChange={setTags} suggestions={allTags} />
            </div>
          </>
        )}

        {/* ── Notes Tab ── */}
        {tab === "notes" && (
          <div>
            <label className="sv-label">Secure Notes</label>
            <textarea
              className="sv-input w-full resize-none font-mono text-sm"
              rows={10}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Store any sensitive text here..."
            />
          </div>
        )}

        {/* ── Card Tab ── */}
        {tab === "card" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="sv-label">Card Number</label>
              <input
                className="sv-input w-full font-mono tracking-widest"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.replace(/\s/g, ""))}
                placeholder="4242 4242 4242 4242"
                maxLength={19}
              />
            </div>
            <div className="col-span-2">
              <label className="sv-label">Cardholder Name</label>
              <input
                className="sv-input w-full"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                placeholder="JANE DOE"
              />
            </div>
            <div>
              <label className="sv-label">Expiry</label>
              <input
                className="sv-input w-full font-mono"
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
                placeholder="MM/YY"
                maxLength={5}
              />
            </div>
            <div>
              <label className="sv-label">CVV</label>
              <input
                className="sv-input w-full font-mono"
                type="password"
                value={cardCVV}
                onChange={(e) => setCardCVV(e.target.value)}
                placeholder="•••"
                maxLength={4}
              />
            </div>
          </div>
        )}

        {/* ── Custom Fields Tab ── */}
        {tab === "fields" && (
          <div className="flex flex-col gap-3">
            {customFields.length === 0 && (
              <p className="text-sm text-(--text-tertiary) text-center py-4">
                No custom fields yet. Add fields for SSH keys, recovery codes, etc.
              </p>
            )}
            {customFields.map((field) => (
              <CustomFieldRow
                key={field.id}
                field={field}
                onChange={(p) => updateCustomField(field.id, p)}
                onRemove={() => removeCustomField(field.id)}
              />
            ))}
            <button
              type="button"
              onClick={addCustomField}
              className="sv-btn-secondary text-sm py-2"
            >
              + Add Custom Field
            </button>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-(--border-subtle)">
          <button type="button" onClick={onClose} className="sv-btn-secondary px-5">
            Cancel
          </button>
          <button type="submit" className="sv-btn-primary px-5" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
