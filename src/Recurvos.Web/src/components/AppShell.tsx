import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { ConfirmModal } from "./ConfirmModal";
import { InstallPromptCard } from "./InstallPromptCard";
import { api } from "../lib/api";
import { getActiveCompanyId, getAuth, setActiveCompanyId, setAuth } from "../lib/auth";
import { hasFeature } from "../lib/features";
import { useInstallPromptState } from "../hooks/useInstallPromptState";
import { isStandalonePwa } from "../lib/pwa";
import type { BillingReadiness, CompanyLookup, FeatureAccess, FeedbackNotificationSummary, SubscriberPackageBillingSummary } from "../types";

type NavEntry = {
  label: string;
  path: string;
  icon: string;
  disabled?: boolean;
  hint?: string;
  activePrefixes?: string[];
  isActive?: (pathname: string, hash: string) => boolean;
  badgeKey?: "payments" | "feedback";
};

type NavSection = {
  title: string;
  items?: NavEntry[];
  groups?: NavGroup[];
};

type NavGroup = {
  key: string;
  label: string;
  icon: string;
  items: NavEntry[];
  activePrefixes?: string[];
};

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

function getCompanyInitials(name?: string | null) {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.slice(0, 2).map((word) => word.charAt(0)).join("") || "R").toUpperCase();
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

function getFeatureRequirementLabel(featureAccess: FeatureAccess | null, featureKey: string) {
  const requirement = featureAccess?.featureRequirements?.find((item) => item.featureKey === featureKey);
  return requirement ? `Available on ${requirement.packageName}` : "Upgrade required";
}

function getSubscribedPackageLabel(featureAccess: FeatureAccess | null) {
  return featureAccess?.packageCode ? formatPackageLabel(featureAccess.packageCode) : "Upgrade";
}

type CrudPageTitle = {
  path: string;
  list: string;
  singular: string;
  detail?: string;
};

const tenantCrudPageTitles: CrudPageTitle[] = [
  { path: "/companies", list: "Companies", singular: "company", detail: "Company details" },
  { path: "/customers", list: "Contacts", singular: "contact", detail: "Contact details" },
  { path: "/products", list: "Products", singular: "product", detail: "Product details" },
  { path: "/plans", list: "Product plans", singular: "product plan", detail: "Product plan details" },
  { path: "/subscriptions", list: "Subscriptions", singular: "subscription", detail: "Subscription details" },
  { path: "/sales/quotations", list: "Sales quotations", singular: "sales quotation", detail: "Sales quotation details" },
  { path: "/sales/orders", list: "Sales orders", singular: "sales order", detail: "Sales order details" },
  { path: "/sales/delivery-orders", list: "Delivery orders", singular: "delivery order", detail: "Delivery order details" },
  { path: "/purchases/orders", list: "Purchase orders", singular: "purchase order", detail: "Purchase order details" },
  { path: "/purchases/grns", list: "Goods received notes", singular: "goods received note", detail: "Goods received note details" },
  { path: "/purchases/bills", list: "Purchase bills", singular: "purchase bill", detail: "Purchase bill details" },
  { path: "/purchases/payments", list: "Purchase payments", singular: "purchase payment", detail: "Purchase payment details" },
  { path: "/purchases/credit-notes", list: "Purchase credit notes", singular: "purchase credit note", detail: "Purchase credit note details" },
  { path: "/purchases/refunds", list: "Purchase refunds", singular: "purchase refund", detail: "Purchase refund details" },
  { path: "/finance/journal-entries", list: "Journal entries", singular: "journal entry", detail: "Journal entry details" },
];

const foundationCrudPageTitles: CrudPageTitle[] = [
  { path: "/foundation/chart-of-accounts", list: "Chart of accounts", singular: "account", detail: "Account details" },
  { path: "/foundation/tax-codes", list: "Tax codes", singular: "tax code", detail: "Tax code details" },
  { path: "/foundation/payment-terms", list: "Payment terms", singular: "payment term", detail: "Payment term details" },
  { path: "/foundation/warehouses", list: "Warehouses", singular: "warehouse", detail: "Warehouse details" },
  { path: "/foundation/currencies", list: "Currencies", singular: "currency", detail: "Currency details" },
  { path: "/foundation/product-categories", list: "Product categories", singular: "product category", detail: "Product category details" },
  { path: "/foundation/price-levels", list: "Price levels", singular: "price level", detail: "Price level details" },
];

function getCrudPageTitle(pathname: string, page: CrudPageTitle) {
  if (pathname === page.path) return page.list;
  if (pathname === `${page.path}/new`) return `Create ${page.singular}`;
  if (new RegExp(`^${page.path}/[^/]+/edit$`).test(pathname)) return `Edit ${page.singular}`;
  if (new RegExp(`^${page.path}/[^/]+$`).test(pathname)) return page.detail ?? page.singular;
  return null;
}

