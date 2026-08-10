import type { ReactNode } from "react";

type StickyFormActionsProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Shared visual footer for create, edit, and wizard flows. Button handlers and
 * labels remain owned by the calling page; this component owns only the action
 * surface and its responsive layout.
 */
export function StickyFormActions({ children, className = "" }: StickyFormActionsProps) {
  return <footer className={`sticky-form-actions ${className}`.trim()}>{children}</footer>;
}
