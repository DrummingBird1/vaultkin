/**
 * @file src/pages/Generator.page.tsx
 * Standalone password generator with sliders + copy.
 */
import React, { useState, useEffect } from "react";
import { generatePassword } from "../core/password/generator";
import { analyzeStrength } from "../core/password/strength";
import { useQuickCopy } from "../hooks/useQuickCopy";
import { useTranslation } from "react-i18next";

export function GeneratorPage() {
  const { t } = useTranslation();
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [pw, setPw] = useState("");
  const copy = useQuickCopy();

  const regenerate = () => {
    try {
      setPw(generatePassword({ length, uppercase, lowercase, digits, symbols, excludeAmbiguous }));
    } catch (e: any) {
      setPw(""); // no classes selected
    }
  };

  useEffect(regenerate, [length, uppercase, lowercase, digits, symbols, excludeAmbiguous]);

  const strength = pw ? analyzeStrength(pw) : null;
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-medium mb-6">{t("generator.title")}</h1>

      <div className="sv-card mb-5">
        <div className="bg-(--bg-elevated) rounded-xl p-5 mb-4 break-all font-mono text-lg text-center min-h-[60px] flex items-center justify-center">
          {pw || <span className="text-(--text-tertiary) text-sm">{t("generator.noClasses")}</span>}
        </div>
        {strength && (
          <div className="flex gap-0.5 mb-3">
            {colors.map((c, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full"
                style={{
                  background: i <= strength.score ? colors[strength.score] : "var(--border-subtle)",
                }}
              />
            ))}
          </div>
        )}
        <div className="flex justify-between text-xs text-(--text-tertiary) mb-4">
          <span>{strength ? t(`entry.strength.${strength.score}`) : ""}</span>
          <span>
            {strength
              ? `${t("entry.strength.bits", { bits: Math.round(strength.effectiveEntropy) })} · ${strength.crackTimeDisplay}`
              : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={regenerate} className="sv-btn-primary flex-1">
            {t("generator.regenerate")}
          </button>
          <button
            onClick={() => pw && copy(pw, t("generator.passwordLabel"))}
            className="sv-btn-secondary flex-1"
            disabled={!pw}
          >
            {t("generator.copy")}
          </button>
        </div>
      </div>

      <div className="sv-card">
        <label className="sv-label">{t("generator.length", { length })}</label>
        <input
          type="range"
          min={4}
          max={64}
          value={length}
          onChange={(e) => setLength(+e.target.value)}
          className="w-full mb-5 accent-(--accent)"
        />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Check label={t("generator.uppercase")} value={uppercase} onChange={setUppercase} />
          <Check label={t("generator.lowercase")} value={lowercase} onChange={setLowercase} />
          <Check label={t("generator.digits")} value={digits} onChange={setDigits} />
          <Check label={t("generator.symbols")} value={symbols} onChange={setSymbols} />
          <Check
            label={t("generator.excludeAmbiguous")}
            value={excludeAmbiguous}
            onChange={setExcludeAmbiguous}
          />
        </div>
      </div>
    </div>
  );
}

function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-(--accent)"
      />
      {label}
    </label>
  );
}

export default GeneratorPage;
