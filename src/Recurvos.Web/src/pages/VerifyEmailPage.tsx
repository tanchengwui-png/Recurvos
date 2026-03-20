import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { setAuth } from "../lib/auth";
import type { AuthResponse } from "../types";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");

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

  return (
    <AuthLayout title="Verify email" subtitle="Activate your account before you start billing">
      <div className="form-stack">
        {status === "verifying" ? <HelperText>Verifying your email now...</HelperText> : null}
        {status === "success" ? <HelperText>Your email is verified. Taking you into your workspace...</HelperText> : null}
        {status === "failed" ? <HelperText tone="error">{error}</HelperText> : null}
        {status === "failed" ? (
          <div className="button-stack">
            <Button type="button" onClick={() => navigate("/login")}>
              Go to sign in
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
