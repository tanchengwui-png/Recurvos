import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { PasswordInput } from "../components/ui/PasswordInput";
import { api } from "../lib/api";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This password reset link is invalid or incomplete.");
    }
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("This password reset link is invalid or incomplete.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await api.post("/auth/reset-password", { token, newPassword: password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password for your Recurvo account.">
      {success ? (
        <div className="form-stack">
          <div className="selected-package-banner">
            <p className="eyebrow">Password updated</p>
            <strong>Your password has been reset</strong>
            <p className="muted">You can now sign in with your new password.</p>
          </div>
          <div className="button-stack">
            <Button type="button" onClick={() => navigate("/login")}>
              Go to sign in
            </Button>
          </div>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <FormLabel htmlFor="password">
            New password
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="Create a new password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormLabel>

          <FormLabel htmlFor="confirmPassword">
            Confirm new password
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </FormLabel>

          {error ? <HelperText tone="error">{error}</HelperText> : <HelperText>Use at least 8 characters.</HelperText>}

          <div className="button-stack">
            <Button type="submit" disabled={isSubmitting || !token || password.length < 8 || confirmPassword.length < 8}>
              {isSubmitting ? "Updating password..." : "Reset password"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/login")}>
              Back to sign in
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
