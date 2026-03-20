import { useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { DataCard } from "../components/DataCard";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";

export function PlatformDocumentPreviewPage() {
  const [invoicePreviewForm, setInvoicePreviewForm] = useState({
    customerName: "Acme Customer",
    customerEmail: "accounts@acme.test",
    customerAddress: "Kuala Lumpur",
    invoiceNumber: "PREVIEW-001",
    dueDateUtc: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    isTaxEnabled: false,
    taxName: "SST",
    taxRate: "6.00",
    taxRegistrationNo: "",
    lineItems: [{ description: "Starter Plan", quantity: "1", unitAmount: "99.00" }],
  });
  const [receiptPreviewForm, setReceiptPreviewForm] = useState({
    customerName: "Acme Customer",
    description: "Starter Plan",
    receiptNumber: "RCT-PREVIEW-001",
    invoiceNumber: "INV-PREVIEW-001",
    amount: "99.00",
    paymentMethod: "Manual",
    paidAtUtc: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function downloadInvoicePreview() {
    const file = await api.postDownload("/platform/invoice-preview/download", {
      customerName: invoicePreviewForm.customerName,
      customerEmail: invoicePreviewForm.customerEmail || null,
      customerAddress: invoicePreviewForm.customerAddress || null,
      invoiceNumber: invoicePreviewForm.invoiceNumber || null,
      dueDateUtc: new Date(invoicePreviewForm.dueDateUtc).toISOString(),
      isTaxEnabled: invoicePreviewForm.isTaxEnabled,
      taxName: invoicePreviewForm.isTaxEnabled ? invoicePreviewForm.taxName || "SST" : null,
      taxRate: invoicePreviewForm.isTaxEnabled ? Number(invoicePreviewForm.taxRate) : null,
      taxRegistrationNo: invoicePreviewForm.isTaxEnabled ? invoicePreviewForm.taxRegistrationNo || null : null,
      lineItems: invoicePreviewForm.lineItems.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitAmount: Number(line.unitAmount),
      })),
    });

    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName ?? "invoice-preview.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadReceiptPreview() {
    const file = await api.postDownload("/platform/receipt-preview/download", {
      customerName: receiptPreviewForm.customerName,
      description: receiptPreviewForm.description,
      receiptNumber: receiptPreviewForm.receiptNumber || null,
      invoiceNumber: receiptPreviewForm.invoiceNumber || null,
      amount: Number(receiptPreviewForm.amount),
      currency: "MYR",
      paymentMethod: receiptPreviewForm.paymentMethod,
      paidAtUtc: new Date(receiptPreviewForm.paidAtUtc).toISOString(),
    });

    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName ?? "receipt-preview.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Document preview</p>
          <h2>Preview invoice and receipt templates</h2>
          <p className="muted">Test the platform document layout without saving any invoice or payment record. Use these sample values to check spacing, numbering, branding, and wording before customers ever see the final PDF.</p>
        </div>
      </header>

      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card platform-preview-hero-card">
        <div className="metrics-grid">
          <DataCard title="Preview tools" value="2" />
          <DataCard title="Save to database" value="No" />
          <DataCard title="Default currency" value="MYR" />
          <DataCard title="Best for" value="Template QA" />
        </div>
      </section>

      <div className="platform-preview-grid">
        <section className="card settings-form-card platform-preview-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Invoice preview</p>
              <h3 className="section-title">Invoice PDF</h3>
              <p className="muted form-intro">Review the invoice layout, totals, due date, and line items as a customer-facing PDF.</p>
            </div>
            <div className="platform-preview-card-meta">
              <span className="status-pill status-pill-active">No save</span>
              <strong>{invoicePreviewForm.invoiceNumber || "Auto number"}</strong>
            </div>
          </div>

            <div className="platform-preview-highlight-grid">
              <div className="platform-preview-highlight">
                <span>Customer</span>
                <strong>{invoicePreviewForm.customerName || "Not set"}</strong>
              </div>
              <div className="platform-preview-highlight">
                <span>Due date</span>
                <strong>{invoicePreviewForm.dueDateUtc || "Not set"}</strong>
              </div>
              <div className="platform-preview-highlight">
                <span>Tax mode</span>
                <strong>{invoicePreviewForm.isTaxEnabled ? `${invoicePreviewForm.taxName || "SST"} ${invoicePreviewForm.taxRate || "0"}%` : "No tax"}</strong>
              </div>
            </div>

          <div className="form-stack">
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Customer name
                <input className="text-input" value={invoicePreviewForm.customerName} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, customerName: event.target.value }))} />
              </label>
              <label className="form-label">
                Customer email
                <input className="text-input" value={invoicePreviewForm.customerEmail} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, customerEmail: event.target.value }))} />
              </label>
            </div>

            <label className="form-label">
              Customer address
              <input className="text-input" value={invoicePreviewForm.customerAddress} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, customerAddress: event.target.value }))} />
            </label>

            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Preview invoice number
                <input className="text-input" value={invoicePreviewForm.invoiceNumber} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
              </label>
              <label className="form-label">
                Due date
                <input className="text-input" type="date" value={invoicePreviewForm.dueDateUtc} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, dueDateUtc: event.target.value }))} />
              </label>
            </div>

            <div className="settings-tax-card">
              <label className="checkbox-input">
                <input
                  type="checkbox"
                  checked={invoicePreviewForm.isTaxEnabled}
                  onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, isTaxEnabled: event.target.checked }))}
                />
                <span>Enable SST for preview</span>
              </label>
              {invoicePreviewForm.isTaxEnabled ? (
                <div className="form-stack">
                  <div className="inline-fields settings-inline-fields-wide">
                    <label className="form-label">
                      Tax name
                      <input className="text-input" value={invoicePreviewForm.taxName} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, taxName: event.target.value }))} />
                    </label>
                    <label className="form-label">
                      Tax rate (%)
                      <input className="text-input" type="number" min="0.01" max="100" step="0.01" value={invoicePreviewForm.taxRate} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, taxRate: event.target.value }))} />
                    </label>
                  </div>
                  <label className="form-label">
                    SST registration no
                    <input className="text-input" value={invoicePreviewForm.taxRegistrationNo} onChange={(event) => setInvoicePreviewForm((current) => ({ ...current, taxRegistrationNo: event.target.value }))} />
                  </label>
                </div>
              ) : (
                <p className="muted">Tax section will be hidden completely in the preview invoice.</p>
              )}
            </div>

            <div className="platform-preview-line-items">
              <div className="platform-preview-line-items-header">
                <div>
                  <p className="eyebrow">Line items</p>
                  <strong>{invoicePreviewForm.lineItems.length} item{invoicePreviewForm.lineItems.length === 1 ? "" : "s"}</strong>
                </div>
              </div>

              {invoicePreviewForm.lineItems.map((line, index) => (
                <div key={index} className="platform-preview-line-item-row">
                  <div className="platform-preview-line-item-index">{index + 1}</div>
                  <div className="inline-fields settings-inline-fields-wide">
                    <label className="form-label">
                      Description
                      <input
                        className="text-input"
                        value={line.description}
                        onChange={(event) => setInvoicePreviewForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item),
                        }))}
                      />
                    </label>
                    <label className="form-label">
                      Qty
                      <input
                        className="text-input"
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(event) => setInvoicePreviewForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item),
                        }))}
                      />
                    </label>
                    <label className="form-label">
                      Unit amount
                      <input
                        className="text-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitAmount}
                        onChange={(event) => setInvoicePreviewForm((current) => ({
                          ...current,
                          lineItems: current.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, unitAmount: event.target.value } : item),
                        }))}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="button-stack platform-preview-action-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setInvoicePreviewForm((current) => ({
                  ...current,
                  lineItems: [...current.lineItems, { description: "", quantity: "1", unitAmount: "" }],
                }))}
              >
                Add line
              </button>
              {invoicePreviewForm.lineItems.length > 1 ? (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setInvoicePreviewForm((current) => ({
                    ...current,
                    lineItems: current.lineItems.slice(0, -1),
                  }))}
                >
                  Remove line
                </button>
              ) : null}
              <button
                type="button"
                className="button button-primary"
                onClick={() => setConfirmState({
                  title: "Generate preview PDF",
                  description: "Generate and download a preview invoice PDF without saving an invoice record?",
                  action: async () => {
                    try {
                      await downloadInvoicePreview();
                      setMessage("Preview PDF generated. No invoice record was saved.");
                      setError("");
                      setConfirmState(null);
                    } catch (previewError) {
                      setError(previewError instanceof Error ? previewError.message : "Unable to generate invoice preview.");
                      setMessage("");
                      setConfirmState(null);
                    }
                  },
                })}
              >
                Generate Invoice PDF
              </button>
            </div>
          </div>
        </section>

        <section className="card settings-form-card platform-preview-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Receipt preview</p>
              <h3 className="section-title">Receipt PDF</h3>
              <p className="muted form-intro">Review the receipt layout, payment wording, and document family styling before it goes live.</p>
            </div>
            <div className="platform-preview-card-meta">
              <span className="status-pill status-pill-active">No save</span>
              <strong>{receiptPreviewForm.receiptNumber || "Auto number"}</strong>
            </div>
          </div>

          <div className="platform-preview-highlight-grid">
            <div className="platform-preview-highlight">
              <span>Customer</span>
              <strong>{receiptPreviewForm.customerName || "Not set"}</strong>
            </div>
            <div className="platform-preview-highlight">
              <span>Paid date</span>
              <strong>{receiptPreviewForm.paidAtUtc || "Not set"}</strong>
            </div>
          </div>

          <div className="form-stack">
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Customer name
                <input className="text-input" value={receiptPreviewForm.customerName} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, customerName: event.target.value }))} />
              </label>
              <label className="form-label">
                Description
                <input className="text-input" value={receiptPreviewForm.description} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
            </div>

            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Receipt number
                <input className="text-input" value={receiptPreviewForm.receiptNumber} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, receiptNumber: event.target.value }))} />
              </label>
              <label className="form-label">
                Invoice number
                <input className="text-input" value={receiptPreviewForm.invoiceNumber} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
              </label>
            </div>

            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Amount
                <input className="text-input" type="number" min="0.01" step="0.01" value={receiptPreviewForm.amount} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, amount: event.target.value }))} />
              </label>
              <label className="form-label">
                Payment method
                <input className="text-input" value={receiptPreviewForm.paymentMethod} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, paymentMethod: event.target.value }))} />
              </label>
            </div>

            <label className="form-label">
              Paid date
              <input className="text-input" type="date" value={receiptPreviewForm.paidAtUtc} onChange={(event) => setReceiptPreviewForm((current) => ({ ...current, paidAtUtc: event.target.value }))} />
            </label>

            <div className="button-stack platform-preview-action-row">
              <button
                type="button"
                className="button button-primary"
                onClick={() => setConfirmState({
                  title: "Generate preview receipt PDF",
                  description: "Generate and download a preview receipt PDF without saving a payment or receipt record?",
                  action: async () => {
                    try {
                      await downloadReceiptPreview();
                      setMessage("Preview receipt PDF generated. No payment or receipt record was saved.");
                      setError("");
                      setConfirmState(null);
                    } catch (previewError) {
                      setError(previewError instanceof Error ? previewError.message : "Unable to generate receipt preview.");
                      setMessage("");
                      setConfirmState(null);
                    }
                  },
                })}
              >
                Generate Receipt PDF
              </button>
            </div>
          </div>
        </section>
      </div>

      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
