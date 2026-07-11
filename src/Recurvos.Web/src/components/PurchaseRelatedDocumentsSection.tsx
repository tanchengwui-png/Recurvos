import { Link } from "react-router-dom";
import { formatCurrency } from "../lib/format";
import type { PurchaseRelatedDocument } from "../types";

const documentPathByType: Record<string, string> = {
  GoodsReceivedNote: "/purchases/grns",
  PurchaseBill: "/purchases/bills",
  PurchasePayment: "/purchases/payments",
};

type Props = {
  currency: string;
  documents: PurchaseRelatedDocument[];
  title: string;
};

export function PurchaseRelatedDocumentsSection({ currency, documents, title }: Props) {
  return (
    <div className="invoice-detail-block">
      <div className="invoice-detail-block-header"><h3>{title}</h3></div>
      <div className="table-scroll table-scroll-bounded">
        <table className="catalog-table">
          <thead><tr><th>Document Number</th><th>Type</th><th>Status</th><th>Date</th><th>Amount</th></tr></thead>
          <tbody>
            {documents.length === 0 ? (
              <tr><td colSpan={5} className="empty-table-cell">No related documents yet.</td></tr>
            ) : documents.map((document) => (
              <tr key={document.id}>
                <td>
                  {documentPathByType[document.documentType]
                    ? <Link to={`${documentPathByType[document.documentType]}/${document.id}`}>{document.documentNumber}</Link>
                    : document.documentNumber}
                </td>
                <td>{document.documentType}</td>
                <td>{document.status}</td>
                <td>{new Date(document.documentDateUtc).toLocaleDateString()}</td>
                <td>{formatCurrency(document.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
