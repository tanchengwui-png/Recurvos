import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ConfirmModal } from "./ConfirmModal";
import { api } from "../lib/api";
import { getAuth, setAuth } from "../lib/auth";
import type { BillingReadiness, CompanyLookup, FeatureAccess, FeedbackNotificationSummary, PaymentConfirmation, SubscriberPackageBillingSummary } from "../types";

function formatPackageLabel(packageCode?: string | null) {
  if (!packageCode) {
    return "No package";
  }

  if (packageCode.trim().toLowerCase() === "starter") {
    return "Basic";
  }

  return packageCode
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatusLabel(status?: string | null) {
  if (!status) {
    return "";
  }

  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFeatureRequirementLabel(featureAccess: FeatureAccess | null, featureKey: string) {
  const requirement = featureAccess?.featureRequirements?.find((item) => item.featureKey === featureKey);
  return requirement ? `Available on ${requirement.packageName}` : "Upgrade required";
}

export function AppShell() {
  const auth = getAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [packageBilling, setPackageBilling] = useState<SubscriberPackageBillingSummary | null>(null);
  const [companyCount, setCompanyCount] = useState<number | null>(null);
  const [pendingSetupCount, setPendingSetupCount] = useState<number | null>(null);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
  const [pendingPaymentConfirmationCount, setPendingPaymentConfirmationCount] = useState(0);

  useEffect(() => {
    if (!auth || auth.isPlatformOwner) {
      return;
    }

    void Promise.all([
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<SubscriberPackageBillingSummary>("/package-billing").catch(() => null),
      api.get<CompanyLookup[]>("/companies").catch(() => null),
      api.get<BillingReadiness>("/settings/billing-readiness").catch(() => null),
      api.get<FeedbackNotificationSummary>("/feedback/notifications").catch(() => null),
      api.get<PaymentConfirmation[]>("/payment-confirmations").catch(() => null),
    ]).then(([access, billing, companies, readiness, feedbackSummary, paymentConfirmations]) => {
      setFeatureAccess(access);
      setPackageBilling(billing);
      setCompanyCount(companies?.length ?? null);
      setPendingSetupCount(readiness ? readiness.items.filter((item) => !item.done).length : null);
      setFeedbackUnreadCount(feedbackSummary?.unreadReplies ?? 0);
      setPendingPaymentConfirmationCount(paymentConfirmations?.filter((item) => item.status === "Pending").length ?? 0);
    });
  }, [auth?.accessToken, auth?.isPlatformOwner, location.pathname]);

  useEffect(() => {
    if (!auth || auth.isPlatformOwner) {
      return;
    }

    const refreshPendingPaymentConfirmations = () => {
      void api.get<PaymentConfirmation[]>("/payment-confirmations")
        .then((items) => setPendingPaymentConfirmationCount(items.filter((item) => item.status === "Pending").length))
        .catch(() => setPendingPaymentConfirmationCount(0));
    };

    const refreshFeedbackNotifications = () => {
      void api.get<FeedbackNotificationSummary>("/feedback/notifications")
        .then((summary) => setFeedbackUnreadCount(summary.unreadReplies))
        .catch(() => setFeedbackUnreadCount(0));
    };

    window.addEventListener("feedback-notifications-updated", refreshFeedbackNotifications);
    window.addEventListener("payment-confirmations-updated", refreshPendingPaymentConfirmations);
    return () => {
      window.removeEventListener("feedback-notifications-updated", refreshFeedbackNotifications);
      window.removeEventListener("payment-confirmations-updated", refreshPendingPaymentConfirmations);
    };
  }, [auth?.accessToken, auth?.isPlatformOwner]);

  const featureKeys = new Set((featureAccess?.featureKeys ?? []).map((key) => key.toLowerCase()));
  const primaryLinks = auth?.isPlatformOwner
    ? [
        ["Dashboard", "/"],
        ["Subscribers", "/subscribers"],
        ["Users", "/platform/users"],
        ["Feedback", "/platform/feedback"],
        ["Email Logs", "/platform/email-logs"],
        ["Audit Logs", "/platform/audit-logs"],
        ["Packages", "/platform/packages"],
        ["Document Preview", "/platform/documents"],
        ["WhatsApp Sessions", "/platform/whatsapp-sessions"],
        ["Settings", "/platform/settings"],
      ]
    : [
        { label: "Dashboard", path: "/", disabled: false, hint: "" },
        { label: "Companies", path: "/companies", disabled: false, hint: "" },
        { label: "Products", path: "/products", disabled: false, hint: "" },
        { label: "Plans", path: "/plans", disabled: false, hint: "" },
        { label: "Customers", path: "/customers", disabled: !featureKeys.has("customer_management"), hint: getFeatureRequirementLabel(featureAccess, "customer_management") },
        { label: "Subscriptions", path: "/subscriptions", disabled: !featureKeys.has("recurring_invoices"), hint: getFeatureRequirementLabel(featureAccess, "recurring_invoices") },
        { label: "Invoices", path: "/invoices", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Payments", path: "/payments", disabled: !featureKeys.has("payment_tracking"), hint: getFeatureRequirementLabel(featureAccess, "payment_tracking") },
        { label: "Finance", path: "/finance", disabled: false, hint: getFeatureRequirementLabel(featureAccess, "finance_exports") },
      ];
  const accountLinks = auth?.isPlatformOwner
    ? []
    : ([
        ["Quick Start", "/help/quick-start"],
        ["Feedback", "/feedback"],
        ["My Plan", "/package-billing"],
        ["Settings", "/settings"],
      ] as const);
  const showFloatingQuickStart = Boolean(auth && !auth.isPlatformOwner && location.pathname !== "/help/quick-start");
  const resolvedPackageStatus = (packageBilling?.packageStatus ?? featureAccess?.packageStatus ?? "").toLowerCase();
  const showBillingReminder = Boolean(
    auth &&
    !auth.isPlatformOwner &&
    location.pathname !== "/package-billing" &&
    ["pending_payment", "grace_period", "past_due"].includes(resolvedPackageStatus),
  );
  const showPaymentConfirmationReminder = Boolean(
    auth &&
    !auth.isPlatformOwner &&
    location.pathname !== "/payments" &&
    pendingPaymentConfirmationCount > 0,
  );

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  }

  function getBillingReminderCopy() {
    if (resolvedPackageStatus === "grace_period" && packageBilling?.gracePeriodEndsAtUtc) {
      return {
        title: "Package payment is still pending",
        body: `Your billing access remains available until ${formatDate(packageBilling.gracePeriodEndsAtUtc)}. Pay your package invoice before then to avoid interruption.`,
        tone: "warning",
      } as const;
    }

    if (resolvedPackageStatus === "past_due") {
      return {
        title: "Package payment is overdue",
        body: "Your account is past due. Open My Plan and pay the package invoice to restore full billing access.",
        tone: "danger",
      } as const;
    }

    return {
      title: "Activate your package",
      body: "Your package invoice is ready. Open My Plan to pay now and complete your billing setup.",
      tone: "warning",
    } as const;
  }

  const billingReminder = showBillingReminder ? getBillingReminderCopy() : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="eyebrow">{auth?.isPlatformOwner ? "Recurvo Platform" : "Recurvo Billing"}</p>
            <h1 className="sidebar-title">{auth?.isPlatformOwner ? "Platform" : "Recurvo"}</h1>
          </div>
        </div>
        <div className="sidebar-account card subtle-card">
          <p>{auth?.isPlatformOwner ? auth?.companyName : auth?.fullName}</p>
          <p className="muted">{auth?.email}</p>
          {auth?.isPlatformOwner ? (
            <p className="muted">Platform owner account</p>
          ) : (
            <>
              <div className="sidebar-account-meta">
                <div className="sidebar-account-meta-row">
                  <span className="sidebar-account-meta-label">Package</span>
                  <strong>{formatPackageLabel(featureAccess?.packageCode)}</strong>
                </div>
                <div className="sidebar-account-meta-row">
                  <span className="sidebar-account-meta-label">Status</span>
                  <span className={`status-pill ${featureAccess?.packageStatus?.toLowerCase() === "active" ? "status-pill-active" : "status-pill-inactive"}`}>
                    {formatStatusLabel(featureAccess?.packageStatus) || "-"}
                  </span>
                </div>
              </div>
              <p className="muted sidebar-account-stat">
                {companyCount === null ? "Billing profiles: -" : `Billing profiles: ${companyCount}`}
              </p>
            </>
          )}
          <p className="sidebar-helper">
            {auth?.isPlatformOwner
              ? "Manage subscriber businesses across the Recurvo platform"
              : "Manage subscriptions, invoices, and payments in one place"}
          </p>
        </div>
        <nav className="nav">
          {auth?.isPlatformOwner
            ? (primaryLinks as string[][]).map(([label, path]) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  {label}
                </NavLink>
              ))
            : (primaryLinks as Array<{ label: string; path: string; disabled: boolean; hint: string }>).map((item) => (
                item.disabled ? (
                  <button
                    key={item.path}
                    type="button"
                    className="nav-link nav-link-disabled"
                    title={item.hint}
                    onClick={() => {}}
                  >
                    {item.label}
                    <span className="nav-link-badge nav-link-badge-muted">{item.hint.replace("Available on ", "")}</span>
                  </button>
                ) : (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  >
                    {item.label}
                    {item.label === "Payments" && pendingPaymentConfirmationCount > 0 ? (
                      <span className="nav-link-badge">{pendingPaymentConfirmationCount}</span>
                    ) : null}
                  </NavLink>
                )
              ))}
        </nav>
        {accountLinks.length > 0 ? (
          <div className="sidebar-section">
            <p className="sidebar-section-label">Account</p>
            <nav className="nav nav-secondary">
              {accountLinks.map(([label, path]) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  {label}
                  {label === "Feedback" && feedbackUnreadCount > 0 ? (
                    <span className="nav-link-badge">{feedbackUnreadCount}</span>
                  ) : null}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : null}
        <div className="sidebar-signout">
          <button
            className="button button-secondary"
            onClick={() => setShowSignOutConfirm(true)}
          >
            Sign out
          </button>
        </div>
        <div className="sidebar-footer">
          <Link className="inline-link" to="/privacy" state={{ backgroundLocation: location }}>Privacy</Link>
          <Link className="inline-link" to="/support" state={{ backgroundLocation: location }}>Support</Link>
          <Link className="inline-link" to="/terms" state={{ backgroundLocation: location }}>Terms</Link>
        </div>
      </aside>
      <main className="content">
        {billingReminder ? (
          <section className={`billing-reminder-banner billing-reminder-banner-${billingReminder.tone}`}>
            <div>
              <p className="eyebrow">Account reminder</p>
              <h3>{billingReminder.title}</h3>
              <p>{billingReminder.body}</p>
            </div>
            <button
              type="button"
              className="button"
              onClick={() => navigate("/package-billing")}
            >
              View my plan
            </button>
          </section>
        ) : null}
        {showPaymentConfirmationReminder ? (
          <section className="billing-reminder-banner billing-reminder-banner-warning">
            <div>
              <p className="eyebrow">Payment confirmation</p>
              <h3>Customer payment confirmation needs review</h3>
              <p>
                {pendingPaymentConfirmationCount === 1
                  ? "1 payment confirmation is waiting for approval."
                  : `${pendingPaymentConfirmationCount} payment confirmations are waiting for approval.`}
              </p>
            </div>
            <button
              type="button"
              className="button"
              onClick={() => navigate("/payments")}
            >
              Review payments
            </button>
          </section>
        ) : null}
        <Outlet />
      </main>
      {showFloatingQuickStart ? (
        <button
          type="button"
          className="quickstart-float-button"
          onClick={() => navigate("/help/quick-start")}
        >
          <span className="quickstart-float-kicker">Quick Start</span>
          {pendingSetupCount && pendingSetupCount > 0 ? (
            <strong>{pendingSetupCount}</strong>
          ) : null}
        </button>
      ) : null}
      <ConfirmModal
        open={showSignOutConfirm}
        title="Sign out"
        description="Sign out of your current Recurvo session?"
        confirmLabel="Sign out"
        onConfirm={() => {
          setAuth(null);
          setShowSignOutConfirm(false);
          navigate("/login");
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </div>
  );
}
