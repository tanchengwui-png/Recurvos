import type { ReactNode } from "react";

type StandardFormLayoutProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The shared, full-width surface for create and edit routes. It is deliberately
 * presentation-only so adopting it cannot alter a page's data or submit flow.
 */
export function StandardFormLayout({ children, className = "" }: StandardFormLayoutProps) {
  return <main className={`standard-form-layout ${className}`.trim()}>{children}</main>;
}
