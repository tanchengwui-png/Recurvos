import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`button ${variant === "primary" ? "button-primary" : "button-secondary"} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
