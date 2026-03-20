import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`text-input ${className}`.trim()} {...props} />;
});
