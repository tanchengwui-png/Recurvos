import type { ReactNode } from "react";

type FormPageBodyProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Keeps a form's field content and action footer as sibling regions.
 * The shared stylesheet owns the gap between them so it cannot depend on
 * whether the final field group is visible or expanded.
 */
export function FormPageBody({ children, className = "" }: FormPageBodyProps) {
  return <div className={`form-page-body ${className}`.trim()}>{children}</div>;
}
