import type { LabelHTMLAttributes, ReactNode } from "react";

export function FormLabel({
  children,
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
}) {
  return (
    <label className={`form-label ${className}`.trim()} {...props}>
      {children}
    </label>
  );
}
