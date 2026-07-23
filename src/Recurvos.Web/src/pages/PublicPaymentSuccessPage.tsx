import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { ResponseToast } from "../components/ui/Toast";
import { API_BASE_URL, buildApiUrl } from "../lib/api";
import type { PublicPaymentStatus } from "../types";

export function PublicPaymentSuccessPage() {
  const routeParams = useParams<{ invoiceId?: string }>();
  const [title, setTitle] = useState("Payment status");
  const [subtitle, setSubtitle] = useState("We are checking the latest payment result from the payment gateway.");
  const [message, setMessage] = useState("Checking your payment status...");
  const [error, setError] = useState("");
  const [tips, setTips] = useState<string[]>([]);

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
      params.get("session_id") ??
      params.get("sessionId") ??
      params.get("billplz[id]") ??
      params.get("id") ??
      params.get("billplz_id");
    const invoiceId = params.get("invoiceId") ?? routeParams.invoiceId ?? null;
    const stripeStatus = params.get("stripe_status");
    const paid =
      params.get("billplz[paid]") ??
      params.get("paid");

    const recoveryTips = [
      "Wait a moment for the payment gateway to finish syncing and then refresh this page once.",
      "If the payment is still unclear, return to the invoice link from the business and check the latest status there.",
      "Do not pay again unless the business confirms this attempt was not received.",
    ];

    window.history.replaceState({}, document.title, window.location.pathname);

    if (!paymentId && !invoiceId && !paid && !combinedQuery) {
      setTitle("Payment status");
      setSubtitle("We could not read a valid return from the payment gateway.");
      setMessage("");
      setError("This payment return link is invalid.");
      setTips([]);
      return;
    }

    if (!paymentId) {
      setTitle("Payment received, verification pending");
      setSubtitle("The gateway returned without a payment reference we can safely verify from this page.");
      setMessage("");
      setError("We could not safely verify this payment from the return link alone.");
      setTips(recoveryTips);
      return;
    }

    const externalPaymentId = paymentId;
    setTips([]);

    if (paid === "false" || stripeStatus === "cancelled") {
      setTitle("Payment not completed");
      setSubtitle("The payment gateway returned without a completed payment.");
      setMessage("");
      setError("Your payment was not completed. Please return to the invoice and try again.");
      setTips([]);
      return;
    }

    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    async function fetchStatus() {
      const response = await fetch(buildApiUrl(`/public/payments/status?externalPaymentId=${encodeURIComponent(externalPaymentId)}`));
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
        const hasPositiveStripeReturn = stripeStatus === "success" && Boolean(externalPaymentId);

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

        if (hasPositiveStripeReturn) {
          setTitle("Payment received");
          setSubtitle("We received a successful return from Stripe and are verifying it now.");
          setError("");
          setMessage("Payment received. We are verifying it now...");
          await fetch(`${API_BASE_URL}/webhooks/stripe/complete?${params.toString()}`, {
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
            setTips([]);
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
            setTips([]);
            setMessage("");
            return;
          }

          if (hasPositiveGatewayReturn || hasPositiveStripeReturn) {
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
          setTitle(hasPositiveGatewayReturn || hasPositiveStripeReturn ? "Payment received" : "Payment status pending");
          setSubtitle(hasPositiveGatewayReturn || hasPositiveStripeReturn
            ? "The payment was received, but final verification is still in progress."
            : "The payment gateway has not confirmed a successful payment yet.");
          setError("");
          setTips(hasPositiveGatewayReturn || hasPositiveStripeReturn ? recoveryTips : []);
          setMessage(hasPositiveGatewayReturn || hasPositiveStripeReturn
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
        setTips(recoveryTips);
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
      <ResponseToast message={message} tone="success" />
      <ResponseToast message={error} tone="error" />
      {tips.length > 0 ? (
        <div className="public-payment-guidance">
          {tips.map((tip) => (
            <div key={tip} className="public-payment-guidance-item">
              <span className="badge">Next</span>
              <p>{tip}</p>
            </div>
          ))}
        </div>
      ) : null}
    </AuthLayout>
  );
}
