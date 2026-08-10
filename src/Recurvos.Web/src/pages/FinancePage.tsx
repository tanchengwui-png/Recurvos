import { useEffect, useMemo, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { getAuth } from "../lib/auth";
import { api } from "../lib/api";
import { hasFeature } from "../lib/features";
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

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

type FinancePreset = {
  value: string;
  label: string;
  startDateUtc: string;
  endDateUtc: string;
};

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

  const financeEnabled = hasFeature(featureAccess, "finance_exports");
  const financeHint = featureAccess?.featureRequirements?.find((item) => item.featureKey === "finance_exports");

  const exportRangeLabel = useMemo(
    () => getRangeLabel(startDateUtc, endDateUtc),
    [endDateUtc, startDateUtc],
  );
  const rangePresets = useMemo<FinancePreset[]>(() => {
    const today = new Date();
    const end = toDateInputValue(today);
    const last7 = new Date(today);
    last7.setDate(today.getDate() - 6);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    return [
      { value: "last-7", label: "Last 7 days", startDateUtc: toDateInputValue(last7), endDateUtc: end },
      { value: "this-month", label: "This month", startDateUtc: toDateInputValue(monthStart), endDateUtc: end },
      { value: "last-month", label: "Last month", startDateUtc: toDateInputValue(lastMonthStart), endDateUtc: toDateInputValue(lastMonthEnd) },
    ];
  }, []);
  const activePreset = rangePresets.find((preset) => preset.startDateUtc === startDateUtc && preset.endDateUtc === endDateUtc)?.value ?? null;

  function applyPreset(preset: FinancePreset) {
    setStartDateUtc(preset.startDateUtc);
    setEndDateUtc(preset.endDateUtc);
  }

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
    <div className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Finance Reports</h2>
        </div>
      </header>

      {error ? <HelperText tone="error">{error}</HelperText> : null}

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
                <span className="finance-option-kicker">{documentType === option.value ? "Selected" : "Report type"}</span>
                <strong>{option.label}</strong>
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
            <div className="finance-preset-grid">
              {rangePresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`finance-preset-chip ${activePreset === preset.value ? "finance-preset-chip-active" : ""}`}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
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
            <div className="page-meta-row page-meta-row-inline" aria-label="Finance export details">
              <div className="page-meta-chips">
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Range</span>
                  <strong className="page-meta-chip-value">{exportRangeLabel}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Dates</span>
                  <strong className="page-meta-chip-value">{`${startDateUtc} to ${endDateUtc}`}</strong>
                </span>
              </div>
            </div>
            <div className="finance-export-footer">
              <div className="finance-export-note">
                <strong>{`${formatDocumentLabel(documentType)} for ${exportRangeLabel}`}</strong>
              </div>
              <button type="button" className="button button-primary finance-export-button" disabled={isDownloading || !financeEnabled} onClick={() => void downloadExport()}>
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
