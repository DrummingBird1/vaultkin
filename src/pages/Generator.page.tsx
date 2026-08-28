/**
 * @file src/pages/Generator.page.tsx
 * Standalone password generator with sliders + copy.
 */
import React, { useState, useEffect } from "react";
import { generatePassword }  from "../core/password/generator";
import { analyzeStrength }   from "../core/password/strength";
import { useQuickCopy }      from "../hooks/useQuickCopy";

export function GeneratorPage() {
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits]       = useState(true);
  const [symbols, setSymbols]     = useState(true);
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
  const colors = ["#ef4444","#f97316","#eab308","#22c55e","#10b981"];

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-medium mb-6">Password Generator</h1>

      <div className="sv-card mb-5">
        <div className="bg-[var(--bg-elevated)] rounded-xl p-5 mb-4 break-all font-mono text-lg text-center min-h-[60px] flex items-center justify-center">
          {pw || <span className="text-[var(--text-tertiary)] text-sm">Select at least one character class</span>}
        </div>
        {strength && (
          <div className="flex gap-0.5 mb-3">
            {colors.map((c, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full"
                style={{ background: i <= strength.score ? colors[strength.score] : "var(--border-subtle)" }} />
            ))}
          </div>
        )}
        <div className="flex justify-between text-xs text-[var(--text-tertiary)] mb-4">
          <span>{strength?.label}</span>
          <span>{strength ? `${Math.round(strength.effectiveEntropy)} bits · ${strength.crackTimeDisplay}` : ""}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={regenerate} className="sv-btn-primary flex-1">Regenerate</button>
          <button onClick={() => pw && copy(pw, "Password")} className="sv-btn-secondary flex-1" disabled={!pw}>Copy</button>
        </div>
      </div>

      <div className="sv-card">
        <label className="sv-label">Length: {length}</label>
        <input type="range" min={4} max={64} value={length} onChange={e => setLength(+e.target.value)}
          className="w-full mb-5 accent-[var(--accent)]" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Check label="Uppercase (A-Z)" value={uppercase} onChange={setUppercase} />
          <Check label="Lowercase (a-z)" value={lowercase} onChange={setLowercase} />
          <Check label="Digits (0-9)"    value={digits}    onChange={setDigits} />
          <Check label="Symbols (!@#…)"  value={symbols}   onChange={setSymbols} />
          <Check label="Exclude ambiguous (0/O, 1/l)" value={excludeAmbiguous} onChange={setExcludeAmbiguous} />
        </div>
      </div>
    </div>
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export default GeneratorPage;
