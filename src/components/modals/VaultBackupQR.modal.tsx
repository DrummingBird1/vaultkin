/**
 * @file src/components/modals/VaultBackupQR.modal.tsx
 * Export the encrypted vault as a series of scannable QR codes.
 *
 * The encrypted payload (already ciphertext — safe to render) is split into
 * fixed-size chunks, each prefixed `SVQR:<i>/<n>:` so services/backup-text.ts
 * can reassemble them (Restore from backup). Uses qrcode-generator (full QR spec: all versions,
 * alignment patterns, masks) so the codes scan reliably on real devices.
 */
import React, { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { IPCService } from "../../services/ipc.service";
import { splitBackup } from "../../services/backup-text";
import { Modal } from "../ui/Modal";
import { useTranslation } from "react-i18next";

interface Props {
  onClose: () => void;
}

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
      // "Next" is the reading direction: right in LTR, left in RTL (Hebrew).
      const rtl = document.documentElement.dir === "rtl";
      const next = rtl ? "ArrowLeft" : "ArrowRight";
      const prev = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === next) setPage((p) => Math.min(p + 1, chunks.length - 1));
      if (e.key === prev) setPage((p) => Math.max(p - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const chunks = useMemo(() => (payload ? splitBackup(payload) : []), [payload]);

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
