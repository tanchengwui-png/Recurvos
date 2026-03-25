# 04 Module Map

This is a practical index of real repo paths for future work.

## Core Entry Points

- `src/Recurvos.Api/Program.cs`
- `src/Recurvos.Web/src/App.tsx`
- `src/Recurvos.Infrastructure/DependencyInjection.cs`
- `src/Recurvos.Infrastructure/Persistence/AppDbContext.cs`

## Authentication / User / Access

- `src/Recurvos.Api/Controllers/AuthController.cs`
- `src/Recurvos.Application/Auth/AuthContracts.cs`
- `src/Recurvos.Infrastructure/Services/AuthService.cs`
- `src/Recurvos.Infrastructure/Auth/JwtTokenService.cs`
- `src/Recurvos.Infrastructure/Auth/PasswordHasher.cs`
- `src/Recurvos.Infrastructure/Auth/CurrentUserService.cs`
- `src/Recurvos.Domain/Entities/User.cs`
- `src/Recurvos.Domain/Entities/RefreshToken.cs`
- `src/Recurvos.Domain/Entities/EmailVerificationToken.cs`
- `src/Recurvos.Domain/Entities/PasswordResetToken.cs`

## Company / Billing Readiness

- `src/Recurvos.Api/Controllers/CompaniesController.cs`
- `src/Recurvos.Application/Companies/CompanyContracts.cs`
- `src/Recurvos.Application/Settings/BillingReadinessContracts.cs`
- `src/Recurvos.Infrastructure/Services/CompanyService.cs`
- `src/Recurvos.Infrastructure/Services/BillingReadinessService.cs`
- `src/Recurvos.Domain/Entities/Company.cs`
- `src/Recurvos.Domain/Entities/CompanyInvoiceSettings.cs`
- `src/Recurvos.Web/src/pages/CompaniesPage.tsx`
- `src/Recurvos.Web/src/pages/QuickStartPage.tsx`
- `src/Recurvos.Web/src/pages/SettingsPage.tsx`

## Customers

- `src/Recurvos.Api/Controllers/CustomersController.cs`
- `src/Recurvos.Application/Customers/CustomerContracts.cs`
- `src/Recurvos.Infrastructure/Services/CustomerService.cs`
- `src/Recurvos.Domain/Entities/Customer.cs`
- `src/Recurvos.Web/src/pages/CustomersPage.tsx`

## Products / Plans

- `src/Recurvos.Api/Controllers/ProductsController.cs`
- `src/Recurvos.Api/Controllers/ProductPlansController.cs`
- `src/Recurvos.Application/Products/ProductContracts.cs`
- `src/Recurvos.Application/Products/ProductValidators.cs`
- `src/Recurvos.Application/ProductPlans/ProductPlanContracts.cs`
- `src/Recurvos.Application/ProductPlans/ProductPlanValidators.cs`
- `src/Recurvos.Infrastructure/Services/ProductService.cs`
- `src/Recurvos.Infrastructure/Services/ProductPlanService.cs`
- `src/Recurvos.Domain/Entities/Product.cs`
- `src/Recurvos.Domain/Entities/ProductPlan.cs`
- `src/Recurvos.Web/src/pages/ProductsPage.tsx`
- `src/Recurvos.Web/src/pages/ProductDetailsPage.tsx`
- `src/Recurvos.Web/src/pages/ProductPlansPage.tsx`

## Subscriptions

- `src/Recurvos.Api/Controllers/SubscriptionsController.cs`
- `src/Recurvos.Application/Subscriptions/SubscriptionContracts.cs`
- `src/Recurvos.Application/Subscriptions/SubscriptionValidators.cs`
- `src/Recurvos.Infrastructure/Services/SubscriptionService.cs`
- `src/Recurvos.Domain/Entities/Subscription.cs`
- `src/Recurvos.Domain/Entities/SubscriptionItem.cs`
- `src/Recurvos.Application/Common/BillingCalculator.cs`
- `src/Recurvos.Web/src/pages/SubscriptionsPage.tsx`

## Invoices

