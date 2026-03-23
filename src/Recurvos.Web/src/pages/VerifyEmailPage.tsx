import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { api } from "../lib/api";
import { setAuth } from "../lib/auth";
import type { AuthResponse } from "../types";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("failed");
      setError("This verification link is missing a token.");
      return;
    }

    void api.post<AuthResponse>("/auth/verify-email", { token })
      .then((response) => {
        setAuth(response);
        setStatus("success");
        window.setTimeout(() => navigate("/"), 1200);
      })
      .catch((err) => {
        setStatus("failed");
        setError(err instanceof Error ? err.message : "Unable to verify email.");
      });
  }, [navigate, searchParams]);

  async function resendVerification() {
    setIsResending(true);
    setError("");
    setResent(false);

    try {
      await api.post("/auth/resend-verification", { email });
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification email.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthLayout title="Verify email" subtitle="Activate your account before you start billing">
      <div className="form-stack">
        {status === "verifying" ? <HelperText>Verifying your email now...</HelperText> : null}
        {status === "success" ? <HelperText>Your email is verified. Taking you into your workspace...</HelperText> : null}
        {status === "failed" ? <HelperText tone="error">{error}</HelperText> : null}
        {status === "failed" ? (
          <FormLabel htmlFor="verificationEmail">
            Work email
            <TextInput
              id="verificationEmail"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormLabel>
        ) : null}
        {status === "failed" && resent ? <HelperText>Verification email sent. Please check your inbox, and if needed, your junk or spam folder.</HelperText> : null}
        {status === "failed" ? (
          <div className="button-stack">
            <Button type="button" onClick={() => navigate("/login")}>
              Go to sign in
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isResending || !email}
              onClick={() => {
                void resendVerification();
              }}
            >
              {isResending ? "Sending..." : "Resend verification email"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/onboarding")}>
              Create account again
            </Button>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
}
