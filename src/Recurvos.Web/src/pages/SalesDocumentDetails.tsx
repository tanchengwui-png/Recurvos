import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../lib/format";
import type { DeliveryOrder, SalesOrder, SalesQuotation } from "../types";

type SalesDocumentDetailsProps = {
  title: string;
  documentLabel: string;
  documentNumber: string;
  status: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhoneNumber?: string | null;
  documentDateUtc: string;
  currency: string;
  referenceNo?: string;
  notes?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: Array<{
    id: string;
    productNameSnapshot: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    deliveredQuantity?: number;
    invoicedQuantity?: number;
  }>;
  backPath: string;
  editPath?: string;
  sourceSummary?: string;
  actionButtons?: ReactNode;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function SalesDocumentDetails(props: SalesDocumentDetailsProps) {
  const navigate = useNavigate();
  const editPath = props.editPath;
  const printableHtml = useMemo(() => {
    const rows = props.lines.map((line) => `
      <tr>
        <td>${escapeHtml(line.productNameSnapshot || "-")}</td>
        <td>${escapeHtml(line.description)}</td>
        <td style="text-align:right">${line.quantity.toFixed(2).replace(/\.00$/, "")}</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(line.unitPrice, props.currency))}</td>
        <td style="text-align:right">${line.taxRate.toFixed(2).replace(/\.00$/, "")}%</td>
        <td style="text-align:right">${escapeHtml(formatCurrency(line.lineTotal, props.currency))}</td>
      </tr>
    `).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(props.documentNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1,h2,h3,p { margin: 0; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; gap:24px; }
    .meta { margin-top: 8px; color:#475569; }
    .summary { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px; margin:24px 0; }
    .card { border:1px solid #cbd5e1; border-radius:12px; padding:12px 14px; }
    .label { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; margin-bottom:6px; }
    .value { font-size:15px; font-weight:600; }
    table { width:100%; border-collapse:collapse; margin-top:20px; }
    th, td { border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:left; vertical-align:top; }
    th { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
    .totals { margin-top:24px; margin-left:auto; width:min(320px, 100%); }
    .totals-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e2e8f0; }
    .totals-row.total { font-weight:700; font-size:16px; }
    .notes { margin-top:24px; white-space:pre-wrap; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="label">${escapeHtml(props.title)}</p>
      <h1>${escapeHtml(props.documentNumber)}</h1>
      <p class="meta">Status: ${escapeHtml(props.status)}</p>
      <p class="meta">Date: ${new Date(props.documentDateUtc).toLocaleDateString()}</p>
      ${props.sourceSummary ? `<p class="meta">${escapeHtml(props.sourceSummary)}</p>` : ""}
    </div>
    <div>
      <p class="label">Contact</p>
      <h3>${escapeHtml(props.contactName)}</h3>
      ${props.contactEmail ? `<p class="meta">${escapeHtml(props.contactEmail)}</p>` : ""}
      ${props.contactPhoneNumber ? `<p class="meta">${escapeHtml(props.contactPhoneNumber)}</p>` : ""}
      ${props.referenceNo ? `<p class="meta">Reference: ${escapeHtml(props.referenceNo)}</p>` : ""}
    </div>
  </div>
  <div class="summary">
    <div class="card"><div class="label">${escapeHtml(props.documentLabel)}</div><div class="value">${escapeHtml(props.documentNumber)}</div></div>
    <div class="card"><div class="label">Currency</div><div class="value">${escapeHtml(props.currency)}</div></div>
    <div class="card"><div class="label">Total</div><div class="value">${escapeHtml(formatCurrency(props.totalAmount, props.currency))}</div></div>
  </div>
  <table>
    <thead><tr><th>Product</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(props.subtotal, props.currency))}</strong></div>
    <div class="totals-row"><span>Tax</span><strong>${escapeHtml(formatCurrency(props.taxAmount, props.currency))}</strong></div>
    <div class="totals-row total"><span>Total</span><strong>${escapeHtml(formatCurrency(props.totalAmount, props.currency))}</strong></div>
  </div>
  ${props.notes ? `<div class="notes"><p class="label">Notes</p><p>${escapeHtml(props.notes)}</p></div>` : ""}
</body>
</html>`;
  }, [props]);

  function handlePrint() {
    window.print();
  }

  function handleExportPdf() {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!popup) {
      return;
    }

    popup.document.open();
    popup.document.write(printableHtml);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{props.title}</h2>
          <p className="muted">{props.documentNumber}</p>
        </div>
        <div className="invoice-detail-inline-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate(props.backPath)}>Back</button>
          {props.actionButtons}
          {editPath ? <button type="button" className="button button-secondary" onClick={() => navigate(editPath)}>Edit</button> : null}
          <button type="button" className="button button-secondary" onClick={handlePrint}>Print</button>
          <button type="button" className="button button-primary" onClick={handleExportPdf}>Export PDF</button>
        </div>
      </header>

      <section className="card invoice-detail-panel">
        <div className="invoice-detail-hero">
          <div className="invoice-detail-hero-copy">
            <h3>{props.contactName}</h3>
            <p className="muted">{props.status}</p>
            {props.sourceSummary ? <p className="muted">{props.sourceSummary}</p> : null}
          </div>
          <div className="invoice-detail-summary">
            <div className="invoice-detail-stat"><p>{props.documentLabel}</p><strong>{props.documentNumber}</strong></div>
            <div className="invoice-detail-stat"><p>Date</p><strong>{new Date(props.documentDateUtc).toLocaleDateString()}</strong></div>
            <div className="invoice-detail-stat"><p>Total</p><strong>{formatCurrency(props.totalAmount, props.currency)}</strong></div>
          </div>
        </div>

        <div className="invoice-detail-layout">
          <div className="invoice-detail-main">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Lines</h3></div>
              <div className="table-scroll table-scroll-bounded">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Tax %</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.productNameSnapshot || "-"}</td>
                        <td>
                          <div className="invoice-detail-line-copy">
                            <strong>{line.description}</strong>
                            {typeof line.deliveredQuantity === "number" || typeof line.invoicedQuantity === "number" ? (
                              <span>
                                {typeof line.deliveredQuantity === "number" ? `Delivered: ${line.deliveredQuantity}` : ""}
                                {typeof line.deliveredQuantity === "number" && typeof line.invoicedQuantity === "number" ? " | " : ""}
                                {typeof line.invoicedQuantity === "number" ? `Invoiced: ${line.invoicedQuantity}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{line.quantity}</td>
                        <td>{formatCurrency(line.unitPrice, props.currency)}</td>
                        <td>{line.taxRate}%</td>
                        <td>{formatCurrency(line.lineTotal, props.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="invoice-detail-aside">
            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Document</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Status</span><strong>{props.status}</strong></div>
                <div className="invoice-detail-list-row"><span>Currency</span><strong>{props.currency}</strong></div>
                {props.referenceNo ? <div className="invoice-detail-list-row"><span>Reference</span><strong>{props.referenceNo}</strong></div> : null}
                <div className="invoice-detail-list-row"><span>Subtotal</span><strong>{formatCurrency(props.subtotal, props.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Tax</span><strong>{formatCurrency(props.taxAmount, props.currency)}</strong></div>
                <div className="invoice-detail-list-row"><span>Total</span><strong>{formatCurrency(props.totalAmount, props.currency)}</strong></div>
              </div>
            </div>

            <div className="invoice-detail-block">
              <div className="invoice-detail-block-header"><h3>Contact</h3></div>
              <div className="invoice-detail-list">
                <div className="invoice-detail-list-row"><span>Name</span><strong>{props.contactName}</strong></div>
                {props.contactEmail ? <div className="invoice-detail-list-row"><span>Email</span><strong>{props.contactEmail}</strong></div> : null}
                {props.contactPhoneNumber ? <div className="invoice-detail-list-row"><span>Phone</span><strong>{props.contactPhoneNumber}</strong></div> : null}
              </div>
            </div>

            {props.notes ? (
              <div className="invoice-detail-endcap">
                <p>Notes</p>
                <strong>{props.notes}</strong>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

export function mapQuotationDetails(document: SalesQuotation) {
  return {
    title: "Sales Quotation",
    documentLabel: "Quotation No",
    documentNumber: document.quotationNumber,
    status: document.status,
    contactName: document.contactName,
    contactEmail: document.contactEmail,
    contactPhoneNumber: document.contactPhoneNumber,
    documentDateUtc: document.documentDateUtc,
    currency: document.currency,
    referenceNo: document.referenceNo,
    notes: document.notes,
    subtotal: document.subtotal,
    taxAmount: document.taxAmount,
    totalAmount: document.totalAmount,
    lines: document.lines,
    backPath: "/sales/quotations",
    editPath: document.status !== "Converted" ? `/sales/quotations/${document.id}/edit` : undefined,
    sourceSummary: document.expiryDateUtc ? `Expiry: ${new Date(document.expiryDateUtc).toLocaleDateString()}` : undefined,
  } satisfies SalesDocumentDetailsProps;
}

export function mapOrderDetails(document: SalesOrder) {
  return {
    title: "Sales Order",
    documentLabel: "Sales Order No",
    documentNumber: document.salesOrderNumber,
    status: document.status,
    contactName: document.contactName,
    contactEmail: document.contactEmail,
    contactPhoneNumber: document.contactPhoneNumber,
    documentDateUtc: document.documentDateUtc,
    currency: document.currency,
    referenceNo: document.referenceNo,
    notes: document.notes,
    subtotal: document.subtotal,
    taxAmount: document.taxAmount,
    totalAmount: document.totalAmount,
    lines: document.lines,
    backPath: "/sales/orders",
    editPath: document.status === "Draft" || document.status === "Confirmed" ? `/sales/orders/${document.id}/edit` : undefined,
    sourceSummary: document.salesQuotationId ? "Source: converted from quotation" : undefined,
  } satisfies SalesDocumentDetailsProps;
}

export function mapDeliveryOrderDetails(document: DeliveryOrder) {
  return {
    title: "Delivery Order",
    documentLabel: "Delivery Order No",
    documentNumber: document.deliveryOrderNumber,
    status: document.status,
    contactName: document.contactName,
    contactEmail: document.contactEmail,
    contactPhoneNumber: document.contactPhoneNumber,
    documentDateUtc: document.documentDateUtc,
    currency: document.currency,
    referenceNo: document.referenceNo,
    notes: document.notes,
    subtotal: document.subtotal,
    taxAmount: document.taxAmount,
    totalAmount: document.totalAmount,
    lines: document.lines,
    backPath: "/sales/delivery-orders",
    editPath: document.status === "Draft" ? `/sales/delivery-orders/${document.id}/edit` : undefined,
    sourceSummary: `Source sales order: ${document.salesOrderNumber}`,
  } satisfies SalesDocumentDetailsProps;
}
