import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBusinessDocumentPreview } from "../components/DocumentPreviewModal";
import { formatCurrency } from "../lib/format";
import type { DeliveryOrder, SalesOrder, SalesQuotation } from "../types";

type SalesDocumentDetailsProps = {
  title: string;
  companyName?: string;
  documentLabel: string;
  itemsLabel: string;
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
  relatedDocument?: { label: string; number: string; href: string };
  actionButtons?: ReactNode;
};


export function SalesDocumentDetails(props: SalesDocumentDetailsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const editPath = props.editPath;
  const { previewDocument, printDocument, preview } = useBusinessDocumentPreview();

  function getDocumentPreviewData() {
    const isDeliveryOrder = props.title === "Delivery Order";
    return { companyName: props.companyName, title: props.title, number: props.documentNumber, partyLabel: "Customer", partyName: props.contactName, currency: props.currency, metadata: [["Document date", new Date(props.documentDateUtc).toLocaleDateString()], ["Status", props.status], ["Reference", props.referenceNo], ["Source", props.sourceSummary]], headings: isDeliveryOrder ? ["Item", "Description", "Quantity"] : ["Item", "Description", "Qty", "Unit Price", "Tax", "Amount"], rows: props.lines.map((line) => ({ cells: isDeliveryOrder ? [line.productNameSnapshot || "-", line.description, line.quantity] : [line.productNameSnapshot || "-", line.description, line.quantity, formatCurrency(line.unitPrice, props.currency), `${line.taxRate}%`, formatCurrency(line.lineTotal, props.currency)], numeric: isDeliveryOrder ? [2] : [2, 3, 4, 5] })), totals: isDeliveryOrder ? undefined : [{ label: "Subtotal", value: props.subtotal }, { label: "Tax", value: props.taxAmount }, { label: "Total", value: props.totalAmount, emphasis: true }], notes: props.notes, acknowledgement: isDeliveryOrder ? { preparedBy: "Delivered By", receivedBy: "Received By" } : undefined };
  }

  function handlePrint() {
    printDocument(getDocumentPreviewData());
  }

  function handleExportPdf() {
    previewDocument(getDocumentPreviewData());
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
              <div className="invoice-detail-block-header"><h3>{props.itemsLabel}</h3></div>
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
                {props.relatedDocument ? <div className="invoice-detail-list-row"><span>{props.relatedDocument.label}</span><strong><a className="inline-link" href={props.relatedDocument.href} onClick={(event) => { event.preventDefault(); navigate(props.relatedDocument!.href, { state: { backgroundLocation: location } }); }}>{props.relatedDocument.number}</a></strong></div> : null}
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
      {preview}
    </div>
  );
}

export function mapQuotationDetails(document: SalesQuotation) {
  return {
    title: "Sales Quotation",
    companyName: document.companyName,
    documentLabel: "Quotation No",
    itemsLabel: "Quotation Items",
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
    editPath: `/sales/quotations/${document.id}/edit`,
    sourceSummary: [`Conversion: ${document.conversionStatus.replace(/([A-Z])/g, " $1").trim()}`, document.expiryDateUtc ? `Expiry: ${new Date(document.expiryDateUtc).toLocaleDateString()}` : ""].filter(Boolean).join(" | "),
  } satisfies SalesDocumentDetailsProps;
}

export function mapOrderDetails(document: SalesOrder) {
  return {
    title: "Sales Order",
    companyName: document.companyName,
    documentLabel: "Sales Order No",
    itemsLabel: "Order Items",
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
    editPath: document.status !== "Closed" && document.status !== "Cancelled"
      ? `/sales/orders/${document.id}/edit`
      : undefined,
    sourceSummary: document.salesQuotationId ? "Source: converted from quotation" : undefined,
  } satisfies SalesDocumentDetailsProps;
}

export function mapDeliveryOrderDetails(document: DeliveryOrder) {
  return {
    title: "Delivery Order",
    companyName: document.companyName,
    documentLabel: "Delivery Order No",
    itemsLabel: "Delivery Items",
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
    editPath: document.status !== "Cancelled"
      ? `/sales/delivery-orders/${document.id}/edit`
      : undefined,
    sourceSummary: document.salesQuotationId ? "Source: direct quotation delivery" : document.salesOrderId ? `Source sales order: ${document.salesOrderNumber}` : "Standalone delivery order",
  } satisfies SalesDocumentDetailsProps;
}
