import type { ReactElement } from "react";
import type { Location } from "react-router-dom";
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { getAuth } from "./lib/auth";
import { CompaniesPage } from "./pages/CompaniesPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FinancePage } from "./pages/FinancePage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LandingPage } from "./pages/LandingPage";
import { InfoPage } from "./pages/InfoPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { PlatformDashboardPage } from "./pages/PlatformDashboardPage";
import { PlatformAuditLogsPage } from "./pages/PlatformAuditLogsPage";
import { PlatformDocumentPreviewPage } from "./pages/PlatformDocumentPreviewPage";
import { PlatformEmailLogsPage } from "./pages/PlatformEmailLogsPage";
import { PlatformFeedbackPage } from "./pages/PlatformFeedbackPage";
import { PlatformPackagesPage } from "./pages/PlatformPackagesPage";
import { PlatformSettingsPage } from "./pages/PlatformSettingsPage";
import { PlatformSubscribersPage } from "./pages/PlatformSubscribersPage";
import { PlatformUsersPage } from "./pages/PlatformUsersPage";
import { PlatformWhatsAppSessionsPage } from "./pages/PlatformWhatsAppSessionsPage";
import { PublicPaymentConfirmationPage } from "./pages/PublicPaymentConfirmationPage";
import { PublicPaymentSuccessPage } from "./pages/PublicPaymentSuccessPage";
import { ProductDetailsPage } from "./pages/ProductDetailsPage";
import { ProductPlansPage } from "./pages/ProductPlansPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PricingPage } from "./pages/PricingPage";
import { QuickStartPage } from "./pages/QuickStartPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SubscriberPackageBillingPage } from "./pages/SubscriberPackageBillingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

function PrivateRoutes() {
  return getAuth() ? <AppShell /> : <Navigate to="/login" replace />;
}

function HomeRoute() {
  const auth = getAuth();
  return auth?.isPlatformOwner ? <PlatformDashboardPage /> : <DashboardPage />;
}

function RootRoute() {
  return getAuth() ? <Navigate to="/app" replace /> : <LandingPage />;
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
          <Route path="/customers" element={<TenantRoute><CustomersPage /></TenantRoute>} />
          <Route path="/products" element={<TenantRoute><ProductsPage /></TenantRoute>} />
          <Route path="/products/:id" element={<TenantRoute><ProductDetailsPage /></TenantRoute>} />
          <Route path="/plans" element={<TenantRoute><ProductPlansPage /></TenantRoute>} />
          <Route path="/prices" element={<Navigate to="/plans" replace />} />
          <Route path="/subscriptions" element={<TenantRoute><SubscriptionsPage /></TenantRoute>} />
          <Route path="/invoices" element={<TenantRoute><InvoicesPage /></TenantRoute>} />
          <Route path="/payments" element={<TenantRoute><PaymentsPage /></TenantRoute>} />
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
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