function getWorkspacePageTitle(pathname: string, isPlatformOwner: boolean) {
  if (pathname === "/" || pathname === "" || pathname === "/app") {
    return "Dashboard";
  }

  if (isPlatformOwner) {
    if (pathname.startsWith("/subscribers")) return "Subscribers";
    if (pathname.startsWith("/platform/users")) return "Users";
    if (pathname.startsWith("/platform/feedback")) return "Feedback";
    if (pathname.startsWith("/platform/email-logs")) return "Email Logs";
    if (pathname.startsWith("/platform/audit-logs")) return "Audit Logs";
    if (pathname.startsWith("/platform/packages")) return "Packages";
    if (pathname.startsWith("/platform/documents")) return "Document Preview";
    if (pathname.startsWith("/platform/whatsapp-sessions")) return "WhatsApp Sessions";
    if (pathname.startsWith("/platform/account-billing-rollout")) return "Account billing rollout";
    if (pathname.startsWith("/platform/settings")) return "Settings";
    return "Platform";
  }

  if (pathname === "/products/batch-update") return "Batch update products";
  if (pathname === "/products/import") return "Import products";
  if (pathname === "/customers/import") return "Import contacts";
  if (/^\/customers\/[^/]+\/statement(?:\/|$)/.test(pathname)) return "Statement of account";

  for (const page of tenantCrudPageTitles) {
    const title = getCrudPageTitle(pathname, page);
    if (title) return title;
  }

  for (const page of foundationCrudPageTitles) {
    const title = getCrudPageTitle(pathname, page);
    if (title) return title;
  }

  if (pathname === "/sales/invoices/new") return "Create sales invoice";
  if (pathname.startsWith("/sales/invoices")) return "Sales invoices";
  if (pathname.startsWith("/contact-groups")) return "Contact groups";
  if (pathname.startsWith("/product-groups")) return "Product groups";
  if (pathname.startsWith("/invoices")) return "Invoices";
  if (pathname.startsWith("/credit-notes")) return "Credit Notes";
  if (pathname.startsWith("/refunds")) return "Refunds";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/foundation")) return "Foundation";
  if (pathname.startsWith("/settings/master-data")) return "Master data";
  if (pathname.startsWith("/whatsapp-messages")) return "Notification history";
  if (pathname.startsWith("/finance/general-ledger")) return "General ledger";
  if (pathname.startsWith("/finance/trial-balance")) return "Trial balance";
  if (pathname.startsWith("/finance/profit-and-loss")) return "Profit and loss";
  if (pathname.startsWith("/finance/balance-sheet")) return "Balance sheet";
  if (pathname.startsWith("/finance/cash-flow")) return "Cash flow";
  if (pathname.startsWith("/finance")) return "Finance";
  if (pathname.startsWith("/feedback")) return "Feedback";
  if (pathname.startsWith("/package-billing")) return "My Plan";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/help/quick-start")) return "Quick start";
  return "Workspace";
}