- `src/Recurvos.Api/Controllers/InvoicesController.cs`
- `src/Recurvos.Application/Invoices/InvoiceContracts.cs`
- `src/Recurvos.Infrastructure/Services/InvoiceService.cs`
- `src/Recurvos.Infrastructure/Templates/InvoiceNumberFormatter.cs`
- `src/Recurvos.Infrastructure/Templates/InvoiceTemplate.cshtml`
- `src/Recurvos.Infrastructure/Templates/InvoicePdfTemplate.cs`
- `src/Recurvos.Infrastructure/Templates/InvoiceHtmlTemplateRenderer.cs`
- `src/Recurvos.Infrastructure/Services/LocalInvoiceStorage.cs`
- `src/Recurvos.Domain/Entities/Invoice.cs`
- `src/Recurvos.Domain/Entities/InvoiceLineItem.cs`
- `src/Recurvos.Domain/Entities/DunningRule.cs`
- `src/Recurvos.Domain/Entities/ReminderSchedule.cs`
- `src/Recurvos.Web/src/pages/InvoicesPage.tsx`

## Payments / Webhooks / Confirmations

- `src/Recurvos.Api/Controllers/PaymentsController.cs`
- `src/Recurvos.Api/Controllers/PaymentConfirmationsController.cs`
- `src/Recurvos.Api/Controllers/PublicPaymentConfirmationsController.cs`
- `src/Recurvos.Api/Controllers/PublicPaymentsController.cs`
- `src/Recurvos.Api/Controllers/WebhooksController.cs`
- `src/Recurvos.Application/Payments/PaymentContracts.cs`
- `src/Recurvos.Application/Payments/PaymentConfirmationContracts.cs`
- `src/Recurvos.Application/Webhooks/WebhookContracts.cs`
- `src/Recurvos.Infrastructure/Services/PaymentService.cs`
- `src/Recurvos.Infrastructure/Services/PaymentConfirmationService.cs`
- `src/Recurvos.Infrastructure/Services/WebhookService.cs`
- `src/Recurvos.Infrastructure/Gateways/BillplzPaymentGateway.cs`
- `src/Recurvos.Domain/Entities/Payment.cs`
- `src/Recurvos.Domain/Entities/PaymentAttempt.cs`
- `src/Recurvos.Domain/Entities/PaymentConfirmationSubmission.cs`
- `src/Recurvos.Domain/Entities/WebhookEvent.cs`
- `src/Recurvos.Web/src/pages/PaymentsPage.tsx`
- `src/Recurvos.Web/src/pages/PublicPaymentConfirmationPage.tsx`
- `src/Recurvos.Web/src/pages/PublicPaymentSuccessPage.tsx`

## Refunds / Credit Notes / Finance

- `src/Recurvos.Api/Controllers/RefundsController.cs`
- `src/Recurvos.Api/Controllers/CreditNotesController.cs`
- `src/Recurvos.Api/Controllers/FinanceController.cs`
- `src/Recurvos.Application/Refunds/RefundContracts.cs`
- `src/Recurvos.Application/CreditNotes/CreditNoteContracts.cs`
- `src/Recurvos.Application/Finance/FinanceContracts.cs`
- `src/Recurvos.Infrastructure/Services/RefundService.cs`
- `src/Recurvos.Infrastructure/Services/CreditNoteService.cs`
- `src/Recurvos.Infrastructure/Services/AccountingExportService.cs`
- `src/Recurvos.Infrastructure/Services/ReconciliationService.cs`
- `src/Recurvos.Domain/Entities/Refund.cs`
- `src/Recurvos.Domain/Entities/CreditNote.cs`
- `src/Recurvos.Domain/Entities/CreditNoteLine.cs`
- `src/Recurvos.Domain/Entities/Dispute.cs`
- `src/Recurvos.Domain/Entities/SettlementLine.cs`
- `src/Recurvos.Domain/Entities/ReconciliationResult.cs`
- `src/Recurvos.Domain/Entities/LedgerPosting.cs`
- `src/Recurvos.Web/src/pages/FinancePage.tsx`

## Package Billing / Platform Admin

- `src/Recurvos.Api/Controllers/PlatformController.cs`
- `src/Recurvos.Api/Controllers/SubscriberPackageBillingController.cs`
- `src/Recurvos.Api/Controllers/PublicPackagesController.cs`
- `src/Recurvos.Application/Platform/PlatformContracts.cs`
- `src/Recurvos.Application/Platform/PackageLimitContracts.cs`
- `src/Recurvos.Infrastructure/Services/PlatformService.cs`
- `src/Recurvos.Infrastructure/Services/SubscriberPackageBillingService.cs`
- `src/Recurvos.Infrastructure/Services/FeatureEntitlementService.cs`
- `src/Recurvos.Infrastructure/Services/PackageLimitService.cs`
- `src/Recurvos.Domain/Entities/PlatformPackage.cs`
- `src/Recurvos.Domain/Entities/PlatformPackageFeature.cs`
- `src/Recurvos.Domain/Entities/PlatformPackageTrustPoint.cs`
- `src/Recurvos.Web/src/pages/SubscriberPackageBillingPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformDashboardPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformSubscribersPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformPackagesPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformUsersPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformSettingsPage.tsx`

