/**
 * @file Button.tsx
 * The sv-btn-* variants as a component, with a built-in busy state
 * (aria-busy + disabled) so async actions can't be double-submitted.
 */
import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "sv-btn-primary",
  secondary: "sv-btn-secondary",
  ghost: "sv-btn-ghost",
  danger: "sv-btn-danger",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  /** Text shown while busy; defaults to the children. */
  busyLabel?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    busy = false,
    busyLabel,
    icon,
    className = "",
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${VARIANT[variant]} inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      )}
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
});
