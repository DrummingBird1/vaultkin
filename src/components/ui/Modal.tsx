/**
 * @file src/components/ui/Modal.tsx
 * The one dialog shell every modal uses: backdrop, `sv-modal` panel, ARIA,
 * focus trap (useFocusTrap), Escape-to-close and backdrop-click-to-close.
 *
 * Escape only closes the TOPMOST open modal: modals register on a module-level
 * stack, so a ConfirmDelete opened over AddEditEntry doesn't close both.
 *
 * Pass `onClose={undefined}` (or `dismissable={false}`) for flows that must
 * not be dismissed mid-operation (e.g. while a KDF is running).
 */
import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const stack: symbol[] = [];
let savedOverflow = "";

export interface ModalProps {
  children: React.ReactNode;
  onClose?: () => void;
  /** Accessible name: id of the visible title, or a plain label. */
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  /** "alertdialog" for destructive confirmations. */
  role?: "dialog" | "alertdialog";
  /** Tailwind classes added to the panel, e.g. "max-w-sm". */
  className?: string;
  style?: React.CSSProperties;
  dismissable?: boolean;
  closeOnBackdrop?: boolean;
  /** Render the panel as a <form> with this submit handler. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function Modal({
  children,
  onClose,
  labelledBy,
  label,
  describedBy,
  role = "dialog",
  className = "",
  style,
  dismissable = true,
  closeOnBackdrop = true,
  onSubmit,
}: ModalProps) {
  const panelRef = useFocusTrap<HTMLElement>(true);
  const token = useRef(Symbol("modal")).current;
  const canClose = dismissable && !!onClose;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Capture the page's own overflow only when the FIRST modal opens; nested
    // modals may unmount in any order, and only the last one out restores it.
    if (stack.length === 0) savedOverflow = document.body.style.overflow;
    stack.push(token);
    document.body.style.overflow = "hidden";
    return () => {
      const i = stack.lastIndexOf(token);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = savedOverflow;
    };
  }, [token]);

  useEffect(() => {
    if (!canClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || stack[stack.length - 1] !== token) return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, token]);

  const panelProps = {
    ref: panelRef as React.Ref<never>,
    className: `sv-modal ${className}`.trim(),
    style,
    role,
    "aria-modal": true,
    "aria-labelledby": labelledBy,
    "aria-label": labelledBy ? undefined : label,
    "aria-describedby": describedBy,
    tabIndex: -1,
  } as const;

  return (
    <div
      className="sv-modal-backdrop"
      onMouseDown={(e) => {
        if (canClose && closeOnBackdrop && e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      {onSubmit ? (
        <form {...panelProps} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...panelProps}>{children}</div>
      )}
    </div>
  );
}

export default Modal;
