# 02 Business Rules

This file captures rules inferred from code and tests. If a rule is not fully proven, it is marked `Needs confirmation`.

## Customer Rules

- Customers are subscriber-owned, not company-owned.
  - Evidence: `Customer.SubscriberId`, `CustomerService`, migration `RemoveCustomerCompanyBinding`
- Customer access is gated by package features.
  - Evidence: `FeatureEntitlementService`, `CustomerService.EnsureReadAccessAsync`
- Customer creation is limited by package limits.
  - Evidence: `PackageLimitService.EnsureCanCreateCustomerAsync`

## Company / Billing Readiness Rules

- Required issuer setup before invoice or subscription operations:
  - company name
  - registration number
  - company email
  - company phone
  - company address
  - invoice numbering setup
  - Evidence: `BillingReadinessService`
- Logo is optional, not required.
  - Evidence: `BillingReadinessService`
- New billing profiles created by a subscriber inherit package selection/status from the current subscriber company.
  - Evidence: `CompanyService.CreateAsync`
  - `Needs confirmation`: whether that inheritance is always desired product behavior or only current implementation

## Product / Plan Rules

- Products belong to a company; subscribers can manage products across their owned companies.
  - Evidence: `ProductService`
- Product code must be unique within a company.
  - Evidence: `ProductService.ValidateRequestAsync`
- Products with plans cannot be deleted.
  - Evidence: `ProductService.DeleteAsync`
- If a product is deactivated, its active plans are also deactivated.
  - Evidence: `ProductService.UpdateAsync`, `SetStatusAsync`
- Plans belong to products and companies.
  - Evidence: `ProductPlanService`, `AppDbContext`
- Plan code must be unique within a company.
  - Evidence: `ProductPlanService.ValidateAsync`
- Plan name must be unique within a product.
  - Evidence: `ProductPlanService.ValidateAsync`
- Recurring plans are only allowed for subscription products.
  - Evidence: `ProductPlanService.ValidateAsync`
- Only one default plan is allowed per product.
  - Evidence: filtered unique index in `AppDbContext`, `ProductPlanService.EnsureSingleDefaultAsync`
- Inactive plans cannot be default.
  - Evidence: `ProductPlanService.EnsureSingleDefaultAsync`
- Plans used by existing subscriptions cannot have billing terms changed.
  - Evidence: `ProductPlanService.UpdateAsync`
- Plans linked to subscriptions cannot be deleted.
  - Evidence: `ProductPlanService.DeleteAsync`
- Currency is set to `MYR` when plans are created/updated.
  - Evidence: `ProductPlanService.CreateAsync`, `UpdateAsync`

## Subscription Rules

- Subscription creation requires `recurring_invoices` feature access.
  - Evidence: `SubscriptionService`
- All subscription items must belong to the same company.
  - Evidence: `SubscriptionService.CreateAsync`
- Billing readiness is required before subscription creation.
  - Evidence: `SubscriptionService.CreateAsync`
- Trial days are supported at subscription creation.
  - Evidence: `SubscriptionService.CreateAsync`, `ValidateTrialWindow`
- One-time items bill once and are then ended unless renewed.
  - Evidence: `SubscriptionService.ComputeBillingCycle`, `InvoiceService.GenerateDueInvoicesInternalAsync`
- Recurring items use `NextBillingUtc` and current period boundaries to determine due invoices.
  - Evidence: `SubscriptionService.IsItemDue`, `InvoiceService.GenerateDueInvoicesInternalAsync`
- End-of-period cancellation can stop future billing without immediate termination.
  - Evidence: `SubscriptionService.CancelAsync`
- Immediate cancellation ends active items right away.
  - Evidence: `SubscriptionService.CancelAsync`
- Resume is only allowed from paused or period-end-cancel state.
  - Evidence: `SubscriptionService.ResumeAsync`
- Future pricing updates currently support single-item subscriptions only.
  - Evidence: `SubscriptionService.UpdatePricingAsync`

