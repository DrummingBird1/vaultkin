/**
 * @file src/components/modals/VaultBackupQR.modal.tsx
 * Export the encrypted vault as a series of scannable QR codes.
 *
 * The encrypted payload (already ciphertext — safe to render) is split into
 * fixed-size chunks, each prefixed `SVQR:<i>/<n>:` so a companion importer can
 * reassemble them in order. Uses qrcode-generator (full QR spec: all versions,
 * alignment patterns, masks) so the codes scan reliably on real devices.
 */
import React, { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { IPCService } from "../../services/ipc.service";

interface Props { onClose: () => void; }

const CHUNK_SIZE = 700; // bytes of payload per QR (kept well under v40 capacity)

export function VaultBackupQRModal({ onClose }: Props) {
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError]     = useState("");
  const [page, setPage]       = useState(0);

  useEffect(() => {
    IPCService.vault.load()
      .then(p => { if (p) setPayload(p); else setError("No vault found to back up."); })
      .catch(() => setError("Failed to read the vault."));
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setPage(p => Math.min(p + 1, chunks.length - 1));
      if (e.key === "ArrowLeft")  setPage(p => Math.max(p - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const chunks = useMemo(() => {
    if (!payload) return [] as string[];
    const out: string[] = [];
    const total = Math.ceil(payload.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      const slice = payload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      out.push(`SVQR:${i + 1}/${total}:${slice}`);
    }
    return out;
  }, [payload]);

  const svg = useMemo(() => {
    if (!chunks[page]) return "";
    const qr = qrcode(0, "M");          // typeNumber 0 = auto-size
    qr.addData(chunks[page]);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [chunks, page]);

  return (
    <div className="sv-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sv-modal max-w-md" role="dialog" aria-modal="true" aria-label="Vault QR backup">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">QR Backup</h2>
          <button onClick={onClose} aria-label="Close" className="sv-icon-btn">✕</button>
        </div>

        {error && <p className="sv-error">{error}</p>}

        {!error && !payload && (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Loading vault…</p>
        )}

        {payload && chunks.length > 0 && (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Scan all {chunks.length} code{chunks.length > 1 ? "s" : ""} in order to back up your
              <strong> encrypted</strong> vault. They contain ciphertext only — your master password
              is still required to open the result.
            </p>
            <div className="bg-white rounded-xl p-4 flex items-center justify-center mb-4"
              dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="flex items-center justify-between">
              <button onClick={() => setPage(p => Math.max(p - 1, 0))} disabled={page === 0}
                className="sv-btn-secondary px-4 disabled:opacity-40">← Prev</button>
              <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
                {page + 1} / {chunks.length}
              </span>
              <button onClick={() => setPage(p => Math.min(p + 1, chunks.length - 1))} disabled={page === chunks.length - 1}
                className="sv-btn-secondary px-4 disabled:opacity-40">Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default VaultBackupQRModal;