## Settings / Notifications / Feedback

- `src/Recurvos.Api/Controllers/SettingsController.cs`
- `src/Recurvos.Api/Controllers/FeedbackController.cs`
- `src/Recurvos.Application/Settings/SettingsContracts.cs`
- `src/Recurvos.Application/Feedback/FeedbackContracts.cs`
- `src/Recurvos.Infrastructure/Services/SettingsService.cs`
- `src/Recurvos.Infrastructure/Services/FeedbackService.cs`
- `src/Recurvos.Infrastructure/Services/SmtpEmailSender.cs`
- `src/Recurvos.Infrastructure/Services/GenericWhatsAppSender.cs`
- `src/Recurvos.Infrastructure/Services/PlatformWhatsAppGateway.cs`
- `src/Recurvos.Infrastructure/Services/PlatformOwnerNotificationService.cs`
- `src/Recurvos.Domain/Entities/WhatsAppNotification.cs`
- `src/Recurvos.Domain/Entities/EmailDispatchLog.cs`
- `src/Recurvos.Domain/Entities/FeedbackItem.cs`
- `src/Recurvos.Domain/Entities/AuditLog.cs`
- `src/Recurvos.Web/src/pages/FeedbackPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformFeedbackPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformEmailLogsPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformAuditLogsPage.tsx`
- `src/Recurvos.Web/src/pages/PlatformWhatsAppSessionsPage.tsx`

## Dashboard

- `src/Recurvos.Api/Controllers/DashboardController.cs`
- `src/Recurvos.Application/Dashboard/DashboardContracts.cs`
- `src/Recurvos.Infrastructure/Services/DashboardService.cs`
- `src/Recurvos.Web/src/pages/DashboardPage.tsx`
- `src/Recurvos.Web/src/hooks/useDashboard.ts`
- `src/Recurvos.Web/src/components/dashboard/*`

## Jobs / Scheduled Operations

- `src/Recurvos.Infrastructure/Jobs/GenerateInvoicesJob.cs`
- `src/Recurvos.Infrastructure/Jobs/GenerateSubscriberPackageInvoicesJob.cs`
- `src/Recurvos.Infrastructure/Jobs/ReconcileSubscriberPackageStatusesJob.cs`
- `src/Recurvos.Infrastructure/Jobs/SendInvoiceRemindersJob.cs`
- `src/Recurvos.Infrastructure/Jobs/RetryFailedPaymentsJob.cs`
- `src/Recurvos.Infrastructure/Jobs/CleanupStaleSignupsJob.cs`

## Infrastructure / Config / Deployment

- `src/Recurvos.Api/appsettings.json`
- `src/Recurvos.Api/appsettings.Development.json`
- `docker-compose.yml`
- `docker-compose.staging.yml`
- `DEPLOYMENT.md`
- `DEPLOY-CHEATSHEET.txt`
- `src/Recurvos.Api/Dockerfile`
- `src/Recurvos.Web/Dockerfile`
- `src/Recurvos.WhatsAppWorker/Dockerfile`
- `src/Recurvos.Infrastructure/Configuration/*.cs`

## Database / Migrations

- `src/Recurvos.Infrastructure/Persistence/AppDbContext.cs`
- `src/Recurvos.Infrastructure/Persistence/Migrations/*`
- Recent migration themes:
  - subscriber payment gateway settings
  - platform WhatsApp provider/session state
  - package upgrade state
  - tax settings and invoice tax snapshots
  - feedback module/notifications
  - receipt and credit note numbering

## Tests To Read For Billing Behavior

- `tests/Recurvos.Application.Tests/Integration/BillingIntegrationTests.cs`
- `tests/Recurvos.Application.Tests/Billing/BillingCalculatorTests.cs`
- `tests/Recurvos.Application.Tests/Billing/InvoiceTemplateTests.cs`
