/**
 * @file src/components/vault/TagInput.tsx
 * Chip-based tag input with per-segment autocomplete. Replaces a plain
 * comma-separated text field — a native <datalist> can't autocomplete one
 * segment of a comma-separated string, only the whole field.
 */
import { useTranslation } from "react-i18next";
import React, { useState, useRef } from "react";
import { IconClose } from "../icons";

export function TagInput({
  value,
  onChange,
  suggestions = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = draft.trim()
    ? suggestions
        .filter((s) => s.toLowerCase().includes(draft.trim().toLowerCase()) && !value.includes(s))
        .slice(0, 6)
    : [];

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="relative">
      <div className="sv-input flex flex-wrap gap-1.5 items-center min-h-[42px] px-2 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-(--accent-dim) text-(--accent)"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={t("tagInput.remove", { tag })}
              className="hover:opacity-70"
            >
              <IconClose className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
          aria-label={t("entry.tags")}
          placeholder={value.length === 0 ? t("tagInput.placeholder") : ""}
          className="flex-1 min-w-[80px] bg-transparent outline-hidden text-sm text-(--text-primary) placeholder-(--text-tertiary)"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-(--border-default) bg-(--bg-elevated) shadow-lg overflow-hidden">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              // onMouseDown (not onClick) fires before the input's onBlur, so
              // the suggestion click registers before blur closes the list.
              onMouseDown={() => commit(s)}
              className="block w-full text-start px-3 py-2 text-sm text-(--text-primary) hover:bg-(--accent-dim) hover:text-(--accent)"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
