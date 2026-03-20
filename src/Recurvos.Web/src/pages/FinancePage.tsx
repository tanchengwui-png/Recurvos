import { useEffect, useMemo, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { getAuth } from "../lib/auth";
import { api } from "../lib/api";
import type { FeatureAccess } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:7001/api";

type DocumentType = "invoices" | "payments" | "refunds" | "credit-notes";

const documentOptions: Array<{
  value: DocumentType;
  label: string;
  helper: string;
}> = [
  {
    value: "invoices",
    label: "Invoices",
    helper: "Revenue records, due dates, balances, and customer billing history.",
  },
  {
    value: "payments",
    label: "Payments",
    helper: "Collected payments, payment methods, and receipt-linked cash movement.",
  },
  {
    value: "refunds",
    label: "Refunds",
    helper: "Refund events and amounts returned to customers.",
  },
  {
    value: "credit-notes",
    label: "Credit notes",
    helper: "Credit adjustments that reduced invoice value.",
  },
];

function formatDocumentLabel(value: DocumentType) {
  return documentOptions.find((option) => option.value === value)?.label ?? value;
}

function getRangeLabel(startDateUtc: string, endDateUtc: string) {
  const start = new Date(startDateUtc);
  const end = new Date(endDateUtc);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function FinancePage() {
  const [documentType, setDocumentType] = useState<DocumentType>("invoices");
  const [startDateUtc, setStartDateUtc] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [endDateUtc, setEndDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [error, setError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    void api.get<FeatureAccess>("/settings/feature-access").then(setFeatureAccess).catch(() => setFeatureAccess(null));
  }, []);

  const financeEnabled = featureAccess?.featureKeys.includes("finance_exports") ?? false;
  const financeHint = featureAccess?.featureRequirements?.find((item) => item.featureKey === "finance_exports");

  const selectedDocument = useMemo(
    () => documentOptions.find((option) => option.value === documentType) ?? documentOptions[0],
    [documentType],
  );
  const exportRangeLabel = useMemo(
    () => getRangeLabel(startDateUtc, endDateUtc),
    [endDateUtc, startDateUtc],
  );

  async function downloadExport() {
    setIsDownloading(true);
    setError("");

    try {
      const auth = getAuth();
      const params = new URLSearchParams({
        startDateUtc: new Date(startDateUtc).toISOString(),
        endDateUtc: new Date(new Date(endDateUtc).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });

      const response = await fetch(`${API_BASE_URL}/finance/exports/${documentType}/csv?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${auth?.accessToken ?? ""}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to download finance export.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const contentDisposition = response.headers.get("Content-Disposition");
      const fileName = contentDisposition?.split("filename=")[1]?.replace(/"/g, "") ?? `${documentType}.csv`;
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download finance export.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Finance</p>
          <h2>Finance reports</h2>
          <p className="muted">Prepare cleaner exports for your accountant, month-end work, and reconciliation follow-up.</p>
        </div>
      </header>

      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card finance-hero-card">
        <div className="finance-hero-copy">
          <div>
            <p className="eyebrow">Export workspace</p>
            <h3 className="section-title">Download the records you need</h3>
            <p className="muted form-intro">Choose a finance document set, confirm the date range, and export a CSV that is ready for review or handoff.</p>
          </div>
          <div className="finance-summary-grid">
            <div className="finance-summary-item">
              <span className="eyebrow">Document</span>
              <strong>{selectedDocument.label}</strong>
            </div>
            <div className="finance-summary-item">
              <span className="eyebrow">Coverage</span>
              <strong>{exportRangeLabel}</strong>
            </div>
            <div className="finance-summary-item">
              <span className="eyebrow">Format</span>
              <strong>CSV export</strong>
            </div>
          </div>
        </div>
        <div className="finance-hero-callout">
          <p className="eyebrow">Best for</p>
          <strong>{selectedDocument.label}</strong>
          <p>{selectedDocument.helper}</p>
        </div>
      </section>

      <div className="finance-grid">
        <section className="card finance-module-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3 className="section-title">Choose export type</h3>
            </div>
          </div>
          <div className="finance-option-grid">
            {documentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`finance-option-card ${documentType === option.value ? "finance-option-card-active" : ""}`}
                disabled={!financeEnabled}
                title={!financeEnabled ? (financeHint ? `Available on ${financeHint.packageName}` : "Upgrade required") : undefined}
                onClick={() => setDocumentType(option.value)}
              >
                <strong>{option.label}</strong>
                <p>{option.helper}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="card finance-module-card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Step 2</p>
              <h3 className="section-title">Set date range</h3>
            </div>
          </div>
          <div className="form-stack">
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Start date
                <input className="text-input" type="date" value={startDateUtc} onChange={(event) => setStartDateUtc(event.target.value)} />
              </label>
              <label className="form-label">
                End date
                <input className="text-input" type="date" value={endDateUtc} onChange={(event) => setEndDateUtc(event.target.value)} />
              </label>
            </div>
            <div className="finance-export-footer">
              <div className="finance-export-note">
                <p className="eyebrow">Ready to export</p>
                <strong>{`${formatDocumentLabel(documentType)} for ${exportRangeLabel}`}</strong>
                <p className="muted">The export file name is generated automatically by the backend.</p>
              </div>
              <button type="button" className="button button-primary" disabled={isDownloading || !financeEnabled} onClick={() => void downloadExport()}>
                {isDownloading ? "Preparing export..." : "Download CSV"}
              </button>
            </div>
            {!financeEnabled ? (
              <HelperText tone="error">{financeHint ? `Available on ${financeHint.packageName} and above.` : "Available on a higher package."}</HelperText>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
