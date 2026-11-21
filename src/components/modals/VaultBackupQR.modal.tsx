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
import { Modal } from "../ui/Modal";
import { useTranslation } from "react-i18next";

interface Props {
  onClose: () => void;
}

const CHUNK_SIZE = 700; // bytes of payload per QR (kept well under v40 capacity)

export function VaultBackupQRModal({ onClose }: Props) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    IPCService.vault
      .load()
      .then((p) => {
        if (p) setPayload(p);
        else setError(t("backupQr.noVault"));
      })
      .catch(() => setError(t("backupQr.readFailed")));
  }, [t]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPage((p) => Math.min(p + 1, chunks.length - 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(p - 1, 0));
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
    const qr = qrcode(0, "M"); // typeNumber 0 = auto-size
    qr.addData(chunks[page]);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [chunks, page]);

  return (
    <Modal onClose={onClose} className="max-w-md" label={t("backupQr.label")}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-(--text-primary)">{t("backupQr.title")}</h2>
        <button onClick={onClose} aria-label={t("entry.close")} className="sv-icon-btn">
          ✕
        </button>
      </div>

      {error && <p className="sv-error">{error}</p>}

      {!error && !payload && (
        <p className="text-sm text-(--text-tertiary) text-center py-8">{t("backupQr.loading")}</p>
      )}

      {payload && chunks.length > 0 && (
        <>
          <p className="text-sm text-(--text-secondary) mb-4">
            {t("backupQr.instructions", { count: chunks.length })}
          </p>
          <div
            className="bg-white rounded-xl p-4 flex items-center justify-center mb-4"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0}
              className="sv-btn-secondary px-4 disabled:opacity-40"
            >
              {t("backupQr.prev")}
            </button>
            <span className="text-sm text-(--text-tertiary) tabular-nums">
              {page + 1} / {chunks.length}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, chunks.length - 1))}
              disabled={page === chunks.length - 1}
              className="sv-btn-secondary px-4 disabled:opacity-40"
            >
              {t("backupQr.next")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default VaultBackupQRModal;
