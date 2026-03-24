import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useClientPagination } from "../hooks/useClientPagination";
import { API_BASE_URL, api } from "../lib/api";
import type { PlatformPackage, SubscriberPackageBillingInvoice, SubscriberPackageBillingSummary, SubscriberPackageReactivationPreview, SubscriberPackageUpgradePreview } from "../types";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: currency || "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatusLabel(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getGracePeriodCountdown(value?: string | null) {
  if (!value) {
    return null;
  }

  const endsAt = new Date(value);
  const remainingMilliseconds = endsAt.getTime() - Date.now();

  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    return "Payment deadline reached.";
  }

  const remainingDays = Math.ceil(remainingMilliseconds / (1000 * 60 * 60 * 24));

  if (remainingDays <= 1) {
    return "Less than 1 day left. Pay now to avoid access being restricted.";
  }

  if (remainingDays <= 3) {
    return `${remainingDays} days left. Please pay now to avoid access being restricted.`;
  }

  return `${remainingDays} days left to pay before access is restricted.`;
}

export function SubscriberPackageBillingPage() {
  const [summary, setSummary] = useState<SubscriberPackageBillingSummary | null>(null);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [busyUpgradeCode, setBusyUpgradeCode] = useState<string | null>(null);
  const [cancellingUpgrade, setCancellingUpgrade] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<SubscriberPackageUpgradePreview | null>(null);
  const [reactivationPackages, setReactivationPackages] = useState<PlatformPackage[]>([]);
  const [reactivationPreview, setReactivationPreview] = useState<SubscriberPackageReactivationPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pagination = useClientPagination(summary?.invoices ?? [], [summary?.invoices.length ?? 0]);
  const openInvoices = summary?.invoices.filter((invoice) => invoice.amountDue > 0).length ?? 0;
  const outstandingBalance = summary?.invoices.reduce((total, invoice) => total + invoice.amountDue, 0) ?? 0;
  const readyReceipts = summary?.invoices.filter((invoice) => invoice.hasReceipt).length ?? 0;
  const hasBillingAddress = summary?.isCompanyBillingAddressConfigured ?? true;
  const gracePeriodCountdown = getGracePeriodCountdown(summary?.gracePeriodEndsAtUtc);
  const packageStatus = (summary?.packageStatus ?? "").toLowerCase();
  const isActivePackage = packageStatus === "active";

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("billplz[id]");
    const paid = params.get("billplz[paid]");

    if (!paymentId && !paid) {
      return;
    }

    async function handleBillplzReturn() {
      try {
        if (paid === "true") {
          setError("");
          setMessage("Payment received. Refreshing your billing status...");
          const response = await fetch(`${API_BASE_URL}/webhooks/billplz/complete?${params.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
          if (!response.ok) {
            const rawError = await response.text();
            throw new Error(rawError || `Billplz completion returned HTTP ${response.status}.`);
          }
          await load();
        } else if (paid === "false") {
          setMessage("");
          setError("Billplz returned without a completed payment.");
        }
      } catch (billplzReturnError) {
        setMessage("");
        setError(billplzReturnError instanceof Error ? billplzReturnError.message : "Unable to confirm Billplz payment return.");
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    void handleBillplzReturn();
  }, []);

  async function load() {
    try {
      setError("");
      const currentSummary = await api.get<SubscriberPackageBillingSummary>("/package-billing");
      setSummary(currentSummary);
      if ((currentSummary.packageStatus ?? "").toLowerCase() === "past_due") {
        setReactivationPackages(await api.get<PlatformPackage[]>("/public/packages"));
      } else {
        setReactivationPackages([]);
        setReactivationPreview(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load package billing.");
    }
  }

  function updateInvoice(updated: SubscriberPackageBillingInvoice) {
    setSummary((current) => current
      ? {
          ...current,
          invoices: current.invoices.map((invoice) => invoice.id === updated.id ? updated : invoice),
        }
      : current);
  }

  async function createPaymentLink(invoiceId: string) {
    if (!hasBillingAddress) {
      setError("Please update your company billing address in Companies before creating or paying package invoices.");
      return;
    }

    try {
      setBusyInvoiceId(invoiceId);
      setError("");
      setMessage("");
      const updated = await api.post<SubscriberPackageBillingInvoice>(`/package-billing/invoices/${invoiceId}/payment-link`);
      updateInvoice(updated);
      if (!updated.paymentLinkUrl) {
        throw new Error("Payment gateway did not return a payment URL.");
      }

      window.location.assign(updated.paymentLinkUrl);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Unable to create payment link.");
    } finally {
      setBusyInvoiceId(null);
    }
  }

  async function previewUpgrade(packageCode: string) {
    try {
      setBusyUpgradeCode(packageCode);
      setError("");
      setMessage("");
      setUpgradePreview(await api.post<SubscriberPackageUpgradePreview>("/package-billing/upgrade-preview", { packageCode }));
    } catch (previewError) {
      setUpgradePreview(null);
      setError(previewError instanceof Error ? previewError.message : "Unable to preview package upgrade.");
    } finally {
      setBusyUpgradeCode(null);
    }
  }

  async function createUpgradeInvoice(packageCode: string) {
    if (!hasBillingAddress) {
      setError("Please update your company billing address in Companies before creating or paying package invoices.");
      return;
    }

    try {
      setBusyUpgradeCode(packageCode);
      setError("");
      setMessage("");
      const createdInvoice = await api.post<SubscriberPackageBillingInvoice>("/package-billing/upgrade", { packageCode });
      setSummary((current) => current
        ? {
            ...current,
            packageStatus: "upgrade_pending_payment",
            pendingUpgradePackageCode: packageCode,
            pendingUpgradePackageName: upgradePreview?.targetPackageName ?? current.pendingUpgradePackageName,
            invoices: [createdInvoice, ...current.invoices],
          }
        : current);
      setUpgradePreview(null);
      setMessage(`Upgrade invoice ${createdInvoice.invoiceNumber} is ready. Pay it to activate the new package.`);
      await load();
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "Unable to create upgrade invoice.");
    } finally {
      setBusyUpgradeCode(null);
    }
  }

  async function previewReactivation(packageCode: string) {
    try {
      setBusyUpgradeCode(packageCode);
      setError("");
      setMessage("");
      setReactivationPreview(await api.post<SubscriberPackageReactivationPreview>("/package-billing/reactivation-preview", { packageCode }));
    } catch (previewError) {
      setReactivationPreview(null);
      setError(previewError instanceof Error ? previewError.message : "Unable to preview reactivation.");
    } finally {
      setBusyUpgradeCode(null);
    }
  }

  async function createReactivationInvoice(packageCode: string) {
    if (!hasBillingAddress) {
      setError("Please update your company billing address in Companies before creating or paying package invoices.");
      return;
    }

    try {
      setBusyUpgradeCode(packageCode);
      setError("");
      setMessage("");
      const createdInvoice = await api.post<SubscriberPackageBillingInvoice>("/package-billing/reactivate", { packageCode });
      setReactivationPreview(null);
      setMessage(`Reactivation invoice ${createdInvoice.invoiceNumber} is ready. Pay it to restore full access.`);
      await load();
    } catch (reactivationError) {
      setError(reactivationError instanceof Error ? reactivationError.message : "Unable to create reactivation invoice.");
    } finally {
      setBusyUpgradeCode(null);
    }
  }

  async function cancelPendingUpgrade() {
    try {
      setCancellingUpgrade(true);
      setError("");
      setMessage("");
      const updatedSummary = await api.post<SubscriberPackageBillingSummary>("/package-billing/upgrade/cancel", {});
      setSummary(updatedSummary);
      setUpgradePreview(null);
      setMessage("Pending package upgrade cancelled. Your current package stays active.");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel pending upgrade.");
    } finally {
      setCancellingUpgrade(false);
    }
  }

  async function download(path: string, fallbackFileName: string) {
    const file = await api.download(path);
    const objectUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.fileName ?? fallbackFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Subscriber billing</p>
          <h2>My plan</h2>
          <p className="muted">See your current package, settle outstanding invoices, and download your billing documents.</p>
        </div>
      </header>

      {summary ? (
        <section className="card subscriber-billing-hero">
          <div className="subscriber-billing-hero-copy">
            <div>
              <p className="eyebrow">Current package</p>
              <h3>{summary.packageName ?? summary.packageCode ?? "No package assigned"}</h3>
              <p className="muted">
                {summary.packageAmount && summary.currency
                  ? `${formatMoney(summary.packageAmount, summary.currency)}${summary.billingIntervalLabel ? ` | ${summary.billingIntervalLabel}` : ""}`
                  : "Package billing details are not available yet."}
              </p>
            </div>
            <div className="subscriber-billing-metrics">
              <div className="subscriber-billing-metric">
                <span className="settings-stat-label">Open invoices</span>
                <strong>{openInvoices}</strong>
              </div>
              <div className="subscriber-billing-metric">
                <span className="settings-stat-label">Outstanding</span>
                <strong>{summary.currency ? formatMoney(outstandingBalance, summary.currency) : "-"}</strong>
              </div>
              <div className="subscriber-billing-metric">
                <span className="settings-stat-label">Receipts ready</span>
                <strong>{readyReceipts}</strong>
              </div>
            </div>
          </div>
          <div className="subscriber-billing-status">
            <span className={`status-pill ${summary.packageStatus?.toLowerCase() === "active" ? "status-pill-active" : "status-pill-inactive"}`}>
              {formatStatusLabel(summary.packageStatus)}
            </span>
          </div>
        </section>
      ) : null}

      {summary?.packageStatus === "grace_period" && summary.gracePeriodEndsAtUtc ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-warning">
          <div>
            <p className="eyebrow">Payment reminder</p>
            <strong>Package payment is still pending</strong>
            <p className="muted">{`Your billing access remains available until ${formatDate(summary.gracePeriodEndsAtUtc)}.`}</p>
            {gracePeriodCountdown ? <p className="muted">{gracePeriodCountdown}</p> : null}
          </div>
        </section>
      ) : null}
      {packageStatus === "past_due" ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-danger">
          <div>
            <p className="eyebrow">Action needed</p>
            <strong>Package invoice is overdue</strong>
            <p className="muted">Choose a package below to generate a fresh reactivation invoice and restore full billing access.</p>
          </div>
        </section>
      ) : null}
      {packageStatus === "reactivation_pending_payment" ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-danger">
          <div>
            <p className="eyebrow">Reactivation pending</p>
            <strong>Reactivation invoice is waiting for payment</strong>
            <p className="muted">Your account remains restricted until the reactivation invoice below is paid.</p>
          </div>
        </section>
      ) : null}
      {summary?.packageStatus === "upgrade_pending_payment" && summary.pendingUpgradePackageName ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-warning">
          <div>
            <p className="eyebrow">Upgrade pending</p>
            <strong>{`Upgrade to ${summary.pendingUpgradePackageName} is waiting for payment`}</strong>
            <p className="muted">Pay the upgrade invoice below before the package changes. Until then, your current package stays active.</p>
          </div>
          {summary.canCancelPendingUpgrade ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={cancellingUpgrade}
              onClick={() => void cancelPendingUpgrade()}
            >
              {cancellingUpgrade ? "Cancelling..." : "Cancel upgrade"}
            </button>
          ) : null}
        </section>
      ) : null}
      {summary && !summary.isCompanyBillingAddressConfigured ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-warning">
          <div>
            <p className="eyebrow">Billing profile required</p>
            <strong>Add your company billing address before payment</strong>
            <p className="muted">
              Go to <Link className="inline-link" to="/companies">Companies</Link>, edit your company, and fill in the Address field.
            </p>
          </div>
        </section>
      ) : null}

      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      {packageStatus === "past_due" && reactivationPackages.length > 0 ? (
        <section className="card">
          <div className="dashboard-widget-header">
            <div>
              <p className="eyebrow">Reactivate account</p>
              <h3 className="section-title">Choose a package to come back</h3>
            </div>
          </div>
          <p className="muted form-intro">Your previous unpaid package invoice will be replaced with a fresh invoice for the package you choose now.</p>
          <div className="stack">
            {reactivationPackages.map((item) => (
              <div key={item.id} className="dashboard-list-item">
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{`${formatMoney(item.amount, item.currency)} | ${item.intervalCount <= 1 ? item.intervalUnit : `${item.intervalCount} ${item.intervalUnit}`}`}</p>
                  <p className="muted">{item.description}</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busyUpgradeCode === item.code}
                  onClick={() => void previewReactivation(item.code)}
                >
                  {busyUpgradeCode === item.code ? "Checking..." : "See reactivation invoice"}
                </button>
              </div>
            ))}
          </div>
          {reactivationPreview ? (
            <div className="subscriber-billing-alert subscriber-billing-alert-warning">
              <div>
                <p className="eyebrow">Reactivation quote</p>
                <strong>{reactivationPreview.packageName}</strong>
                <p className="muted">{`${reactivationPreview.billingIntervalLabel} | Package amount: ${formatMoney(reactivationPreview.packageAmount, reactivationPreview.currency)}`}</p>
                <p className="muted">{`Tax: ${formatMoney(reactivationPreview.taxAmount, reactivationPreview.currency)} | Total due now: ${formatMoney(reactivationPreview.totalAmount, reactivationPreview.currency)}`}</p>
              </div>
              <div className="button-stack">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busyUpgradeCode === reactivationPreview.packageCode || !hasBillingAddress}
                  onClick={() => void createReactivationInvoice(reactivationPreview.packageCode)}
                >
                  {busyUpgradeCode === reactivationPreview.packageCode ? "Creating..." : "Create reactivation invoice"}
                </button>
                <button type="button" className="button button-secondary" onClick={() => setReactivationPreview(null)}>
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {summary && isActivePackage && summary.availableUpgrades.length > 0 ? (
        <section className="card">
          <div className="dashboard-widget-header">
            <div>
              <p className="eyebrow">Package upgrade</p>
              <h3 className="section-title">Move to a higher plan</h3>
            </div>
          </div>
          <p className="muted form-intro">Upgrade starts after the prorated invoice is paid.</p>
          {summary.currentCycleEndUtc ? (
            <HelperText>{`Current billing cycle ends on ${formatDate(summary.currentCycleEndUtc)}.`}</HelperText>
          ) : null}
          <div className="subscriber-upgrade-list">
            {summary.availableUpgrades.map((upgrade) => (
              <div key={upgrade.code} className="dashboard-list-item subscriber-upgrade-item">
                <div className="subscriber-upgrade-copy">
                  <strong>{upgrade.name}</strong>
                  <p className="muted">{`${formatMoney(upgrade.amount, upgrade.currency)} | ${upgrade.billingIntervalLabel}`}</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busyUpgradeCode === upgrade.code || !!summary.pendingUpgradePackageCode}
                  onClick={() => void previewUpgrade(upgrade.code)}
                >
                  {busyUpgradeCode === upgrade.code ? "Checking..." : "See upgrade price"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {upgradePreview ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setUpgradePreview(null)}>
          <div
            className="modal-card card subscriber-upgrade-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-quote-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="subscriber-upgrade-modal-header">
              <div>
                <p className="eyebrow">Upgrade quote</p>
                <h3 id="upgrade-quote-title">{`${upgradePreview.currentPackageName} to ${upgradePreview.targetPackageName}`}</h3>
                <p className="muted">{`Current cycle ends on ${formatDate(upgradePreview.currentCycleEndUtc)}.`}</p>
              </div>
              <button type="button" className="button button-secondary" onClick={() => setUpgradePreview(null)}>
                Close
              </button>
            </div>
            <div className="subscriber-upgrade-quote-grid">
              <div className="subscriber-upgrade-quote-stat">
                <span>Cycle left</span>
                <strong>{`${upgradePreview.remainingDays} of ${upgradePreview.totalDays} days`}</strong>
              </div>
              <div className="subscriber-upgrade-quote-stat">
                <span>Due now</span>
                <strong>{formatMoney(upgradePreview.totalAmount, upgradePreview.currency)}</strong>
              </div>
              <div className="subscriber-upgrade-quote-stat">
                <span>Tax</span>
                <strong>{formatMoney(upgradePreview.taxAmount, upgradePreview.currency)}</strong>
              </div>
            </div>
            <div className="subscriber-upgrade-modal-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busyUpgradeCode === upgradePreview.targetPackageCode || !!summary?.pendingUpgradePackageCode || !hasBillingAddress}
                  onClick={() => void createUpgradeInvoice(upgradePreview.targetPackageCode)}
                >
                {busyUpgradeCode === upgradePreview.targetPackageCode ? "Creating..." : "Create upgrade invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="card">
        <div className="dashboard-widget-header">
          <div>
            <p className="eyebrow">Documents</p>
            <h3 className="section-title">Invoices and receipts</h3>
          </div>
          {summary?.invoices.length ? (
            <span className="badge">{summary.invoices.length} document{summary.invoices.length === 1 ? "" : "s"}</span>
          ) : null}
        </div>

        {!summary || summary.invoices.length === 0 ? (
          <div className="empty-state">
            <h3>No billing documents yet</h3>
            <p className="muted">Your package invoice will appear here after your subscription is provisioned.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="catalog-table package-billing-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Package</th>
                    <th>Status</th>
                    <th>Issue date</th>
                    <th>Due date</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pagedItems.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="table-primary-cell">
                        <div className="table-primary-cell-stack">
                          <div>
                            <strong className="table-primary-title">{invoice.invoiceNumber}</strong>
                            <div className="table-meta">
                              <span className="table-meta-item">{formatDate(invoice.issueDateUtc)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{invoice.packageName}</td>
                      <td>
                        <span className={`status-pill ${invoice.amountDue <= 0 ? "status-pill-active" : "status-pill-inactive"}`}>
                          {formatStatusLabel(invoice.status)}
                        </span>
                      </td>
                      <td>{formatDate(invoice.issueDateUtc)}</td>
                      <td>{formatDate(invoice.dueDateUtc)}</td>
                      <td>{formatMoney(invoice.total, invoice.currency)}</td>
                      <td><strong>{formatMoney(invoice.amountDue, invoice.currency)}</strong></td>
                      <td className="actions-cell">
                        {invoice.amountDue > 0 ? (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busyInvoiceId === invoice.id || invoice.hasPendingPaymentConfirmation || !hasBillingAddress}
                            onClick={() => void createPaymentLink(invoice.id)}
                          >
                            {invoice.hasPendingPaymentConfirmation
                              ? "Pending review"
                              : busyInvoiceId === invoice.id
                                ? "Preparing..."
                                : "Pay now"}
                          </button>
                        ) : null}
                        <button type="button" className="button button-secondary" onClick={() => void download(`/package-billing/invoices/${invoice.id}/download`, `${invoice.invoiceNumber}.pdf`)}>
                          Download invoice
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={!invoice.hasReceipt}
                          onClick={() => void download(`/package-billing/invoices/${invoice.id}/receipt`, `${invoice.invoiceNumber}-receipt.pdf`)}
                        >
                          Download receipt
                        </button>
                        {invoice.hasPendingPaymentConfirmation ? (
                          <p className="muted package-billing-pending-note">
                            A manual payment confirmation is outstanding, so links and new requests stay disabled until review completes.
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}
