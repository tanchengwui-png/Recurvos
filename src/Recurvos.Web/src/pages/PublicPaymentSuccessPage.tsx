import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { HelperText } from "../components/ui/HelperText";
import { API_BASE_URL, buildApiUrl } from "../lib/api";
import type { PublicPaymentStatus } from "../types";

export function PublicPaymentSuccessPage() {
  const routeParams = useParams<{ invoiceId?: string }>();
  const [title, setTitle] = useState("Payment status");
  const [subtitle, setSubtitle] = useState("We are checking the latest payment result from the payment gateway.");
  const [message, setMessage] = useState("Checking your payment status...");
  const [error, setError] = useState("");

  useEffect(() => {
    const rawSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const combinedQuery = [rawSearch, rawHash]
      .filter(Boolean)
      .join("&");
    const params = new URLSearchParams(combinedQuery);
    const paymentId =
      params.get("billplz[id]") ??
      params.get("id") ??
      params.get("billplz_id");
    const invoiceId = params.get("invoiceId") ?? routeParams.invoiceId ?? null;
    const paid =
      params.get("billplz[paid]") ??
      params.get("paid");

    window.history.replaceState({}, document.title, window.location.pathname);

    if (!paymentId && !invoiceId && !paid && !combinedQuery) {
      setTitle("Payment status");
      setSubtitle("We could not read a valid return from the payment gateway.");
      setMessage("");
      setError("This payment return link is invalid.");
      return;
    }

    if (!paymentId && !invoiceId) {
      setTitle("Payment status");
      setSubtitle("We could not read a valid payment reference from the gateway return.");
      setMessage("");
      setError("We could not read the payment reference from the gateway return.");
      return;
    }

    const externalPaymentId = paymentId;
    const invoiceLookupId = invoiceId;

    if (paid === "false") {
      setTitle("Payment not completed");
      setSubtitle("The payment gateway returned without a completed payment.");
      setMessage("");
      setError("Your payment was not completed. Please return to the invoice and try again.");
      return;
    }

    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    async function fetchStatus() {
      const search = externalPaymentId
        ? `externalPaymentId=${encodeURIComponent(externalPaymentId)}`
        : `invoiceId=${encodeURIComponent(invoiceLookupId ?? "")}`;
      const response = await fetch(buildApiUrl(`/public/payments/status?${search}`));
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error("We couldn't check the payment status right now.");
      }

      return response.json() as Promise<PublicPaymentStatus>;
    }

    async function confirmAndTrackPayment() {
      try {
        const hasPositiveGatewayReturn = paid === "true";

        if (paid === "true") {
          setTitle("Payment received");
          setSubtitle("We received a successful return from the payment gateway and are verifying it now.");
          setError("");
          setMessage("Payment received. We are verifying it now...");
          await fetch(`${API_BASE_URL}/webhooks/billplz/complete?${params.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
        }

        for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
          const status = await fetchStatus();
          if (status?.isPaid) {
            setTitle("Payment confirmed");
            setSubtitle("Your payment has been confirmed successfully.");
            setError("");
            setMessage(`Payment confirmed for invoice ${status.invoiceNumber}. You may now close this page.`);
            return;
          }

          const paymentStatus = (status?.paymentStatus ?? "").toLowerCase();
          if (paymentStatus === "failed" || paymentStatus === "reversed") {
            setTitle("Payment not completed");
            setSubtitle("The latest payment attempt was not completed successfully.");
            setError(status?.invoiceNumber
              ? `Payment was not completed for invoice ${status.invoiceNumber}. Please return to the invoice and try again.`
              : "Payment was not completed. Please return to the invoice and try again.");
            setMessage("");
            return;
          }

          if (hasPositiveGatewayReturn) {
            setTitle("Payment received");
            setSubtitle("We are waiting for the payment confirmation to finish syncing.");
            if (status?.invoiceNumber) {
              setMessage(`Payment received for invoice ${status.invoiceNumber}. We are still verifying it...`);
            } else {
              setMessage("Payment received. We are still verifying it...");
            }
          } else {
            setTitle("Payment status pending");
            setSubtitle("The payment gateway has not confirmed a successful payment yet.");
            if (status?.invoiceNumber) {
              setMessage(`We are still waiting for the final payment result for invoice ${status.invoiceNumber}.`);
            } else {
              setMessage("We are still waiting for the final payment result.");
            }
          }

          if (attempt < 7) {
            await delay(2500);
          }
        }

        if (!cancelled) {
          setTitle(hasPositiveGatewayReturn ? "Payment received" : "Payment status pending");
          setSubtitle(hasPositiveGatewayReturn
            ? "The payment was received, but final verification is still in progress."
            : "The payment gateway has not confirmed a successful payment yet.");
          setError("");
          setMessage(hasPositiveGatewayReturn
            ? "Payment received. Verification is still in progress. You may close this page and check again shortly."
            : "We are still waiting for the final payment result. Please return to the invoice and try again if the payment did not go through.");
        }
      } catch (confirmError) {
        if (cancelled) {
          return;
        }

        setTitle("Payment status unavailable");
        setSubtitle("We could not verify the latest payment result right now.");
        setMessage("");
        setError(confirmError instanceof Error ? confirmError.message : "We couldn't verify your payment right now. Please check again shortly.");
      }
    }

    void confirmAndTrackPayment();

    return () => {
      cancelled = true;
    };
  }, [routeParams.invoiceId]);

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      compactTrust
    >
      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}
    </AuthLayout>
  );
}
