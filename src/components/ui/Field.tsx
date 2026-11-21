/**
 * @file Field.tsx
 * Label + control + hint + error with the ids wired for screen readers
 * (htmlFor, aria-describedby, aria-invalid). The control is passed as a
 * render prop so any input/select/textarea works.
 */
import React, { useId } from "react";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Field({
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label className="sv-label" htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-(--danger)">
            {" "}
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p id={errorId} className="sv-error" role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="sv-hint mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