## Invoice Rules

- Manual invoice creation requires the `manual_invoices` feature and billing readiness.
  - Evidence: `InvoiceService.CreateAsync`
- Invoices require at least one line item.
  - Evidence: `InvoiceService.CreateAsync`, `GeneratePreviewPdfAsync`
- Invoice numbering comes from `CompanyInvoiceSettings`.
  - Evidence: `InvoiceService.GenerateInvoiceNumberAsync`
- Invoice numbering supports prefix, next number, padding, optional yearly reset, and custom pattern when prefix contains `{`.
  - Evidence: `InvoiceService.GenerateInvoiceNumberAsync`, `SettingsService`
- Due date for recurring/generated invoices defaults to `issueDate + PaymentDueDays`, default `7`.
  - Evidence: `InvoiceService`, `AppDbContext`
- Invoice status is derived for display:
  - `Paid` if fully paid
  - `Void` if voided
  - `Draft` if draft
  - `Overdue` if amount due remains after due date
  - otherwise `Open`
  - Evidence: `InvoiceService.ResolveStatus`
- Voided invoices cannot be sent, marked paid, or receive payments.
  - Evidence: `InvoiceService.SendInvoiceAsync`, `MarkPaidAsync`, `RecordPaymentWithProofAsync`
- Credit notes reduce displayed net invoice amount.
  - Evidence: `InvoiceService.Map`, `CreditNoteService`

## Payment Rules

- Payment tracking is feature-gated.
  - Evidence: `PaymentService.GetAsync`, `GetByIdAsync`
- Payment link generation is separately feature-gated.
  - Evidence: `PaymentService.CreatePaymentLinkAsync`
- Payment links currently use Billplz only.
  - Evidence: `PaymentService`, `SettingsService.TestCompanyPaymentGatewayAsync`
- Creating a payment link creates a pending `Payment` and a first `PaymentAttempt`.
  - Evidence: `PaymentService.CreatePaymentLinkAsync`
- Failed payment retries are limited to fewer than 3 attempts.
  - Evidence: `PaymentService.RetryFailedPaymentsAsync`
- Manual payment recording cannot exceed current invoice balance.
  - Evidence: `InvoiceService.RecordPaymentWithProofAsync`
- Manual mark-paid applies the remaining outstanding balance only.
  - Evidence: `InvoiceService.MarkPaidAsync`
- Payment proof uploads allow PNG/JPG/JPEG/WEBP, require image content types, and use a platform-configured size cap capped at 5 MB.
  - Evidence: `InvoiceService.SavePaymentProofAsync`, `PaymentConfirmationService.SaveSubmissionProofAsync`
- Receipt generation occurs on demand for succeeded payments if no receipt PDF exists yet.
  - Evidence: `PaymentService.DownloadReceiptAsync`

## Public Payment Confirmation Rules

- Public payment confirmation is feature-gated.
  - Evidence: `PaymentConfirmationService`
- Public token lifetime is 30 days.
  - Evidence: `PaymentConfirmationService.PublicTokenLifetimeDays`
- Only one pending payment confirmation is allowed per invoice at a time.
  - Evidence: `PaymentConfirmationService.SubmitPublicAsync`
- Public confirmation cannot be submitted for voided or fully paid invoices, and cannot use a future paid date beyond 5 minutes or a date older than 180 days.
  - Evidence: `PaymentConfirmationService.SubmitPublicAsync`
- Public confirmation amount must exactly match the full outstanding balance.
  - Evidence: `PaymentConfirmationService.SubmitPublicAsync`
- Approving a confirmation updates invoice balances and creates a succeeded payment with gateway name `Customer confirmation`.
  - Evidence: `PaymentConfirmationService.ApproveAsync`
- Rejecting a confirmation only changes review state.
  - Evidence: `PaymentConfirmationService.RejectAsync`

## Reminder Rules

- Dunning rules are company-specific.
  - Evidence: `SettingsService.GetDunningRulesAsync`, `UpdateDunningRulesAsync`
