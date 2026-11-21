/**
 * @file fields.tsx
 * Presentational pieces of the Add/Edit Entry form, one per tab.
 * Each takes the form state + a setter; no store access here.
 */
import React, { useId, useState } from "react";
import type { CustomField } from "../../../core/vault/schema";
import { analyzeStrength } from "../../../core/password/strength";
import { generatePassword } from "../../../core/password/generator";
import { TagInput } from "../TagInput";
import { IconEye, IconEyeOff } from "../../icons";
import { cleanTotpSecret, normalizeUrl, totpError, type EntryFormState } from "./entry-form";

type Set = <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) => void;
interface TabProps {
  s: EntryFormState;
  set: Set;
}

const STRENGTH_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];
const STRENGTH_LABELS = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];

export function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const a = analyzeStrength(password);
  const color = STRENGTH_COLORS[a.score] ?? STRENGTH_COLORS[0];
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-0.5 mb-1" aria-hidden="true">
        {STRENGTH_COLORS.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{ background: i <= a.score ? color : "var(--border-subtle)" }}
          />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[11px]" style={{ color }}>
          {STRENGTH_LABELS[a.score] ?? "Unknown"}
        </span>
        <span className="text-[11px] text-(--text-tertiary)">
          {Math.round(a.effectiveEntropy)} bits
        </span>
      </div>
    </div>
  );
}

function RevealButton({
  shown,
  onToggle,
  what,
}: {
  shown: boolean;
  onToggle: () => void;
  what: string;
}) {
  return (
    <button
      type="button"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-tertiary) hover:text-(--text-secondary) transition-colors"
      onClick={onToggle}
      aria-label={shown ? `Hide ${what}` : `Show ${what}`}
      aria-pressed={shown}
    >
      {shown ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
    </button>
  );
}

