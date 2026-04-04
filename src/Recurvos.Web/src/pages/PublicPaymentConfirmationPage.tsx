import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { PublicPaymentConfirmationInvoice } from "../types";

export function PublicPaymentConfirmationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [invoice, setInvoice] = useState<PublicPaymentConfirmationInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "proof">("details");
  const [form, setForm] = useState({
    payerName: "",
    amount: "",
    paidAtUtc: new Date().toISOString().slice(0, 10),
    transactionReference: "",
    notes: "",
    proofFile: null as File | null,
  });
  const dueDateLabel = invoice
    ? new Date(invoice.dueDateUtc).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const amountLabel = invoice ? formatCurrency(invoice.balanceAmount, invoice.currency) : "";
  const proofSizeLabel = invoice ? formatUploadSizeLabel(invoice.proofUploadMaxBytes) : "";

  useEffect(() => {
    if (!token) {
      setError("This payment confirmation link is invalid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    api.get<PublicPaymentConfirmationInvoice>(`/public/payment-confirmations?token=${encodeURIComponent(token)}`)
      .then((result) => {
        setInvoice(result);
        setForm((current) => ({
          ...current,
          amount: result.balanceAmount > 0 ? String(result.balanceAmount) : current.amount,
        }));
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Unable to load this invoice.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError("This payment confirmation link is invalid.");
      return;
    }

    if (invoice && form.proofFile && form.proofFile.size > invoice.proofUploadMaxBytes) {
      setError(`Proof upload must be ${formatUploadSizeLabel(invoice.proofUploadMaxBytes)} or smaller.`);
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("payerName", form.payerName);
      formData.append("amount", invoice ? String(invoice.balanceAmount) : form.amount);
      formData.append("paidAtUtc", new Date(form.paidAtUtc).toISOString());
      formData.append("transactionReference", form.transactionReference);
      formData.append("notes", form.notes);
      if (form.proofFile) {
        formData.append("proofFile", form.proofFile);
      }

      await api.postForm("/public/payment-confirmations", formData);
      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit your confirmation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Confirm your payment"
      subtitle="Tell the business you have already paid by bank transfer or other manual method."
      compactTrust
    >
      {loading ? <HelperText>Loading invoice details...</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {success ? (
        <HelperText>
          Your payment confirmation has been submitted. The business will review it and update the invoice once confirmed.
        </HelperText>
      ) : null}
      {!loading && invoice && !success ? (
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="public-payment-summary">
            <div className="card subtle-card public-payment-summary-card public-payment-summary-hero">
              <div>
                <p className="eyebrow">Invoice</p>
                <strong>{invoice.invoiceNumber}</strong>
                <p className="muted">{invoice.customerName}</p>
              </div>
              <div className="public-payment-summary-metrics">
                <div className="public-payment-summary-metric">
                  <span>Outstanding</span>
                  <strong>{amountLabel}</strong>
                </div>
                <div className="public-payment-summary-metric">
                  <span>Due date</span>
                  <strong>{dueDateLabel}</strong>
                </div>
              </div>
            </div>
            <div className="public-payment-inline-note">
              <p>
                Submit the full outstanding balance of <strong>{amountLabel}</strong>. Use the real payment date. Add proof if you have it.
              </p>
            </div>
            {invoice.paymentLinkUrl ? (
              <HelperText>
                Prefer automatic payment? Use the invoice payment link instead.
                {" "}
                <a href={invoice.paymentLinkUrl} className="inline-link" target="_blank" rel="noreferrer">Pay now</a>
              </HelperText>
            ) : null}
          </div>
          <div className="settings-subtab-strip" role="tablist" aria-label="Payment confirmation steps">
            <button type="button" className={`settings-subtab-button ${activeTab === "details" ? "settings-subtab-button-active" : ""}`} onClick={() => setActiveTab("details")}>
              1. Details
            </button>
            <button type="button" className={`settings-subtab-button ${activeTab === "proof" ? "settings-subtab-button-active" : ""}`} onClick={() => setActiveTab("proof")}>
              2. Proof {form.proofFile ? "(selected)" : "(optional)"}
            </button>
          </div>
          {activeTab === "details" ? (
            <div className="card subtle-card public-payment-panel">
              <p className="eyebrow">Payment details</p>
              <div className="public-payment-fields">
                <FormLabel htmlFor="payment-confirmation-payer">
                  Your name
                  <TextInput
                    id="payment-confirmation-payer"
                    value={form.payerName}
                    onChange={(event) => setForm((current) => ({ ...current, payerName: event.target.value }))}
                  />
                </FormLabel>
                <FormLabel htmlFor="payment-confirmation-amount">
                  Amount paid
                  <TextInput
                    id="payment-confirmation-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    readOnly
                  />
                </FormLabel>
                <FormLabel htmlFor="payment-confirmation-date">
                  Paid date
                  <TextInput
                    id="payment-confirmation-date"
                    type="date"
                    value={form.paidAtUtc}
                    onChange={(event) => setForm((current) => ({ ...current, paidAtUtc: event.target.value }))}
                  />
                </FormLabel>
                <FormLabel htmlFor="payment-confirmation-reference">
                  Transaction reference
                  <TextInput
                    id="payment-confirmation-reference"
                    value={form.transactionReference}
                    onChange={(event) => setForm((current) => ({ ...current, transactionReference: event.target.value }))}
                  />
                </FormLabel>
                <FormLabel htmlFor="payment-confirmation-notes" className="public-payment-field-wide">
                  Notes
                  <TextInput
                    id="payment-confirmation-notes"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </FormLabel>
              </div>
            </div>
          ) : null}
          {activeTab === "proof" ? (
            <div className="card subtle-card public-payment-panel">
              <p className="eyebrow">Proof upload</p>
              <label className="form-label">
                Proof upload
                <input
                  className="text-input"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file || !invoice) {
                      setForm((current) => ({ ...current, proofFile: null }));
                      return;
                    }

                    void (async () => {
                      try {
                        const prepared = await prepareImageUpload(file, {
                          autoCompressUploads: invoice.autoCompressUploads,
                          uploadMaxBytes: invoice.proofUploadMaxBytes,
                          uploadImageMaxDimension: invoice.uploadImageMaxDimension,
                          uploadImageQuality: invoice.uploadImageQuality,
                        });
                        setError("");
                        setForm((current) => ({ ...current, proofFile: prepared }));
                      } catch (uploadError) {
                        setError(uploadError instanceof Error ? uploadError.message : `Proof upload must be ${formatUploadSizeLabel(invoice.proofUploadMaxBytes)} or smaller.`);
                        event.target.value = "";
                        setForm((current) => ({ ...current, proofFile: null }));
                      }
                    })();
                  }}
                />
              </label>
              <HelperText>{invoice ? `Optional. PNG, JPG, JPEG, and WEBP up to ${proofSizeLabel} are allowed.${invoice.autoCompressUploads ? " Large images are compressed automatically." : ""}` : "Proof is optional."}</HelperText>
              {form.proofFile ? <HelperText>{`Selected file: ${form.proofFile.name}`}</HelperText> : null}
            </div>
          ) : null}
          <div className="public-payment-actions">
            {activeTab === "details" ? (
              <Button type="button" variant="secondary" onClick={() => setActiveTab("proof")}>
                Continue to proof
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setActiveTab("details")}>
                Back to details
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit payment confirmation"}
            </Button>
          </div>
        </form>
      ) : null}
    </AuthLayout>
  );
}
