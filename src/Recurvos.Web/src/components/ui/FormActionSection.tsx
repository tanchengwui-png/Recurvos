import type { ReactNode } from "react";
import { StickyFormActions } from "./StickyFormActions";

type FormActionSectionProps = {
  children: ReactNode;
  className?: string;
};

/** Backward-compatible form action entry point backed by StickyFormActions. */
export function FormActionSection({ children, className = "" }: FormActionSectionProps) {
  return <StickyFormActions className={`form-action-section ${className}`}>{children}</StickyFormActions>;
}