- Only one active dunning rule is allowed per day offset.
  - Evidence: `SettingsService.UpdateDunningRulesAsync`
- Reminder schedules are generated per invoice per active rule.
  - Evidence: `InvoiceService.CreateAsync`, generated invoice paths, `SettingsService.RebuildReminderSchedulesAsync`
- Reminder schedules are cancelled when invoice payment succeeds through gateway callback.
  - Evidence: `PaymentService.MarkPaymentAsync`
- `Needs confirmation`: exact WhatsApp reminder behavior and cap enforcement should be reviewed in `InvoiceService.SendRemindersAsync` and WhatsApp services before modifying

## Platform Package Billing Rules

- Subscriber companies have selected package, pending upgrade package, package status, grace period end, and billing cycle start.
  - Evidence: `Company` entity, `SubscriberPackageBillingService`
- First-time package provisioning creates a platform subscription invoice (`SourceType.PlatformSubscription`).
  - Evidence: `SubscriberPackageBillingService.ProvisionForSubscriberCompanyAsync`
- Package invoice prefix defaults to `SUB`.
  - Evidence: `SubscriberPackageBillingService.PlatformInvoicePrefix`
- Package due date is `issue date + PaymentDueDays`.
  - Evidence: `ProvisionForSubscriberCompanyAsync`
- Grace period end is due date plus package `GracePeriodDays`.
  - Evidence: `ProvisionForSubscriberCompanyAsync`
- Package status transitions observed in code:
  - `pending_verification`
  - `pending_payment`
  - `grace_period`
  - `past_due`
  - `active`
  - `upgrade_pending_payment`
  - `reactivation_pending_payment`
  - `terminated`
  - Evidence: auth flow/tests, `SubscriberPackageBillingService`, `FeatureEntitlementService`
- Upgrade rules: only active packages can be upgraded, downgrades are blocked, cadence/currency must match, only one pending upgrade can exist, and upgrade price is prorated by remaining cycle time.
  - Evidence: `BuildUpgradePreviewAsync`, `CreateUpgradeInvoiceAsync`
- First-time package activation cannot be cancelled.
  - Evidence: integration test `CancelPendingUpgrade_IsRejected_ForFirstTimePackageActivation`
- Pending upgrade cancellation is blocked if payment already succeeded or payment confirmation is still pending.
  - Evidence: `CancelPendingUpgradeAsync`
- Expired grace periods move package status to `past_due`.
  - Evidence: `ReconcileExpiredPackageStatusesAsync`
- Successful payment of a platform subscription invoice activates package access and may clear pending upgrade state.
  - Evidence: `PaymentService.MarkPaymentAsync`

## Partial Payment / Overpayment Handling

- Manual recorded invoice payments can be partial.
  - Evidence: `InvoiceService.RecordPaymentWithProofAsync`
- Overpayment is rejected for manual payment recording.
  - Evidence: `InvoiceService.RecordPaymentWithProofAsync`
- Public payment confirmations do not support partial payment; they must equal outstanding balance.
  - Evidence: `PaymentConfirmationService.SubmitPublicAsync`
- `Needs confirmation`: customer balance transactions exist in the data model, but broad overpayment/credit carry-forward behavior is not clearly active in current UI flows

## Malaysia-Specific / Tax Rules

- System is strongly oriented to Malaysia: `MYR`, SST-style tax naming/defaults, Billplz, and Malaysian presentation choices.
  - Evidence: multiple services, `README.md`, frontend formatting
- Tax is optional; when enabled, tax rate must be positive.
  - Evidence: `InvoiceService.GeneratePreviewPdfAsync`, `SettingsService.UpdateCompanyInvoiceSettingsAsync`
- Tax amount is rounded to 2 decimals with `MidpointRounding.AwayFromZero`.
  - Evidence: `InvoiceService.CalculateTaxAmount`, `SubscriberPackageBillingService.CalculateTaxAmount`
