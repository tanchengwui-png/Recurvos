import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { InlineLink } from "../components/ui/InlineLink";
import { TextInput } from "../components/ui/TextInput";
import { api } from "../lib/api";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send password reset email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Forgot password?" subtitle="We will send a secure password reset link to your work email.">
      {submitted ? (
        <div className="form-stack">
          <div className="selected-package-banner">
            <p className="eyebrow">Check your email</p>
            <strong>{email}</strong>
            <p className="muted">If an account exists for this email, a password reset link has been sent.</p>
          </div>
          <div className="button-stack">
            <Button type="button" onClick={() => navigate("/login")}>
              Back to sign in
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSubmitted(false)}>
              Try another email
            </Button>
          </div>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <FormLabel htmlFor="email">
            Work email
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormLabel>

          {error ? <HelperText tone="error">{error}</HelperText> : <HelperText>We will email you a secure link if the account exists.</HelperText>}

          <div className="button-stack">
            <Button type="submit" disabled={isSubmitting || !email}>
              {isSubmitting ? "Sending link..." : "Send reset link"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/login")}>
              Back to sign in
            </Button>
          </div>

          <p className="auth-meta centered">
            Need help? <InlineLink href="/support">Contact support</InlineLink>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
