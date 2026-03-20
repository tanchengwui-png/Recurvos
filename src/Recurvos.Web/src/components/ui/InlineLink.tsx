import type { AnchorHTMLAttributes, ReactNode } from "react";

export function InlineLink({
  children,
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
}) {
  return (
    <a className={`inline-link ${className}`.trim()} {...props}>
      {children}
    </a>
  );
}
