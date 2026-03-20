import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Button } from "./Button";

export function PasswordInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`password-field ${className}`.trim()}>
      <input className="text-input password-input" type={visible ? "text" : "password"} {...props} />
      <Button type="button" variant="secondary" className="password-toggle" onClick={() => setVisible((current) => !current)}>
        {visible ? "Hide" : "Show"}
      </Button>
    </div>
  );
}
