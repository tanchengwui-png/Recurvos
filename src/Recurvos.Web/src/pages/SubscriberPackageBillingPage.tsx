import { useEffect, useState } from "react";
import { TablePagination } from "../components/TablePagination";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { ResponseToast } from "../components/ui/Toast";
import { PhoneNumberField } from "../components/ui/PhoneNumberField";
import { useClientPagination } from "../hooks/useClientPagination";
import { API_BASE_URL, api } from "../lib/api";
import { combinePhoneNumber, splitStoredPhoneNumber } from "../lib/phoneNumbers";
import type { AccountBillingProfile, PlatformPackage, SubscriberPackageBillingInvoice, SubscriberPackageBillingSummary, SubscriberPackageReactivationPreview, SubscriberPackageUpgradePreview } from "../types";

const taxIdTypeOptions = ["SST", "VAT", "GST", "TIN", "Other"];

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
  const [billingProfile, setBillingProfile] = useState<AccountBillingProfile | null>(null);
  const [savingBillingProfile, setSavingBillingProfile] = useState(false);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [busyUpgradeCode, setBusyUpgradeCode] = useState<string | null>(null);
  const [cancellingUpgrade, setCancellingUpgrade] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<SubscriberPackageUpgradePreview | null>(null);
  const [reactivationPackages, setReactivationPackages] = useState<PlatformPackage[]>([]);
  const [reactivationPreview, setReactivationPreview] = useState<SubscriberPackageReactivationPreview | null>(null);
  const [selectedReactivationCode, setSelectedReactivationCode] = useState<string | null>(null);
  const [reactivationConfirmationOpen, setReactivationConfirmationOpen] = useState(false);
  const [reactivationCancellationOpen, setReactivationCancellationOpen] = useState(false);
  const [choosingAnotherReactivationPlan, setChoosingAnotherReactivationPlan] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentStatusFilter, setDocumentStatusFilter] = useState<"all" | "open" | "paid" | "pending">("all");
  const openInvoices = summary?.invoices.filter((invoice) => invoice.amountDue > 0).length ?? 0;
  const outstandingBalance = summary?.invoices.reduce((total, invoice) => total + invoice.amountDue, 0) ?? 0;
  const readyReceipts = summary?.invoices.filter((invoice) => invoice.hasReceipt).length ?? 0;
  const hasBillingAddress = billingProfile?.isComplete ?? false;
  const gracePeriodCountdown = getGracePeriodCountdown(summary?.gracePeriodEndsAtUtc);
  const packageStatus = (summary?.packageStatus ?? "").toLowerCase();
  const isActivePackage = packageStatus === "active";
  const hasPendingUpgrade = !!summary?.pendingUpgradePackageCode || !!summary?.pendingUpgradePackageName;
  const currentPackageName = summary?.packageName ?? summary?.packageCode ?? "your current package";
  const parsedBillingPhone = splitStoredPhoneNumber(billingProfile?.billingPhone ?? "");
  const billingTaxIdType = billingProfile?.billingTaxIdType ?? "";
  const availableTaxIdTypeOptions = billingTaxIdType && !taxIdTypeOptions.includes(billingTaxIdType)
    ? [billingTaxIdType, ...taxIdTypeOptions]
    : taxIdTypeOptions;
  const normalizedDocumentSearch = documentSearch.trim().toLowerCase();
  const filteredInvoices = (summary?.invoices ?? []).filter((invoice) => {
    const matchesSearch = !normalizedDocumentSearch
      || [
        invoice.invoiceNumber,
        invoice.packageName,
        invoice.status,
      ].some((value) => value.toLowerCase().includes(normalizedDocumentSearch));

    if (!matchesSearch) {
      return false;
    }

    if (documentStatusFilter === "open") {
      return invoice.amountDue > 0 && !invoice.hasPendingPaymentConfirmation;
    }

    if (documentStatusFilter === "paid") {
      return invoice.amountDue <= 0;
    }

    if (documentStatusFilter === "pending") {
      return invoice.hasPendingPaymentConfirmation;
    }

    return true;
  });
  const selectedReactivationPackage = reactivationPackages.find((item) => item.code === selectedReactivationCode) ?? null;
  const pendingReactivationInvoice = packageStatus === "reactivation_pending_payment" ? summary?.invoices.find((invoice) => invoice.amountDue > 0 && !invoice.hasPendingPaymentConfirmation) ?? null : null;
  const hasPendingReactivation = packageStatus === "reactivation_pending_payment";
  const pagination = useClientPagination(filteredInvoices, [filteredInvoices.length, documentSearch, documentStatusFilter]);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billplzPaymentId = params.get("billplz[id]");
    const billplzPaid = params.get("billplz[paid]");
    const stripeStatus = params.get("stripe_status");
    const stripeSessionId = params.get("session_id") ?? params.get("sessionId");
    const hasBillplzReturn = Boolean(billplzPaymentId || billplzPaid);
    const hasStripeReturn = Boolean(stripeStatus || stripeSessionId);

    if (!hasBillplzReturn && !hasStripeReturn) {
      return;
    }

    async function handleGatewayReturn() {
      try {
        if (hasBillplzReturn && billplzPaid === "true") {
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
        } else if (hasBillplzReturn && billplzPaid === "false") {
          setMessage("");
          setError("Billplz returned without a completed payment.");
        } else if (hasStripeReturn && stripeStatus === "success") {
          if (!stripeSessionId) {
            throw new Error("Stripe return is missing the session id.");
          }

          setError("");
          setMessage("Payment received. Refreshing your billing status...");
          const response = await fetch(`${API_BASE_URL}/webhooks/stripe/complete?${params.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
          if (!response.ok) {
            const rawError = await response.text();
            throw new Error(rawError || `Stripe completion returned HTTP ${response.status}.`);
          }
          await load();
        } else if (hasStripeReturn && stripeStatus === "cancelled") {
          setMessage("");
          setError("Stripe returned without a completed payment.");
        }
      } catch (gatewayReturnError) {
        setMessage("");
        setError(gatewayReturnError instanceof Error ? gatewayReturnError.message : "Unable to confirm payment return.");
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    void handleGatewayReturn();
  }, []);

  async function load() {
    try {
      setError("");
      const [currentSummary, accountBilling] = await Promise.all([
        api.get<SubscriberPackageBillingSummary>("/package-billing"),
        api.get<AccountBillingProfile>("/package-billing/account-billing"),
      ]);
      setSummary(currentSummary);
      setBillingProfile(accountBilling);
      if (["past_due", "reactivation_pending_payment"].includes((currentSummary.packageStatus ?? "").toLowerCase())) {
        setReactivationPackages(await api.get<PlatformPackage[]>("/public/packages"));
      } else {
        setReactivationPackages([]);
        setReactivationPreview(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load package billing.");
    }
  }

  async function saveBillingProfile() {
    if (!billingProfile) return;
    try {
      setSavingBillingProfile(true);
      setError("");
      setMessage("");
      // `isComplete` is calculated by the API and is not part of its update
      // contract. Send only editable fields so validation remains compatible
      // with strict request binding.
      const request = {
        billingContactName: billingProfile.billingContactName,
        billingEmail: billingProfile.billingEmail,
        billingPhone: billingProfile.billingPhone,
        billingAddress: billingProfile.billingAddress,
        billingTaxIdType: billingProfile.billingTaxIdType,
        billingTaxIdNumber: billingProfile.billingTaxIdNumber,
      };
      const updated = await api.put<AccountBillingProfile>("/package-billing/account-billing", request);
      setBillingProfile(updated);
      setMessage("Account billing details saved. They will be used for future subscription invoices.");
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : "Unable to save account billing details.");
    } finally {
      setSavingBillingProfile(false);
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

  async function selectReactivation(packageCode: string) {
    try {
      setSelectedReactivationCode(packageCode);
      setError("");
      setMessage("");
      setReactivationPreview(await api.post<SubscriberPackageReactivationPreview>("/package-billing/reactivation-preview", { packageCode }));
    } catch (previewError) {
      setReactivationPreview(null);
      setError(previewError instanceof Error ? previewError.message : "Unable to preview reactivation.");
    } finally {
    }
  }

  async function continueReactivation() {
    const packageCode = reactivationPreview?.packageCode;
    if (!packageCode || !reactivationPreview) return;
    if (!hasBillingAddress) {
      setError("Please update your company billing address in Companies before creating or paying package invoices.");
      return;
    }

    try {
      setBusyUpgradeCode(packageCode);
      setError("");
      setMessage("");
      const existingInvoice = summary?.invoices.find((invoice) => invoice.packageName === reactivationPreview.packageName && invoice.amountDue > 0 && !invoice.hasPendingPaymentConfirmation);
      const createdInvoice = existingInvoice ?? await api.post<SubscriberPackageBillingInvoice>("/package-billing/reactivate", { packageCode });
      setReactivationPreview(null);
      setReactivationConfirmationOpen(false);
      await createPaymentLink(createdInvoice.id);
    } catch (reactivationError) {
      setError(reactivationError instanceof Error ? reactivationError.message : "Unable to create reactivation invoice.");
    } finally {
      setBusyUpgradeCode(null);
    }
  }

  async function cancelPendingReactivation() {
    try {
      setBusyUpgradeCode("reactivation-cancel");
      const updated = await api.post<SubscriberPackageBillingSummary>("/package-billing/reactivate/cancel", {});
      setSummary(updated); setReactivationCancellationOpen(false); setChoosingAnotherReactivationPlan(true);
      setMessage("Pending reactivation cancelled. Choose another plan when ready.");
    } catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel the pending reactivation."); }
    finally { setBusyUpgradeCode(null); }
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
        <div className="page-header-copy">
          <h2>My Plan</h2>
        </div>
      </header>

      {summary ? (
        <>
          <div className="catalog-toolbar card subtle-card subscriber-billing-toolbar">
            <div className="subscriber-billing-toolbar-copy">
              <strong>{summary.packageName ?? summary.packageCode ?? "No package assigned"}</strong>
              <p className="muted">
                {summary.packageAmount && summary.currency
                  ? `${formatMoney(summary.packageAmount, summary.currency)}${summary.billingIntervalLabel ? ` | ${summary.billingIntervalLabel}` : ""}`
                  : "Package billing details are not available yet."}
              </p>
            </div>
            <span className={`status-pill ${summary.packageStatus?.toLowerCase() === "active" ? "status-pill-active" : "status-pill-inactive"}`}>
              {formatStatusLabel(summary.packageStatus)}
            </span>
          </div>
        </>
      ) : null}

      {summary?.packageStatus === "grace_period" && summary.gracePeriodEndsAtUtc && !hasPendingUpgrade ? (
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
      {hasPendingUpgrade && summary?.pendingUpgradePackageName ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-warning">
          <div>
            <p className="eyebrow">Upgrade pending</p>
            <strong>{`Upgrade to ${summary.pendingUpgradePackageName} is waiting for payment`}</strong>
            <p className="muted">{`Pay the upgrade invoice below to activate ${summary.pendingUpgradePackageName}. Until payment is completed, your current package remains ${currentPackageName}.`}</p>
            {summary.gracePeriodEndsAtUtc ? (
              <p className="muted">{`Your current ${currentPackageName} access remains available until ${formatDate(summary.gracePeriodEndsAtUtc)}.`}</p>
            ) : null}
            {gracePeriodCountdown ? <p className="muted">{gracePeriodCountdown}</p> : null}
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
      {billingProfile ? (
        <section className="card">
          <div className="dashboard-widget-header">
            <div>
              <p className="eyebrow">Account Billing</p>
              <h3 className="section-title">Subscription billing profile</h3>
              <p className="muted">Used for subscription invoices only. It does not change any company profile.</p>
            </div>
          </div>
          <div className="master-data-form-grid master-data-form-grid-wide">
            <label className="form-label">Billing contact name<input className="text-input" value={billingProfile.billingContactName ?? ""} onChange={(event) => setBillingProfile({ ...billingProfile, billingContactName: event.target.value })} /></label>
            <label className="form-label">Billing email<input className="text-input" type="email" value={billingProfile.billingEmail ?? ""} onChange={(event) => setBillingProfile({ ...billingProfile, billingEmail: event.target.value })} /></label>
            <div className="master-data-form-wide">
              <PhoneNumberField
                countryCodeId="subscription-billing-phone-country-code"
                phoneNumberId="subscription-billing-phone-number"
                countryCodeValue={parsedBillingPhone.countryCode}
                phoneNumberValue={parsedBillingPhone.phoneNumber}
                countryCodeLabel="Country code"
                phoneNumberLabel="Phone (optional)"
                onCountryCodeChange={(countryCode) => setBillingProfile({ ...billingProfile, billingPhone: combinePhoneNumber(countryCode, parsedBillingPhone.phoneNumber) })}
                onPhoneNumberChange={(phoneNumber) => setBillingProfile({ ...billingProfile, billingPhone: combinePhoneNumber(parsedBillingPhone.countryCode, phoneNumber) })}
              />
            </div>
            <label className="form-label">Tax ID type (optional)<select value={billingTaxIdType} onChange={(event) => setBillingProfile({ ...billingProfile, billingTaxIdType: event.target.value })}><option value="">Select tax ID type</option>{availableTaxIdTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="form-label">Tax ID number (optional)<input className="text-input" value={billingProfile.billingTaxIdNumber ?? ""} onChange={(event) => setBillingProfile({ ...billingProfile, billingTaxIdNumber: event.target.value })} /></label>
            <label className="form-label master-data-form-wide">Billing address<textarea className="text-input" rows={3} value={billingProfile.billingAddress ?? ""} onChange={(event) => setBillingProfile({ ...billingProfile, billingAddress: event.target.value })} /></label>
          </div>
          <div className="subscriber-billing-profile-actions">
            <button type="button" className="button button-primary" disabled={savingBillingProfile} onClick={() => void saveBillingProfile()}>{savingBillingProfile ? "Saving..." : "Save billing details"}</button>
          </div>
        </section>
      ) : null}

      {billingProfile && !billingProfile.isComplete ? (
        <section className="subscriber-billing-alert subscriber-billing-alert-warning">
          <div>
            <p className="eyebrow">Billing profile required</p>
            <strong>Complete Account Billing before payment</strong>
            <p className="muted">Add a billing contact, email, and address above. Company addresses are not used for subscription billing.</p>
          </div>
        </section>
      ) : null}

      <ResponseToast message={message} tone="success" />
      <ResponseToast message={error} tone="error" />

      {hasPendingReactivation ? <section className="subscriber-billing-alert subscriber-billing-alert-warning"><div><p className="eyebrow">Pending reactivation</p><strong>{pendingReactivationInvoice ? `You have a pending ${pendingReactivationInvoice.packageName} reactivation for ${formatMoney(pendingReactivationInvoice.amountDue, pendingReactivationInvoice.currency)}.` : "You have a pending reactivation awaiting payment."}</strong></div><div className="button-stack">{pendingReactivationInvoice ? <button type="button" className="button button-primary" onClick={() => void createPaymentLink(pendingReactivationInvoice.id)}>Continue payment</button> : null}<button type="button" className="button button-secondary" onClick={() => setReactivationCancellationOpen(true)}>Choose another plan</button></div></section> : null}
      {(packageStatus === "past_due" || choosingAnotherReactivationPlan) && reactivationPackages.length > 0 ? (
        <section className="card">
          <div className="dashboard-widget-header">
            <div>
              <p className="eyebrow">Reactivate account</p>
              <h3 className="section-title">Choose a package to come back</h3>
            </div>
          </div>
          <p className="muted form-intro">Select the package you would like to reactivate.</p>
          <div className="stack">
            {reactivationPackages.map((item) => (
              <button key={item.id} type="button" className={`dashboard-list-item package-reactivation-option${selectedReactivationCode === item.code ? " package-reactivation-option-selected" : ""}`} onClick={() => void selectReactivation(item.code)} aria-pressed={selectedReactivationCode === item.code}>
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{`${formatMoney(item.amount, item.currency)} | ${item.intervalCount <= 1 ? item.intervalUnit : `${item.intervalCount} ${item.intervalUnit}`}`}</p>
                  <p className="muted">{item.description}</p>
                </div>
                <span className="package-reactivation-radio" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="subscriber-billing-alert subscriber-billing-alert-warning package-reactivation-summary">
            <div><p className="eyebrow">Selected package</p><strong>{selectedReactivationPackage?.name ?? "Choose a package"}</strong><p className="muted">Monthly price: {selectedReactivationPackage ? formatMoney(selectedReactivationPackage.amount, selectedReactivationPackage.currency) : "—"}</p><p className="muted">Amount due today: {reactivationPreview ? formatMoney(reactivationPreview.totalAmount, reactivationPreview.currency) : "—"}</p></div>
            <button type="button" className="button button-primary" disabled={!reactivationPreview || !hasBillingAddress || busyUpgradeCode !== null} onClick={() => setReactivationConfirmationOpen(true)}>Continue to payment</button>
          </div>
        </section>
      ) : null}
      <ConfirmModal open={reactivationConfirmationOpen} title="Continue to payment" description={reactivationPreview ? `${reactivationPreview.packageName} · Monthly price ${formatMoney(reactivationPreview.packageAmount, reactivationPreview.currency)} · Amount due today ${formatMoney(reactivationPreview.totalAmount, reactivationPreview.currency)}${summary?.currentCycleEndUtc ? ` · Next billing date ${formatDate(summary.currentCycleEndUtc)}` : ""}` : ""} confirmLabel="Confirm" onConfirm={continueReactivation} onCancel={() => setReactivationConfirmationOpen(false)} />
      <ConfirmModal open={reactivationCancellationOpen} title="Cancel pending reactivation" description="Changing plan will cancel your current pending reactivation invoice. Continue?" confirmLabel="Cancel reactivation" onConfirm={cancelPendingReactivation} onCancel={() => setReactivationCancellationOpen(false)} />

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
          <div className="section-header-cluster">
            <h3 className="section-title">Invoices and receipts</h3>
            {summary ? (
              <div className="page-meta-row page-meta-row-inline page-meta-row-spaced" aria-label="Package billing summary">
                <div className="page-meta-chips">
                  <span className="page-meta-chip">
                    <span className="page-meta-chip-label">Plan</span>
                    <strong className="page-meta-chip-value">{summary.packageName ?? summary.packageCode ?? "-"}</strong>
                  </span>
                  <span className="page-meta-chip">
                    <span className="page-meta-chip-label">Open</span>
                    <strong className="page-meta-chip-value">{openInvoices}</strong>
                  </span>
                  <span className="page-meta-chip">
                    <span className="page-meta-chip-label">Outstanding</span>
                    <strong className="page-meta-chip-value">{summary.currency ? formatMoney(outstandingBalance, summary.currency) : "-"}</strong>
                  </span>
                  <span className="page-meta-chip">
                    <span className="page-meta-chip-label">Receipts</span>
                    <strong className="page-meta-chip-value">{readyReceipts}</strong>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          {summary?.invoices.length ? (
            <span className="badge">{summary.invoices.length} document{summary.invoices.length === 1 ? "" : "s"}</span>
          ) : null}
        </div>
        <div className="catalog-toolbar card subtle-card subscriber-billing-doc-toolbar">
          <label className="form-label subscriber-billing-doc-search">
            Search
            <input
              aria-label="Search plan billing documents"
              className="text-input"
              value={documentSearch}
              onChange={(event) => setDocumentSearch(event.target.value)}
              placeholder="Search invoice, package, or status"
            />
          </label>
          <label className="form-label subscriber-billing-doc-filter">
            Status
            <select
              aria-label="Filter plan billing documents by status"
              value={documentStatusFilter}
              onChange={(event) => setDocumentStatusFilter(event.target.value as "all" | "open" | "paid" | "pending")}
            >
              <option value="all">All documents</option>
              <option value="open">Open balance</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending review</option>
            </select>
          </label>
        </div>

        {!summary || summary.invoices.length === 0 ? (
          <div className="empty-state">
            <h3>No billing documents yet</h3>
            <p className="muted">Your package invoice will appear here after your subscription is provisioned.</p>
          </div>
        ) : (
          <>
            <div className="package-billing-mobile-list">
              {pagination.pagedItems.map((invoice) => (
                <article key={invoice.id} className="subscription-mobile-card">
                  <div className="subscription-mobile-card-header">
                    <div className="subscription-mobile-identity">
                      <strong>{invoice.invoiceNumber}</strong>
                      <div className="eyebrow">{invoice.packageName}</div>
                    </div>
                  </div>
                  <div className="subscription-mobile-card-topline">
                    <span className={`subscription-mobile-status ${invoice.status === "Voided" ? "subscription-mobile-status-danger" : invoice.amountDue <= 0 ? "subscription-mobile-status-active" : "subscription-mobile-status-inactive"}`}>
                      {formatStatusLabel(invoice.status)}
                    </span>
                    <span className="subscription-mobile-inline-note">{formatDate(invoice.issueDateUtc)}</span>
                  </div>
                  <div className="subscription-mobile-summary">
                    <div className="subscription-mobile-amount">{formatMoney(invoice.total, invoice.currency)}</div>
                    <div className="subscription-mobile-cadence">{`Balance ${formatMoney(invoice.amountDue, invoice.currency)}`}</div>
                  </div>
                  <div className="subscription-mobile-meta">
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Package</span>
                      <span className="subscription-mobile-meta-value">{invoice.packageName}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Issue date</span>
                      <span className="subscription-mobile-meta-value">{formatDate(invoice.issueDateUtc)}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Due date</span>
                      <span className="subscription-mobile-meta-value">{formatDate(invoice.dueDateUtc)}</span>
                    </div>
                    <div className="subscription-mobile-meta-row">
                      <span className="subscription-mobile-meta-label">Balance</span>
                      <span className="subscription-mobile-meta-value">{formatMoney(invoice.amountDue, invoice.currency)}</span>
                    </div>
                  </div>
                  <div className="button-stack package-billing-mobile-actions">
                    {invoice.status !== "Voided" && invoice.amountDue > 0 ? (
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
                    <button type="button" className="button button-secondary" disabled={invoice.status === "Voided"} title={invoice.status === "Voided" ? "Voided invoices cannot be downloaded." : undefined} onClick={() => void download(`/package-billing/invoices/${invoice.id}/download`, `${invoice.invoiceNumber}.pdf`)}>
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
                  </div>
                </article>
              ))}
            </div>
            <div className="package-billing-table-shell">
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
                        <span className={`status-pill ${invoice.status === "Voided" ? "status-pill-danger" : invoice.amountDue <= 0 ? "status-pill-active" : "status-pill-inactive"}`}>
                          {formatStatusLabel(invoice.status)}
                        </span>
                      </td>
                      <td>{formatDate(invoice.issueDateUtc)}</td>
                      <td>{formatDate(invoice.dueDateUtc)}</td>
                      <td>{formatMoney(invoice.total, invoice.currency)}</td>
                      <td><strong>{formatMoney(invoice.amountDue, invoice.currency)}</strong></td>
                      <td className="actions-cell">
                        {invoice.status !== "Voided" && invoice.amountDue > 0 ? (
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
                        <button type="button" className="button button-secondary" disabled={invoice.status === "Voided"} title={invoice.status === "Voided" ? "Voided invoices cannot be downloaded." : undefined} onClick={() => void download(`/package-billing/invoices/${invoice.id}/download`, `${invoice.invoiceNumber}.pdf`)}>
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
            </div>
            <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}