function matchesPrefix(pathname: string, prefix: string) {
  return prefix === "/"
    ? pathname === "/"
    : pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getPathnameFromTarget(path: string) {
  try {
    return new URL(path, "https://recurvos.local").pathname;
  } catch {
    return path;
  }
}

function getHashFromTarget(path: string) {
  try {
    return new URL(path, "https://recurvos.local").hash;
  } catch {
    return "";
  }
}

function isNavEntryActive(entry: NavEntry, pathname: string, hash: string) {
  if (entry.isActive) {
    return entry.isActive(pathname, hash);
  }

  if (entry.activePrefixes?.some((prefix) => matchesPrefix(pathname, prefix))) {
    return true;
  }

  const targetPathname = getPathnameFromTarget(entry.path);
  const targetHash = getHashFromTarget(entry.path);

  if (targetHash) {
    return pathname === targetPathname && hash === targetHash;
  }

  return matchesPrefix(pathname, targetPathname);
}

function isNavGroupActive(group: NavGroup, pathname: string, hash: string) {
  return group.items.some((item) => isNavEntryActive(item, pathname, hash))
    || group.activePrefixes?.some((prefix) => matchesPrefix(pathname, prefix))
    || false;
}

function renderNavIcon(icon: string) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "dashboard":
      return (
        <svg {...commonProps}>
          <path d="M4 13.5h7V20H4z" />
          <path d="M13 4h7v6.5h-7z" />
          <path d="M13 13.5h7V20h-7z" />
          <path d="M4 4h7v7.5H4z" />
        </svg>
      );
    case "company":
      return (
        <svg {...commonProps}>
          <path d="M4 20h16" />
          <path d="M6 20V7l6-3 6 3v13" />
          <path d="M9 10h.01" />
          <path d="M15 10h.01" />
          <path d="M9 14h.01" />
          <path d="M15 14h.01" />
        </svg>
      );
    case "box":
      return (
        <svg {...commonProps}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m12 12 8-4.5" />
          <path d="m12 12-8-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
    case "list":
      return (
        <svg {...commonProps}>
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <path d="M4 6h.01" />
          <path d="M4 12h.01" />
          <path d="M4 18h.01" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "repeat":
      return (
        <svg {...commonProps}>
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a3 3 0 0 1 3-3h15" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...commonProps}>
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v4h4" />
          <path d="M10 12h6" />
          <path d="M10 16h6" />
        </svg>
      );
    case "payment":
      return (
        <svg {...commonProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h3" />
        </svg>
      );
    case "finance":
      return (
        <svg {...commonProps}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-4" />
        </svg>
      );
    case "rocket":
      return (
        <svg {...commonProps}>
          <path d="M5 19c2.5-.5 4-2 4.5-4.5L18 6c-2.5-.5-4.5 0-6 1.5L8.5 11C7 12.5 6.5 14.5 6 17Z" />
          <path d="m13 11 3 3" />
          <path d="M6 17 4 19" />
        </svg>
      );
    case "message":
      return (
        <svg {...commonProps}>
          <path d="M4 6h16v10H8l-4 4z" />
          <path d="M8 10h8" />
          <path d="M8 13h5" />
        </svg>
      );
    case "plan":
      return (
        <svg {...commonProps}>
          <path d="M4 8h16" />
          <path d="M4 12h16" />
          <path d="M4 16h10" />
          <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5z" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case "document":
      return (
        <svg {...commonProps}>
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v4h4" />
          <path d="M10 12h6" />
          <path d="M10 16h4" />
        </svg>
      );
    case "phone":
      return (
        <svg {...commonProps}>
          <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
          <path d="M11 17h2" />
          <path d="M9 7h6" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      );
  }
}

export function AppShell() {
  const auth = getAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const contentBodyRef = useRef<HTMLDivElement | null>(null);
  const appbarRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [packageBilling, setPackageBilling] = useState<SubscriberPackageBillingSummary | null>(null);
  const [companyCount, setCompanyCount] = useState<number | null>(null);
  const [workspaceCompanies, setWorkspaceCompanies] = useState<CompanyLookup[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState(getActiveCompanyId() ?? auth?.companyId ?? "");
  const [pendingSetupCount, setPendingSetupCount] = useState<number | null>(null);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
  const [pendingPaymentConfirmationCount, setPendingPaymentConfirmationCount] = useState(0);
  const installPrompt = useInstallPromptState(location.pathname);

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    contentBodyRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useLayoutEffect(() => {
    const appbar = appbarRef.current;
    if (!appbar) return;
    const updateHeight = () => document.documentElement.style.setProperty("--app-header-height", `${appbar.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(appbar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-height");
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 960) {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");

    const syncStandaloneClass = () => {
      document.body.classList.toggle("app-pwa-standalone", isStandalonePwa());
    };

    syncStandaloneClass();

    mediaQuery.addEventListener("change", syncStandaloneClass);
    return () => {
      mediaQuery.removeEventListener("change", syncStandaloneClass);
      document.body.classList.remove("app-pwa-standalone");
    };
  }, []);

  useEffect(() => {
    if (!auth || auth.isPlatformOwner) {
      return;
    }

    let cancelled = false;

    // The navigation shell only needs entitlements immediately.  Everything
    // else is independent and deliberately loads in the background.
    void api.get<FeatureAccess>("/settings/feature-access")
      .then((access) => {
        if (cancelled) return;
        setFeatureAccess(access);
        if (access.featureKeys.some((key) => key.toLowerCase() === "public_payment_confirmation")) {
          void api.get<{ count: number }>("/payment-confirmations/pending-count")
            .then((result) => !cancelled && setPendingPaymentConfirmationCount(result.count))
            .catch(() => !cancelled && setPendingPaymentConfirmationCount(0));
        }
      })
      .catch(() => !cancelled && setFeatureAccess(null));

    void Promise.all([
      api.get<SubscriberPackageBillingSummary>("/package-billing").catch(() => null),
      api.get<FeedbackNotificationSummary>("/feedback/notifications").catch(() => null),
    ]).then(([billing, feedbackSummary]) => {
      if (cancelled) return;
      setPackageBilling(billing);
      setFeedbackUnreadCount(feedbackSummary?.unreadReplies ?? 0);
    });

    return () => { cancelled = true; };
  }, [auth?.accessToken, auth?.isPlatformOwner]);

  useEffect(() => {
    if (!auth || auth.isPlatformOwner) return;
    let cancelled = false;
    void api.get<CompanyLookup[]>("/companies").then((companies) => {
      if (cancelled) return;
      setWorkspaceCompanies(companies);
      const selected = companies.some((company) => company.id === activeCompanyId)
        ? activeCompanyId
        : (companies.find((company) => company.id === auth.companyId)?.id ?? companies[0]?.id ?? "");
      if (selected && selected !== activeCompanyId) {
        setActiveCompanyId(selected);
        setActiveCompanyIdState(selected);
      }
    });
    return () => { cancelled = true; };
  }, [auth?.accessToken, auth?.companyId, auth?.isPlatformOwner]);

  function switchCompany(companyId: string) {
    if (!companyId || companyId === activeCompanyId) return;
    setActiveCompanyId(companyId);
    setActiveCompanyIdState(companyId);
    setAccountMenuOpen(false);

    // A company edit URL names a specific record. Keep the workspace picker and
    // the record being edited in sync instead of leaving the previous company
    // visible after the active workspace changes.
    if (/^\/companies\/[^/]+\/edit$/.test(location.pathname)) {
      navigate(`/companies/${companyId}/edit`, { replace: true });
      return;
    }

    navigate("/app", { replace: true });
  }

  useEffect(() => {
    if (!auth || auth.isPlatformOwner) return;
    const shouldLoadCompanySummary = location.pathname === "/app" || location.pathname.startsWith("/companies") || location.pathname.startsWith("/help/quick-start");
    if (!shouldLoadCompanySummary) return;

    let cancelled = false;
    void api.get<CompanyLookup[]>("/companies").then(async (companies) => {
      if (cancelled) return;
      setCompanyCount(companies.length);
      const companyId = companies.find((company) => company.id === activeCompanyId)?.id
        ?? companies.find((company) => company.id === auth.companyId)?.id
        ?? companies[0]?.id;
      if (!companyId) return;
      const readiness = await api.get<BillingReadiness>(`/settings/billing-readiness?companyId=${companyId}`).catch(() => null);
      if (!cancelled) setPendingSetupCount(readiness ? readiness.items.filter((item) => !item.done).length : null);
    }).catch(() => !cancelled && setCompanyCount(null));
    return () => { cancelled = true; };
  }, [activeCompanyId, auth?.companyId, auth?.isPlatformOwner, location.pathname]);

  useEffect(() => {
    if (!auth || auth.isPlatformOwner) {
      return;
    }

    const paymentConfirmationsEnabled = hasFeature(featureAccess, "public_payment_confirmation");

    const refreshPendingPaymentConfirmations = () => {
      if (!paymentConfirmationsEnabled) {
        setPendingPaymentConfirmationCount(0);
        return;
      }

      void api.get<{ count: number }>("/payment-confirmations/pending-count")
        .then((result) => setPendingPaymentConfirmationCount(result.count))
        .catch(() => setPendingPaymentConfirmationCount(0));
    };

    const refreshFeedbackNotifications = () => {
      void api.get<FeedbackNotificationSummary>("/feedback/notifications")
        .then((summary) => setFeedbackUnreadCount(summary.unreadReplies))
        .catch(() => setFeedbackUnreadCount(0));
    };

    window.addEventListener("feedback-notifications-updated", refreshFeedbackNotifications);
    if (paymentConfirmationsEnabled) {
      window.addEventListener("payment-confirmations-updated", refreshPendingPaymentConfirmations);
    }
    return () => {
      window.removeEventListener("feedback-notifications-updated", refreshFeedbackNotifications);
      window.removeEventListener("payment-confirmations-updated", refreshPendingPaymentConfirmations);
    };
  }, [auth?.accessToken, auth?.isPlatformOwner, featureAccess?.featureKeys]);

  const featureKeys = new Set((featureAccess?.featureKeys ?? []).map((key) => key.toLowerCase()));
  const primaryLinks = auth?.isPlatformOwner
    ? [
        { label: "Dashboard", path: "/", icon: "dashboard" },
        { label: "Subscribers", path: "/subscribers", icon: "users" },
        { label: "Users", path: "/platform/users", icon: "users" },
        { label: "Feedback", path: "/platform/feedback", icon: "message" },
        { label: "Email Logs", path: "/platform/email-logs", icon: "mail" },
        { label: "Audit Logs", path: "/platform/audit-logs", icon: "list" },
        { label: "Billing Rollout", path: "/platform/account-billing-rollout", icon: "plan" },
        { label: "Packages", path: "/platform/packages", icon: "plan" },
        { label: "Document Preview", path: "/platform/documents", icon: "document" },
        { label: "WhatsApp Sessions", path: "/platform/whatsapp-sessions", icon: "phone" },
        { label: "Settings", path: "/platform/settings", icon: "settings" },
      ]
    : [];
  const tenantMainLinks: NavEntry[] = auth?.isPlatformOwner
    ? []
    : [
        { label: "Dashboard", path: "/", icon: "dashboard", disabled: false, hint: "" },
        { label: "Companies", path: "/companies", icon: "company", disabled: false, hint: "" },
        {
          label: "Contacts",
          path: "/customers",
          icon: "users",
          disabled: false,
          hint: "",
          isActive: (pathname) => matchesPrefix(pathname, "/customers") && !/^\/customers\/[^/]+\/statement(?:\/|$)/.test(pathname),
        },
        { label: "Products", path: "/products", icon: "box", disabled: false, hint: "" },
        { label: "Plans", path: "/plans", icon: "plan", disabled: false, hint: "" },
      ];
  const tenantSalesLinks: NavEntry[] = auth?.isPlatformOwner
    ? []
    : [
        { label: "Quotations", path: "/sales/quotations", icon: "document", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Sales Orders", path: "/sales/orders", icon: "list", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Delivery Orders", path: "/sales/delivery-orders", icon: "box", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        {
          label: "Invoices",
          path: "/invoices",
          icon: "invoice",
          disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")),
          hint: getFeatureRequirementLabel(featureAccess, "manual_invoices"),
          isActive: (pathname) => matchesPrefix(pathname, "/invoices") || matchesPrefix(pathname, "/sales/invoices"),
        },
        { label: "Credit Notes", path: "/credit-notes", icon: "document", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        {
          label: "Payments",
          path: "/payments",
          icon: "payment",
          disabled: !featureKeys.has("payment_tracking"),
          hint: getFeatureRequirementLabel(featureAccess, "payment_tracking"),
          badgeKey: "payments",
        },
        { label: "Refunds", path: "/refunds", icon: "finance", disabled: !featureKeys.has("payment_tracking"), hint: getFeatureRequirementLabel(featureAccess, "payment_tracking") },
      ];
  const tenantPurchaseLinks: NavEntry[] = auth?.isPlatformOwner
    ? []
    : [
        { label: "Purchase Orders", path: "/purchases/orders", icon: "document", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Goods Received Notes", path: "/purchases/grns", icon: "box", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Bills", path: "/purchases/bills", icon: "invoice", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Credit Notes", path: "/purchases/credit-notes", icon: "document", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Payments", path: "/purchases/payments", icon: "payment", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
        { label: "Refunds", path: "/purchases/refunds", icon: "finance", disabled: !(featureKeys.has("manual_invoices") || featureKeys.has("recurring_invoices")), hint: getFeatureRequirementLabel(featureAccess, "manual_invoices") },
      ];
  const accountLinks = auth?.isPlatformOwner
    ? []
    : ([
        { label: "Quick Start", path: "/help/quick-start", icon: "rocket" },
        { label: "Feedback", path: "/feedback", icon: "message", badgeKey: "feedback" },
        { label: "My Plan", path: "/package-billing", icon: "plan" },
        { label: "Settings", path: "/settings", icon: "settings" },
        { label: "Notification History", path: "/whatsapp-messages", icon: "mail" },
      ] satisfies NavEntry[]);
  const financeLinks: NavEntry[] = auth?.isPlatformOwner
    ? []
    : [
        { label: "Journal Entries", path: "/finance/journal-entries", icon: "finance", disabled: false, hint: "" },
        { label: "General Ledger", path: "/finance/general-ledger", icon: "list", disabled: false, hint: "" },
        { label: "Trial Balance", path: "/finance/trial-balance", icon: "finance", disabled: false, hint: "" },
        { label: "Profit & Loss", path: "/finance/profit-and-loss", icon: "finance", disabled: false, hint: "" },
        { label: "Balance Sheet", path: "/finance/balance-sheet", icon: "finance", disabled: false, hint: "" },
        { label: "Cash Flow", path: "/finance/cash-flow", icon: "finance", disabled: false, hint: "" },
        {
          label: "Statement of Account",
          path: "/finance/statements",
          icon: "finance",
          disabled: !featureKeys.has("customer_management"),
          hint: getFeatureRequirementLabel(featureAccess, "customer_management"),
          isActive: (pathname) => pathname === "/finance/statements" || /^\/customers\/[^/]+\/statement(?:\/|$)/.test(pathname),
        },
        { label: "AR Aging", path: "/finance#ar-aging", icon: "finance", disabled: false, hint: getFeatureRequirementLabel(featureAccess, "finance_exports") },
        { label: "AP Aging", path: "/finance#ap-aging", icon: "finance", disabled: false, hint: getFeatureRequirementLabel(featureAccess, "finance_exports") },
      ];
  const foundationLinks: NavEntry[] = auth?.isPlatformOwner
    ? []
    : [
        { label: "Chart of Accounts", path: "/foundation/chart-of-accounts", icon: "finance" },
        { label: "Tax Codes", path: "/foundation/tax-codes", icon: "document" },
        { label: "Payment Terms", path: "/foundation/payment-terms", icon: "payment" },
        { label: "Warehouses", path: "/foundation/warehouses", icon: "box" },
        { label: "Currencies", path: "/foundation/currencies", icon: "invoice" },
        { label: "Price Levels", path: "/foundation/price-levels", icon: "plan" },
      ];
  const showFloatingQuickStart = Boolean(auth && !auth.isPlatformOwner && location.pathname !== "/help/quick-start");
  const resolvedPackageStatus = (packageBilling?.packageStatus ?? featureAccess?.packageStatus ?? "").toLowerCase();
  const showBillingReminder = Boolean(
    auth &&
    !auth.isPlatformOwner &&
    location.pathname !== "/package-billing" &&
    ["pending_payment", "grace_period", "past_due", "upgrade_pending_payment", "reactivation_pending_payment"].includes(resolvedPackageStatus),
  );
  const showPaymentConfirmationReminder = Boolean(
    auth &&
    !auth.isPlatformOwner &&
    location.pathname !== "/payments" &&
    pendingPaymentConfirmationCount > 0,
  );
  const showInstallPrompt = Boolean(
    auth &&
    !auth.isPlatformOwner &&
    ["/", "/settings", "/help/quick-start"].includes(location.pathname) &&
    installPrompt.shouldShowPrompt,
  );
  const currentPageLabel = getWorkspacePageTitle(location.pathname, auth?.isPlatformOwner ?? false);
  const navSections: NavSection[] = auth?.isPlatformOwner
    ? [
        { title: "Main", items: [{ label: "Dashboard", path: "/", icon: "dashboard" }, { label: "Subscribers", path: "/subscribers", icon: "users" }] },
        { title: "Platform", items: (primaryLinks as NavEntry[]).filter((item) => !["Dashboard", "Subscribers"].includes(item.label)) },
      ]
    : [
        { title: "Main", items: tenantMainLinks },
        { title: "Sales", groups: [{ key: "sales", label: "Sales", icon: "invoice", items: tenantSalesLinks, activePrefixes: ["/sales", "/invoices", "/credit-notes", "/payments", "/refunds"] }] },
        { title: "Purchases", groups: [{ key: "purchases", label: "Purchases", icon: "document", items: tenantPurchaseLinks, activePrefixes: ["/purchases"] }] },
        { title: "Finance", groups: [{ key: "finance", label: "Finance", icon: "finance", items: financeLinks, activePrefixes: ["/finance"] }] },
        { title: "Foundation", groups: [{ key: "foundation", label: "Foundation", icon: "list", items: foundationLinks, activePrefixes: ["/foundation"] }] },
        { title: "Account", items: accountLinks },
      ];

  useEffect(() => {
    if (auth?.isPlatformOwner) {
      return;
    }

    const activeGroupKeys = [
      (location.pathname.startsWith("/sales") || location.pathname.startsWith("/invoices") || location.pathname.startsWith("/payments")) && "sales",
      location.pathname.startsWith("/purchases") && "purchases",
      (location.pathname.startsWith("/finance") || /^\/customers\/[^/]+\/statement(?:\/|$)/.test(location.pathname) || (location.pathname === "/customers" && location.hash === "#statement-of-account")) && "finance",
      location.pathname.startsWith("/foundation") && "foundation",
    ].filter((key): key is string => Boolean(key));

    setExpandedGroups((current) => {
      const next = { ...current };
      let changed = false;

      for (const key of activeGroupKeys) {
        if (!next[key]) {
          next[key] = true;
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length > 0) {
        return current;
      }

      if (!changed && activeGroupKeys.length === 0) {
        return current;
      }

      return next;
    });
  }, [auth?.isPlatformOwner, location.hash, location.pathname]);

  function toggleGroup(groupKey: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  }

  function renderNavItem(item: NavEntry, compact = false) {
    const active = isNavEntryActive(item, location.pathname, location.hash);
    const badgeCount = item.badgeKey === "payments"
      ? pendingPaymentConfirmationCount
      : item.badgeKey === "feedback"
        ? feedbackUnreadCount
        : 0;

    if (item.disabled) {
      return (
        <button
          key={item.path}
          type="button"
          className={`nav-link nav-link-disabled${compact ? " nav-link-compact" : ""}`}
          title={item.hint}
          onClick={() => {}}
        >
          <span className="nav-link-main">
            <span className="nav-link-icon">{renderNavIcon(item.icon)}</span>
            <span>{item.label}</span>
          </span>
          <span className="nav-link-badge nav-link-badge-muted">{getSubscribedPackageLabel(featureAccess)}</span>
        </button>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        className={`nav-link ${active ? "active" : ""}${compact ? " nav-link-compact" : ""}`}
        onClick={() => setMobileNavOpen(false)}
      >
        <span className="nav-link-main">
          <span className="nav-link-icon">{renderNavIcon(item.icon)}</span>
          <span>{item.label}</span>
        </span>
        {badgeCount > 0 ? <span className="nav-link-badge">{badgeCount}</span> : null}
      </Link>
    );
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  }

  function getBillingReminderCopy() {
    if (resolvedPackageStatus === "grace_period" && packageBilling?.gracePeriodEndsAtUtc) {
      const countdown = getGracePeriodCountdown(packageBilling.gracePeriodEndsAtUtc);
      return {
        title: "Package payment is still pending",
        body: `Your billing access remains available until ${formatDate(packageBilling.gracePeriodEndsAtUtc)}. ${countdown ?? "Pay your package invoice before then to avoid interruption."}`,
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

    if (resolvedPackageStatus === "upgrade_pending_payment" && packageBilling?.pendingUpgradePackageName) {
      return {
        title: "Package upgrade is waiting for payment",
        body: `Your current package stays active until you pay the upgrade invoice for ${packageBilling.pendingUpgradePackageName}.`,
        tone: "warning",
      } as const;
    }

    if (resolvedPackageStatus === "reactivation_pending_payment") {
      return {
        title: "Reactivation invoice is waiting for payment",
        body: "Your account remains restricted until the reactivation invoice is paid.",
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
  const activeCompany = workspaceCompanies.find((company) => company.id === activeCompanyId);
  const activeCompanyName = activeCompany?.name ?? auth?.companyName ?? "Company";
  const closeAccountMenu = () => setAccountMenuOpen(false);

  const renderAccountDropdown = () => (
    <div className="desktop-account-dropdown" role="menu" aria-label="Account and workspace menu">
      <div className="desktop-account-dropdown-header">
        <div className="desktop-account-dropdown-avatar">
          {(auth?.fullName ?? auth?.companyName ?? "R").slice(0, 1).toUpperCase()}
        </div>
        <div className="desktop-account-dropdown-copy">
          <strong>{auth?.isPlatformOwner ? auth?.companyName : auth?.fullName}</strong>
          <span>{auth?.email}</span>
        </div>
      </div>
      {auth?.isPlatformOwner ? (
        <p className="desktop-account-dropdown-note">Platform owner account</p>
      ) : (
        <>
          <div className="desktop-account-dropdown-section workspace-menu-section">
            <p className="desktop-account-dropdown-section-label">Workspace</p>
            <div className="workspace-menu-list" role="group" aria-label="Available workspaces">
              {workspaceCompanies.map((company) => {
                const isActive = company.id === activeCompanyId;
                return (
                  <button
                    key={company.id}
                    type="button"
                    className={`workspace-menu-row ${isActive ? "workspace-menu-row-active" : ""}`}
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => switchCompany(company.id)}
                  >
                    <span className="workspace-menu-avatar" aria-hidden="true">{getCompanyInitials(company.name)}</span>
                    <span className="workspace-menu-copy">
                      <strong title={company.name}>{company.name}</strong>
                      {isActive ? <span>Current workspace</span> : null}
                    </span>
                    {isActive ? <span className="workspace-menu-check" aria-label="Current workspace">✓</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="workspace-menu-actions">
              <Link role="menuitem" to="/companies/new" onClick={closeAccountMenu}>+ Create company</Link>
              <Link role="menuitem" to="/companies" onClick={closeAccountMenu}>Manage companies</Link>
            </div>
          </div>
          <div className="desktop-account-dropdown-section desktop-account-dropdown-billing">
            <p className="desktop-account-dropdown-stat">
              {companyCount === null ? "Billing profiles: -" : `Billing profiles: ${companyCount}`}
            </p>
            <Link className="desktop-account-dropdown-billing-link" role="menuitem" to="/package-billing" onClick={closeAccountMenu}>
              Manage invoices and payments
            </Link>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="app-shell">
      <div
        className={`sidebar-backdrop ${mobileNavOpen ? "is-visible" : ""}`}
        aria-hidden={mobileNavOpen ? "false" : "true"}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <BrandLogo className="sidebar-brand-logo" />
        </div>
        <button
          type="button"
          className="sidebar-mobile-close"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        >
          Close
        </button>
        <div className="sidebar-account">
          <div className="sidebar-user-panel">
            <div className="sidebar-user-avatar">
              {(auth?.fullName ?? auth?.companyName ?? "R").slice(0, 1).toUpperCase()}
            </div>
            <div className="sidebar-user-copy">
              <p className="sidebar-user-name">{auth?.isPlatformOwner ? auth?.companyName : auth?.fullName}</p>
              <p className="muted">{auth?.email}</p>
            </div>
          </div>
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
              ? "Manage subscriber businesses across the Recurvos platform"
              : "Manage invoices and payments in one place"}
          </p>
        </div>
        <div className="sidebar-scroll-nav">
          {navSections.map((section) => (
            (section.items?.length || section.groups?.length) ? (
              <div key={section.title} className="sidebar-section">
                {section.items?.length ? (
                  <nav className="nav nav-secondary">
                    {section.items.map((item) => renderNavItem(item))}
                  </nav>
                ) : null}
                {section.groups?.length ? (
                  <div className="sidebar-group-stack">
                    {section.groups.map((group) => {
                      const groupActive = isNavGroupActive(group, location.pathname, location.hash);
                      const expanded = expandedGroups[group.key] ?? groupActive;

                      return (
                        <div key={group.key} className={`sidebar-parent-group ${groupActive ? "sidebar-parent-group-active" : ""}`}>
                          <button
                            type="button"
                            className={`sidebar-parent-trigger ${groupActive ? "sidebar-parent-trigger-active" : ""}`}
                            aria-expanded={expanded}
                            onClick={() => toggleGroup(group.key)}
                          >
                            <span className="nav-link-main">
                              <span className="nav-link-icon">{renderNavIcon(group.icon)}</span>
                              <span>{group.label}</span>
                            </span>
                            <span className={`sidebar-parent-caret ${expanded ? "sidebar-parent-caret-open" : ""}`} aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </span>
                          </button>
                          {expanded ? (
                            <nav className="nav nav-secondary sidebar-child-nav">
                              {group.items.map((item) => renderNavItem(item, true))}
                            </nav>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null
          ))}
        </div>
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
        <div ref={appbarRef} className="appbar-stack">
        <div ref={accountMenuRef} className="account-menu-region">
        <header className="mobile-appbar">
          <button
            type="button"
            className="mobile-appbar-menu"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="mobile-appbar-copy">
            <p className="eyebrow">{auth?.isPlatformOwner ? "Recurvos Platform" : "Recurvos Account"}</p>
            <h1>{currentPageLabel}</h1>
            <span className="mobile-appbar-subtitle">{auth?.isPlatformOwner ? auth?.companyName : auth?.companyName ?? "Account"}</span>
          </div>
          <div className="mobile-appbar-account-menu">
            <button
              type="button"
              className="mobile-appbar-account"
              onClick={() => setAccountMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label="Open account and workspace menu"
            >
              {getCompanyInitials(activeCompanyName)}
            </button>
            {accountMenuOpen ? renderAccountDropdown() : null}
          </div>
        </header>
        <header className="desktop-appbar">
          <div className="desktop-appbar-left">
            <div className="desktop-appbar-title-block">
              <p className="desktop-appbar-kicker">{auth?.isPlatformOwner ? "Platform Workspace" : "Billing Workspace"}</p>
              <h1 className="desktop-appbar-title">{currentPageLabel}</h1>
            </div>
          </div>
          <div className="desktop-appbar-right">
            <div className="desktop-appbar-user-menu">
              <button
                type="button"
                className={`desktop-appbar-user-chip ${accountMenuOpen ? "desktop-appbar-user-chip-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
              >
                <div className="desktop-appbar-user-avatar">
                  {getCompanyInitials(activeCompanyName)}
                </div>
                <div className="desktop-appbar-user-copy">
                  <strong title={activeCompanyName}>{auth?.isPlatformOwner ? auth?.companyName : activeCompanyName}</strong>
                  <span>{auth?.isPlatformOwner ? "Platform Owner" : auth?.fullName}</span>
                </div>
                <span className={`desktop-appbar-user-caret ${accountMenuOpen ? "desktop-appbar-user-caret-open" : ""}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
              {accountMenuOpen ? renderAccountDropdown() : null}
            </div>
          </div>
        </header>
        </div>
        </div>
        <div ref={contentBodyRef} className="content-body">
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
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate("/package-billing");
                }}
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
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate("/payments?tab=pending");
                }}
              >
                Review payments
              </button>
            </section>
          ) : null}
          {showInstallPrompt ? (
            <InstallPromptCard
              canTriggerInstall={installPrompt.canTriggerInstall}
              isManualInstallOnly={installPrompt.isManualInstallOnly}
              onDismiss={installPrompt.dismiss}
              onPrimaryAction={() => {
                setMobileNavOpen(false);

                if (installPrompt.canTriggerInstall) {
                  void installPrompt.promptInstall();
                  return;
                }

                navigate("/settings#install-help");
              }}
            />
          ) : null}
          <Outlet key={activeCompanyId || "default-workspace"} />
        </div>
      </main>
      <ConfirmModal
        open={showSignOutConfirm}
        title="Sign out"
        description="Sign out of your current Recurvos session?"
        confirmLabel="Sign out"
        onConfirm={() => {
          setAuth(null);
          setShowSignOutConfirm(false);
          navigate("/login");
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />
      </div>
      {showFloatingQuickStart && typeof document !== "undefined" ? createPortal(
        <div className="quickstart-float-layer">
          <button
            type="button"
            className="quickstart-float-button"
            onClick={() => {
              setMobileNavOpen(false);
              navigate("/help/quick-start");
            }}
          >
            <span className="quickstart-float-kicker">Quick Start</span>
            {pendingSetupCount && pendingSetupCount > 0 ? (
              <strong>{pendingSetupCount}</strong>
            ) : null}
          </button>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
