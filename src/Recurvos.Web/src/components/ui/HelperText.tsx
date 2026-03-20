import type { ReactNode } from "react";

export function HelperText({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "error" }) {
  return <p className={tone === "error" ? "helper-text helper-text-error" : "helper-text"}>{children}</p>;
}
