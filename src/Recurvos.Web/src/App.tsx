import { Suspense, lazy, type ReactElement } from "react";
import type { Location } from "react-router-dom";
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { getAuth } from "./lib/auth";
import { isAppSiteHost } from "./lib/siteUrls";

const CompaniesPage = lazy(() => import("./pages/CompaniesPage").then((module) => ({ default: module.CompaniesPage })));
const CompanyFormPage = lazy(() => import("./pages/CompanyFormPage").then((module) => ({ default: module.CompanyFormPage })));
const ContactGroupsPage = lazy(() => import("./pages/ContactGroupsPage").then((module) => ({ default: module.ContactGroupsPage })));
const CustomerFormPage = lazy(() => import("./pages/CustomerFormPage").then((module) => ({ default: module.CustomerFormPage })));
const CustomersPage = lazy(() => import("./pages/CustomersPage").then((module) => ({ default: module.CustomersPage })));
const CustomerStatementPage = lazy(() => import("./pages/CustomerStatementPage").then((module) => ({ default: module.CustomerStatementPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const FinancePage = lazy(() => import("./pages/FinancePage").then((module) => ({ default: module.FinancePage })));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage").then((module) => ({ default: module.FeedbackPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((module) => ({ default: module.ForgotPasswordPage })));
const InfoPage = lazy(() => import("./pages/InfoPage").then((module) => ({ default: module.InfoPage })));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage").then((module) => ({ default: module.InvoicesPage })));
const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const FoundationOverviewPage = lazy(() => import("./pages/FoundationOverviewPage").then((module) => ({ default: module.FoundationOverviewPage })));
const FoundationModuleListPage = lazy(() => import("./pages/FoundationModuleListPage").then((module) => ({ default: module.FoundationModuleListPage })));
const FoundationModuleFormPage = lazy(() => import("./pages/FoundationModuleFormPage").then((module) => ({ default: module.FoundationModuleFormPage })));
const FoundationModuleDetailsPage = lazy(() => import("./pages/FoundationModuleDetailsPage").then((module) => ({ default: module.FoundationModuleDetailsPage })));
const MasterDataPage = lazy(() => import("./pages/MasterDataPage").then((module) => ({ default: module.MasterDataPage })));
const NewSubscriptionPage = lazy(() => import("./pages/NewSubscriptionPage").then((module) => ({ default: module.NewSubscriptionPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage").then((module) => ({ default: module.OnboardingPage })));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage").then((module) => ({ default: module.PaymentsPage })));
const PlatformAuditLogsPage = lazy(() => import("./pages/PlatformAuditLogsPage").then((module) => ({ default: module.PlatformAuditLogsPage })));
const PlatformDashboardPage = lazy(() => import("./pages/PlatformDashboardPage").then((module) => ({ default: module.PlatformDashboardPage })));
const PlatformDocumentPreviewPage = lazy(() => import("./pages/PlatformDocumentPreviewPage").then((module) => ({ default: module.PlatformDocumentPreviewPage })));
const PlatformEmailLogsPage = lazy(() => import("./pages/PlatformEmailLogsPage").then((module) => ({ default: module.PlatformEmailLogsPage })));
const PlatformFeedbackPage = lazy(() => import("./pages/PlatformFeedbackPage").then((module) => ({ default: module.PlatformFeedbackPage })));
const PlatformPackagesPage = lazy(() => import("./pages/PlatformPackagesPage").then((module) => ({ default: module.PlatformPackagesPage })));
const PlatformSettingsPage = lazy(() => import("./pages/PlatformSettingsPage").then((module) => ({ default: module.PlatformSettingsPage })));
const PlatformSubscribersPage = lazy(() => import("./pages/PlatformSubscribersPage").then((module) => ({ default: module.PlatformSubscribersPage })));
const PlatformUsersPage = lazy(() => import("./pages/PlatformUsersPage").then((module) => ({ default: module.PlatformUsersPage })));
const PlatformWhatsAppSessionsPage = lazy(() => import("./pages/PlatformWhatsAppSessionsPage").then((module) => ({ default: module.PlatformWhatsAppSessionsPage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then((module) => ({ default: module.PricingPage })));
const ProductDetailsPage = lazy(() => import("./pages/ProductDetailsPage").then((module) => ({ default: module.ProductDetailsPage })));
const ProductFormPage = lazy(() => import("./pages/ProductFormPage").then((module) => ({ default: module.ProductFormPage })));
const ProductPlanFormPage = lazy(() => import("./pages/ProductPlanFormPage").then((module) => ({ default: module.ProductPlanFormPage })));
const ProductPlansPage = lazy(() => import("./pages/ProductPlansPage").then((module) => ({ default: module.ProductPlansPage })));
const ProductsPage = lazy(() => import("./pages/ProductsPage").then((module) => ({ default: module.ProductsPage })));
const PurchaseOrdersPage = lazy(() => import("./pages/PurchaseOrdersPage").then((module) => ({ default: module.PurchaseOrdersPage })));
const PurchaseOrderFormPage = lazy(() => import("./pages/PurchaseOrderFormPage").then((module) => ({ default: module.PurchaseOrderFormPage })));
const PurchaseOrderDetailsPage = lazy(() => import("./pages/PurchaseOrderDetailsPage").then((module) => ({ default: module.PurchaseOrderDetailsPage })));
const GoodsReceivedNotesPage = lazy(() => import("./pages/GoodsReceivedNotesPage").then((module) => ({ default: module.GoodsReceivedNotesPage })));
const GoodsReceivedNoteFormPage = lazy(() => import("./pages/GoodsReceivedNoteFormPage").then((module) => ({ default: module.GoodsReceivedNoteFormPage })));
const GoodsReceivedNoteDetailsPage = lazy(() => import("./pages/GoodsReceivedNoteDetailsPage").then((module) => ({ default: module.GoodsReceivedNoteDetailsPage })));
const PurchaseBillsPage = lazy(() => import("./pages/PurchaseBillsPage").then((module) => ({ default: module.PurchaseBillsPage })));
const PurchaseBillFormPage = lazy(() => import("./pages/PurchaseBillFormPage").then((module) => ({ default: module.PurchaseBillFormPage })));
const PurchaseBillDetailsPage = lazy(() => import("./pages/PurchaseBillDetailsPage").then((module) => ({ default: module.PurchaseBillDetailsPage })));
const PurchasePaymentsPage = lazy(() => import("./pages/PurchasePaymentsPage").then((module) => ({ default: module.PurchasePaymentsPage })));
const PurchasePaymentFormPage = lazy(() => import("./pages/PurchasePaymentFormPage").then((module) => ({ default: module.PurchasePaymentFormPage })));
const PurchasePaymentDetailsPage = lazy(() => import("./pages/PurchasePaymentDetailsPage").then((module) => ({ default: module.PurchasePaymentDetailsPage })));
const PurchaseCreditNotesPage = lazy(() => import("./pages/PurchaseCreditNotesPage").then((module) => ({ default: module.PurchaseCreditNotesPage })));
const PurchaseCreditNoteFormPage = lazy(() => import("./pages/PurchaseCreditNoteFormPage").then((module) => ({ default: module.PurchaseCreditNoteFormPage })));
const PurchaseCreditNoteDetailsPage = lazy(() => import("./pages/PurchaseCreditNoteDetailsPage").then((module) => ({ default: module.PurchaseCreditNoteDetailsPage })));
const PurchaseRefundsPage = lazy(() => import("./pages/PurchaseRefundsPage").then((module) => ({ default: module.PurchaseRefundsPage })));
const PurchaseRefundFormPage = lazy(() => import("./pages/PurchaseRefundFormPage").then((module) => ({ default: module.PurchaseRefundFormPage })));
const PurchaseRefundDetailsPage = lazy(() => import("./pages/PurchaseRefundDetailsPage").then((module) => ({ default: module.PurchaseRefundDetailsPage })));
const PublicPaymentConfirmationPage = lazy(() => import("./pages/PublicPaymentConfirmationPage").then((module) => ({ default: module.PublicPaymentConfirmationPage })));
const PublicPaymentSuccessPage = lazy(() => import("./pages/PublicPaymentSuccessPage").then((module) => ({ default: module.PublicPaymentSuccessPage })));
const QuickStartPage = lazy(() => import("./pages/QuickStartPage").then((module) => ({ default: module.QuickStartPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const SubscriberPackageBillingPage = lazy(() => import("./pages/SubscriberPackageBillingPage").then((module) => ({ default: module.SubscriberPackageBillingPage })));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage").then((module) => ({ default: module.SubscriptionsPage })));
const SalesQuotationsPage = lazy(() => import("./pages/SalesQuotationsPage").then((module) => ({ default: module.SalesQuotationsPage })));
const SalesQuotationFormPage = lazy(() => import("./pages/SalesQuotationFormPage").then((module) => ({ default: module.SalesQuotationFormPage })));
const SalesQuotationDetailsPage = lazy(() => import("./pages/SalesQuotationDetailsPage").then((module) => ({ default: module.SalesQuotationDetailsPage })));
const SalesOrdersPage = lazy(() => import("./pages/SalesOrdersPage").then((module) => ({ default: module.SalesOrdersPage })));
const SalesOrderFormPage = lazy(() => import("./pages/SalesOrderFormPage").then((module) => ({ default: module.SalesOrderFormPage })));
const SalesOrderDetailsPage = lazy(() => import("./pages/SalesOrderDetailsPage").then((module) => ({ default: module.SalesOrderDetailsPage })));
const DeliveryOrdersPage = lazy(() => import("./pages/DeliveryOrdersPage").then((module) => ({ default: module.DeliveryOrdersPage })));
const DeliveryOrderFormPage = lazy(() => import("./pages/DeliveryOrderFormPage").then((module) => ({ default: module.DeliveryOrderFormPage })));
const DeliveryOrderDetailsPage = lazy(() => import("./pages/DeliveryOrderDetailsPage").then((module) => ({ default: module.DeliveryOrderDetailsPage })));
const SalesInvoiceFormPage = lazy(() => import("./pages/SalesInvoiceFormPage").then((module) => ({ default: module.SalesInvoiceFormPage })));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage").then((module) => ({ default: module.VerifyEmailPage })));
const WhatsAppMessagesPage = lazy(() => import("./pages/WhatsAppMessagesPage").then((module) => ({ default: module.WhatsAppMessagesPage })));

function RouteFallback() {
  return (
    <div className="page">
      <section className="card">
        <p className="muted">Loading...</p>
      </section>
    </div>
  );
}

function PrivateRoutes() {
  return getAuth() ? <AppShell /> : <Navigate to="/login" replace />;
}

function HomeRoute() {
  const auth = getAuth();
  return auth?.isPlatformOwner ? <PlatformDashboardPage /> : <DashboardPage />;
}

function RootRoute() {
  if (getAuth()) {
    return <Navigate to="/app" replace />;
  }

  return isAppSiteHost() ? <Navigate to="/login" replace /> : <LandingPage />;
}

function TenantRoute({ children }: { children: ReactElement }) {
  const auth = getAuth();
  return auth?.isPlatformOwner ? <Navigate to="/" replace /> : children;
}

function PlatformRoute({ children }: { children: ReactElement }) {
  const auth = getAuth();
  return auth?.isPlatformOwner ? children : <Navigate to="/" replace />;
}

function infoPageConfig(path: "/privacy" | "/terms" | "/support") {
  switch (path) {
    case "/privacy":
      return {
        title: "Privacy Policy",
        subtitle: "Last updated: 17 March 2026",
        sections: [
          { paragraphs: ["We respect your privacy and are committed to protecting your business data."] },
          { title: "Information we collect", bullets: ["Account information (name, email, company name)", "Billing and subscription information", "Customer and invoice data entered by you", "Usage logs and technical data", "Support messages"] },
          { title: "How we use your information", bullets: ["Provide the billing service", "Generate invoices and reports", "Improve system performance", "Provide support", "Prevent fraud and abuse"] },
          { title: "Data ownership", paragraphs: ["All data you enter into the system belongs to you.", "You can export your invoices, customers, and subscriptions at any time."] },
          { title: "Data security", paragraphs: ["We use reasonable security measures to protect your data.", "Access to your account requires authentication.", "We do not sell your data."] },
          { title: "Third-party services", paragraphs: ["We may use third-party hosting, email, or payment providers to operate the system."] },
          { title: "Changes", paragraphs: ["We may update this policy from time to time.", "Continued use of the service means you accept the changes."] },
          { title: "Contact", paragraphs: ["If you have questions, contact: support@yourdomain.com"] },
        ],
      };
    case "/terms":
      return {
        title: "Terms of Service",
        subtitle: "Last updated: 17 March 2026",
        sections: [
          { paragraphs: ["By using this system, you agree to the following terms."] },
          { title: "Service description", paragraphs: ["This platform provides billing, invoicing, and subscription management tools for businesses."] },
          { title: "Subscription", paragraphs: ["The service is billed monthly unless stated otherwise.", "You may cancel anytime.", "Cancellation will stop future billing."] },
          { title: "No contract", paragraphs: ["There is no long-term contract.", "You may stop using the service at any time."] },
          { title: "User responsibility", bullets: ["Your account security", "Data entered into the system", "Compliance with local laws"] },
          { title: "We are not responsible for", bullets: ["Incorrect invoices created by users", "Payment disputes between you and your customers", "Loss caused by misuse of the system"] },
          { title: "Data", paragraphs: ["Your data belongs to you.", "You may export your data anytime."] },
          { title: "Service availability", paragraphs: ["We try to keep the service available at all times.", "However, downtime may occur for maintenance or technical issues."] },
          { title: "Limitation of liability", paragraphs: ["The service is provided as-is.", "We are not liable for business loss caused by system failure."] },
          { title: "Changes", paragraphs: ["We may update these terms at any time."] },
          { title: "Contact", paragraphs: ["support@yourdomain.com"] },
        ],
      };
    case "/support":
      return {
        title: "Support",
        subtitle: "Need help?",
        sections: [
          { paragraphs: ["You can contact support for:"], bullets: ["Bug report", "Account issue", "Billing question", "Feature request"] },
          { title: "Email", paragraphs: ["support@yourdomain.com"] },
          { title: "Response time", paragraphs: ["We usually reply within 1-2 business days."] },
          { title: "Bug reporting", bullets: ["What happened", "Screenshot if possible", "Your account email"] },
          { paragraphs: ["Thank you for using our service."] },
        ],
      };
  }
}

function renderInfoRoute(path: "/privacy" | "/terms" | "/support", modal = false) {
  const config = infoPageConfig(path);
  return <Route path={path} element={<InfoPage {...config} modal={modal} />} />;
}

function AppRoutes() {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const backgroundLocation = state?.backgroundLocation;

  return (
    <Suspense fallback={<RouteFallback />}>
      <>
        <Routes location={backgroundLocation ?? location}>
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/payment-confirmation" element={<PublicPaymentConfirmationPage />} />
          <Route path="/payment-success" element={<PublicPaymentSuccessPage />} />
          <Route path="/payment-success/:invoiceId" element={<PublicPaymentSuccessPage />} />
          {renderInfoRoute("/privacy")}
          {renderInfoRoute("/terms")}
          {renderInfoRoute("/support")}
          <Route element={<PrivateRoutes />}>
            <Route path="/app" element={<HomeRoute />} />
            <Route path="/subscribers" element={<PlatformRoute><PlatformSubscribersPage /></PlatformRoute>} />
            <Route path="/platform/users" element={<PlatformRoute><PlatformUsersPage /></PlatformRoute>} />
            <Route path="/platform/documents" element={<PlatformRoute><PlatformDocumentPreviewPage /></PlatformRoute>} />
            <Route path="/platform/email-logs" element={<PlatformRoute><PlatformEmailLogsPage /></PlatformRoute>} />
            <Route path="/platform/audit-logs" element={<PlatformRoute><PlatformAuditLogsPage /></PlatformRoute>} />
            <Route path="/platform/feedback" element={<PlatformRoute><PlatformFeedbackPage /></PlatformRoute>} />
            <Route path="/platform/packages" element={<PlatformRoute><PlatformPackagesPage /></PlatformRoute>} />
            <Route path="/platform/settings" element={<PlatformRoute><PlatformSettingsPage /></PlatformRoute>} />
            <Route path="/platform/whatsapp-sessions" element={<PlatformRoute><PlatformWhatsAppSessionsPage /></PlatformRoute>} />
            <Route path="/companies" element={<TenantRoute><CompaniesPage /></TenantRoute>} />
            <Route path="/companies/new" element={<TenantRoute><CompanyFormPage /></TenantRoute>} />
            <Route path="/companies/:id/edit" element={<TenantRoute><CompanyFormPage /></TenantRoute>} />
            <Route path="/contact-groups" element={<TenantRoute><ContactGroupsPage /></TenantRoute>} />
            <Route path="/customers" element={<TenantRoute><CustomersPage /></TenantRoute>} />
            <Route path="/customers/new" element={<TenantRoute><CustomerFormPage /></TenantRoute>} />
            <Route path="/customers/:id/edit" element={<TenantRoute><CustomerFormPage /></TenantRoute>} />
            <Route path="/customers/:id/statement" element={<TenantRoute><CustomerStatementPage /></TenantRoute>} />
            <Route path="/products" element={<TenantRoute><ProductsPage /></TenantRoute>} />
            <Route path="/products/new" element={<TenantRoute><ProductFormPage /></TenantRoute>} />
            <Route path="/products/:id/edit" element={<TenantRoute><ProductFormPage /></TenantRoute>} />
            <Route path="/products/:id" element={<TenantRoute><ProductDetailsPage /></TenantRoute>} />
            <Route path="/plans" element={<TenantRoute><ProductPlansPage /></TenantRoute>} />
            <Route path="/plans/new" element={<TenantRoute><ProductPlanFormPage /></TenantRoute>} />
            <Route path="/plans/:id/edit" element={<TenantRoute><ProductPlanFormPage /></TenantRoute>} />
            <Route path="/prices" element={<Navigate to="/plans" replace />} />
            <Route path="/subscriptions" element={<TenantRoute><SubscriptionsPage /></TenantRoute>} />
            <Route path="/subscriptions/new" element={<TenantRoute><NewSubscriptionPage /></TenantRoute>} />
            <Route path="/sales/quotations" element={<TenantRoute><SalesQuotationsPage /></TenantRoute>} />
            <Route path="/sales/quotations/new" element={<TenantRoute><SalesQuotationFormPage /></TenantRoute>} />
            <Route path="/sales/quotations/:id/edit" element={<TenantRoute><SalesQuotationFormPage /></TenantRoute>} />
            <Route path="/sales/quotations/:id" element={<TenantRoute><SalesQuotationDetailsPage /></TenantRoute>} />
            <Route path="/sales/orders" element={<TenantRoute><SalesOrdersPage /></TenantRoute>} />
            <Route path="/sales/orders/new" element={<TenantRoute><SalesOrderFormPage /></TenantRoute>} />
            <Route path="/sales/orders/:id/edit" element={<TenantRoute><SalesOrderFormPage /></TenantRoute>} />
            <Route path="/sales/orders/:id" element={<TenantRoute><SalesOrderDetailsPage /></TenantRoute>} />
            <Route path="/sales/delivery-orders" element={<TenantRoute><DeliveryOrdersPage /></TenantRoute>} />
            <Route path="/sales/delivery-orders/new" element={<TenantRoute><DeliveryOrderFormPage /></TenantRoute>} />
            <Route path="/sales/delivery-orders/:id/edit" element={<TenantRoute><DeliveryOrderFormPage /></TenantRoute>} />
            <Route path="/sales/delivery-orders/:id" element={<TenantRoute><DeliveryOrderDetailsPage /></TenantRoute>} />
            <Route path="/sales/invoices/new" element={<TenantRoute><SalesInvoiceFormPage /></TenantRoute>} />
            <Route path="/purchases/orders" element={<TenantRoute><PurchaseOrdersPage /></TenantRoute>} />
            <Route path="/purchases/orders/new" element={<TenantRoute><PurchaseOrderFormPage /></TenantRoute>} />
            <Route path="/purchases/orders/:id/edit" element={<TenantRoute><PurchaseOrderFormPage /></TenantRoute>} />
            <Route path="/purchases/orders/:id" element={<TenantRoute><PurchaseOrderDetailsPage /></TenantRoute>} />
            <Route path="/purchases/grns" element={<TenantRoute><GoodsReceivedNotesPage /></TenantRoute>} />
            <Route path="/purchases/grns/new" element={<TenantRoute><GoodsReceivedNoteFormPage /></TenantRoute>} />
            <Route path="/purchases/grns/:id/edit" element={<TenantRoute><GoodsReceivedNoteFormPage /></TenantRoute>} />
            <Route path="/purchases/grns/:id" element={<TenantRoute><GoodsReceivedNoteDetailsPage /></TenantRoute>} />
            <Route path="/purchases/bills" element={<TenantRoute><PurchaseBillsPage /></TenantRoute>} />
            <Route path="/purchases/bills/new" element={<TenantRoute><PurchaseBillFormPage /></TenantRoute>} />
            <Route path="/purchases/bills/:id" element={<TenantRoute><PurchaseBillDetailsPage /></TenantRoute>} />
            <Route path="/purchases/payments" element={<TenantRoute><PurchasePaymentsPage /></TenantRoute>} />
            <Route path="/purchases/payments/new" element={<TenantRoute><PurchasePaymentFormPage /></TenantRoute>} />
            <Route path="/purchases/payments/:id" element={<TenantRoute><PurchasePaymentDetailsPage /></TenantRoute>} />
            <Route path="/purchases/credit-notes" element={<TenantRoute><PurchaseCreditNotesPage /></TenantRoute>} />
            <Route path="/purchases/credit-notes/new" element={<TenantRoute><PurchaseCreditNoteFormPage /></TenantRoute>} />
            <Route path="/purchases/credit-notes/:id" element={<TenantRoute><PurchaseCreditNoteDetailsPage /></TenantRoute>} />
            <Route path="/purchases/refunds" element={<TenantRoute><PurchaseRefundsPage /></TenantRoute>} />
            <Route path="/purchases/refunds/new" element={<TenantRoute><PurchaseRefundFormPage /></TenantRoute>} />
            <Route path="/purchases/refunds/:id" element={<TenantRoute><PurchaseRefundDetailsPage /></TenantRoute>} />
            <Route path="/invoices" element={<TenantRoute><InvoicesPage /></TenantRoute>} />
            <Route path="/payments" element={<TenantRoute><PaymentsPage /></TenantRoute>} />
            <Route path="/foundation" element={<TenantRoute><FoundationOverviewPage /></TenantRoute>} />
            <Route path="/foundation/chart-of-accounts" element={<TenantRoute><FoundationModuleListPage moduleKey="chart-of-accounts" /></TenantRoute>} />
            <Route path="/foundation/chart-of-accounts/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="chart-of-accounts" /></TenantRoute>} />
            <Route path="/foundation/chart-of-accounts/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="chart-of-accounts" /></TenantRoute>} />
            <Route path="/foundation/chart-of-accounts/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="chart-of-accounts" /></TenantRoute>} />
            <Route path="/foundation/tax-codes" element={<TenantRoute><FoundationModuleListPage moduleKey="tax-codes" /></TenantRoute>} />
            <Route path="/foundation/tax-codes/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="tax-codes" /></TenantRoute>} />
            <Route path="/foundation/tax-codes/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="tax-codes" /></TenantRoute>} />
            <Route path="/foundation/tax-codes/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="tax-codes" /></TenantRoute>} />
            <Route path="/foundation/payment-terms" element={<TenantRoute><FoundationModuleListPage moduleKey="payment-terms" /></TenantRoute>} />
            <Route path="/foundation/payment-terms/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="payment-terms" /></TenantRoute>} />
            <Route path="/foundation/payment-terms/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="payment-terms" /></TenantRoute>} />
            <Route path="/foundation/payment-terms/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="payment-terms" /></TenantRoute>} />
            <Route path="/foundation/warehouses" element={<TenantRoute><FoundationModuleListPage moduleKey="warehouses" /></TenantRoute>} />
            <Route path="/foundation/warehouses/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="warehouses" /></TenantRoute>} />
            <Route path="/foundation/warehouses/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="warehouses" /></TenantRoute>} />
            <Route path="/foundation/warehouses/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="warehouses" /></TenantRoute>} />
            <Route path="/foundation/currencies" element={<TenantRoute><FoundationModuleListPage moduleKey="currencies" /></TenantRoute>} />
            <Route path="/foundation/currencies/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="currencies" /></TenantRoute>} />
            <Route path="/foundation/currencies/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="currencies" /></TenantRoute>} />
            <Route path="/foundation/currencies/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="currencies" /></TenantRoute>} />
            <Route path="/foundation/product-categories" element={<TenantRoute><FoundationModuleListPage moduleKey="product-categories" /></TenantRoute>} />
            <Route path="/foundation/product-categories/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="product-categories" /></TenantRoute>} />
            <Route path="/foundation/product-categories/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="product-categories" /></TenantRoute>} />
            <Route path="/foundation/product-categories/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="product-categories" /></TenantRoute>} />
            <Route path="/foundation/price-levels" element={<TenantRoute><FoundationModuleListPage moduleKey="price-levels" /></TenantRoute>} />
            <Route path="/foundation/price-levels/new" element={<TenantRoute><FoundationModuleFormPage moduleKey="price-levels" /></TenantRoute>} />
            <Route path="/foundation/price-levels/:id" element={<TenantRoute><FoundationModuleDetailsPage moduleKey="price-levels" /></TenantRoute>} />
            <Route path="/foundation/price-levels/:id/edit" element={<TenantRoute><FoundationModuleFormPage moduleKey="price-levels" /></TenantRoute>} />
            <Route path="/settings/master-data" element={<TenantRoute><MasterDataPage /></TenantRoute>} />
            <Route path="/whatsapp-messages" element={<TenantRoute><WhatsAppMessagesPage /></TenantRoute>} />
            <Route path="/finance" element={<TenantRoute><FinancePage /></TenantRoute>} />
            <Route path="/feedback" element={<TenantRoute><FeedbackPage /></TenantRoute>} />
            <Route path="/package-billing" element={<TenantRoute><SubscriberPackageBillingPage /></TenantRoute>} />
            <Route path="/settings" element={<TenantRoute><SettingsPage /></TenantRoute>} />
            <Route path="/help/quick-start" element={<TenantRoute><QuickStartPage /></TenantRoute>} />
          </Route>
        </Routes>
        {backgroundLocation ? (
          <Routes>
            {renderInfoRoute("/privacy", true)}
            {renderInfoRoute("/terms", true)}
            {renderInfoRoute("/support", true)}
          </Routes>
        ) : null}
      </>
    </Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