export function LoginTab({
  s,
  set,
  errors,
  allTags,
}: TabProps & { errors: { url?: string; totp?: string }; allTags: string[] }) {
  const ids = { user: useId(), url: useId(), pw: useId(), totp: useId() };
  const [showPw, setShowPw] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const liveTotpErr = errors.totp || totpError(s.totpSecret);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="sv-label" htmlFor={ids.user}>
            Username / Email
          </label>
          <input
            id={ids.user}
            className="sv-input w-full"
            value={s.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="sv-label" htmlFor={ids.url}>
            URL
          </label>
          <input
            id={ids.url}
            className="sv-input w-full"
            value={s.url}
            onChange={(e) => set("url", e.target.value)}
            onBlur={() => set("url", normalizeUrl(s.url))}
            placeholder="https://example.com"
            autoComplete="off"
            aria-invalid={!!errors.url}
          />
          {errors.url && <p className="sv-error">{errors.url}</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="sv-label mb-0" htmlFor={ids.pw}>
            Password
          </label>
          <button
            type="button"
            onClick={() => {
              set(
                "password",
                generatePassword({
                  length: 20,
                  uppercase: true,
                  lowercase: true,
                  digits: true,
                  symbols: true,
                  excludeAmbiguous: true,
                }),
              );
              setShowPw(true);
            }}
            className="text-xs text-(--accent) hover:underline font-medium"
          >
            Generate
          </button>
        </div>
        <div className="relative">
          <input
            id={ids.pw}
            className="sv-input w-full pr-10 font-mono"
            type={showPw ? "text" : "password"}
            value={s.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
          />
          <RevealButton shown={showPw} onToggle={() => setShowPw((v) => !v)} what="password" />
        </div>
        <StrengthBar password={s.password} />
      </div>

      <div>
        <label className="sv-label" htmlFor={ids.totp}>
          TOTP Secret (2FA)
        </label>
        <div className="relative">
          <input
            id={ids.totp}
            className={`sv-input w-full pr-10 font-mono text-sm ${liveTotpErr ? "border-(--danger)" : ""}`}
            type={showTotp ? "text" : "password"}
            value={s.totpSecret}
            onChange={(e) => set("totpSecret", cleanTotpSecret(e.target.value))}
            placeholder="JBSWY3DPEHPK3PXP (Base32)"
            autoComplete="off"
            aria-invalid={!!liveTotpErr}
          />
          <RevealButton
            shown={showTotp}
            onToggle={() => setShowTotp((v) => !v)}
            what="TOTP secret"
          />
        </div>
        {liveTotpErr && <p className="sv-error">{liveTotpErr}</p>}
        {s.totpSecret && !liveTotpErr && (
          <p className="text-[11px] text-(--success) mt-1">✓ Valid TOTP secret</p>
        )}
      </div>

      <div>
        <span className="sv-label">Tags</span>
        <TagInput value={s.tags} onChange={(t) => set("tags", t)} suggestions={allTags} />
      </div>
    </>
  );
}

export function NotesTab({ s, set }: TabProps) {
  const id = useId();
  return (
    <div>
      <label className="sv-label" htmlFor={id}>
        Secure Notes
      </label>
      <textarea
        id={id}
        className="sv-input w-full resize-none font-mono text-sm"
        rows={10}
        value={s.notes}
        onChange={(e) => set("notes", e.target.value)}
        placeholder="Store any sensitive text here..."
      />
    </div>
  );
}

export function CardTab({ s, set }: TabProps) {
  const ids = { num: useId(), holder: useId(), exp: useId(), cvv: useId() };
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="sv-label" htmlFor={ids.num}>
          Card Number
        </label>
        <input
          id={ids.num}
          className="sv-input w-full font-mono tracking-widest"
          value={s.cardNumber}
          onChange={(e) => set("cardNumber", e.target.value.replace(/\s/g, ""))}
          placeholder="4242 4242 4242 4242"
          inputMode="numeric"
          autoComplete="off"
          maxLength={19}
        />
      </div>
      <div className="col-span-2">
        <label className="sv-label" htmlFor={ids.holder}>
          Cardholder Name
        </label>
        <input
          id={ids.holder}
          className="sv-input w-full"
          value={s.cardHolder}
          onChange={(e) => set("cardHolder", e.target.value)}
          placeholder="JANE DOE"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="sv-label" htmlFor={ids.exp}>
          Expiry
        </label>
        <input
          id={ids.exp}
          className="sv-input w-full font-mono"
          value={s.cardExpiry}
          onChange={(e) => set("cardExpiry", e.target.value)}
          placeholder="MM/YY"
          autoComplete="off"
          maxLength={5}
        />
      </div>
      <div>
        <label className="sv-label" htmlFor={ids.cvv}>
          CVV
        </label>
        <input
          id={ids.cvv}
          className="sv-input w-full font-mono"
          type="password"
          value={s.cardCVV}
          onChange={(e) => set("cardCVV", e.target.value)}
          placeholder="•••"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
        />
      </div>
    </div>
  );
}

function CustomFieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: CustomField;
  onChange: (patch: Partial<CustomField>) => void;
  onRemove: () => void;
}) {
  const [shown, setShown] = useState(false);
  const secret = field.type === "password";
  return (
    <div className="flex gap-2 items-start p-3 bg-(--bg-elevated) rounded-xl border border-(--border-subtle)">
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className="sv-input flex-1 text-sm"
            aria-label="Field label"
            placeholder="Label"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <select
            className="sv-input text-sm w-28"
            aria-label="Field type"
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
            className="sv-input w-full text-sm pr-10"
            aria-label={field.label ? `${field.label} value` : "Field value"}
            type={secret && !shown ? "password" : "text"}
            placeholder="Value"
            value={field.value}
            onChange={(e) => onChange({ value: e.target.value })}
          />
          {secret && (
            <RevealButton shown={shown} onToggle={() => setShown((v) => !v)} what="value" />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove field ${field.label || ""}`.trim()}
        className="mt-1 text-(--danger) hover:opacity-70 p-1 rounded-lg transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}

export function CustomFieldsTab({ s, set }: TabProps) {
  const update = (id: string, patch: Partial<CustomField>) =>
    set(
      "customFields",
      s.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  return (
    <div className="flex flex-col gap-3">
      {s.customFields.length === 0 && (
        <p className="text-sm text-(--text-tertiary) text-center py-4">
          No custom fields yet. Add fields for SSH keys, recovery codes, etc.
        </p>
      )}
      {s.customFields.map((f) => (
        <CustomFieldRow
          key={f.id}
          field={f}
          onChange={(p) => update(f.id, p)}
          onRemove={() =>
            set(
              "customFields",
              s.customFields.filter((x) => x.id !== f.id),
            )
          }
        />
      ))}
      <button
        type="button"
        onClick={() =>
          set("customFields", [
            ...s.customFields,
            { id: crypto.randomUUID(), label: "", value: "", type: "text", protected: false },
          ])
        }
        className="sv-btn-secondary text-sm py-2"
      >
        + Add Custom Field
      </button>
    </div>
  );
}
