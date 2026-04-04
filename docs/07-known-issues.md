# 07 Known Issues

This file lists visible risks and unstable areas inferred from the codebase.

## Functional Limitations

- Only Billplz is supported right now.
  - Evidence: `SettingsService.TestCompanyPaymentGatewayAsync`
- Credit notes currently support one description and one amount only.
  - Evidence: `CreditNoteService`
- Subscription future pricing updates currently support single-item subscriptions only.
  - Evidence: `SubscriptionService.UpdatePricingAsync`
- Package upgrades require the same currency and billing cadence.
  - Evidence: `SubscriberPackageBillingService.BuildUpgradePreviewAsync`
- Payment disputes exist in the data model/UI but are effectively read-only in current screen behavior.
  - Evidence: `PaymentsPage.tsx`

## Architectural / Maintenance Risks

- A large share of business logic is concentrated in a few large service classes:
  - `InvoiceService`
  - `SettingsService`
  - `SubscriberPackageBillingService`
  - This makes changes powerful but easy to regress
- Package status normalization exists in multiple services with similar but not perfectly identical logic:
  - `FeatureEntitlementService`
  - `SubscriberPackageBillingService`
  - `PlatformService`
  - This is a drift risk
- Receipt/invoice numbering logic appears in multiple services
  - `InvoiceService`
  - `PaymentService`
  - `SubscriberPackageBillingService`
  - Any numbering change must review all three

## Flow Risks

- Tenant billing and platform package billing both use invoices/payments but not the same rules
  - easy area for accidental cross-flow bugs
- Reminder behavior combines email, WhatsApp, package features, and monthly limits
  - high coupling, verify carefully before modifying
- Payment success updates subscription/package state indirectly through payment callbacks
  - changes in `PaymentService.MarkPaymentAsync` can have broad side effects
- Public payment confirmation must stay aligned with payment proof upload policy and invoice balance rules

## Data / Migration Risks

- Migration history is dense and recent
  - package billing
  - feedback
  - tax settings
  - numbering
  - platform settings
- `AddRemainingSchemaToEfMigrations` suggests prior schema reconciliation work
  - future migrations should be reviewed carefully against the current snapshot

## Deployment / Ops Risks

- Local filesystem storage is used for invoices, receipts, proofs, and logos
  - deployment/storage assumptions matter
- WhatsApp depends on a separate worker process
  - worker reachability is already handled as a possible failure state
- Hangfire recurring jobs are part of core billing behavior
  - background jobs not running will materially change system behavior

## Frontend / Build Risks

- Web build currently emits a large chunk warning from Vite
  - not an immediate failure, but worth remembering for future UI growth
- Many screens are large single-file pages
  - changes are easy to make but can become noisy or fragile

## Needs Confirmation

- Whether customer deletion with historical invoices/subscriptions is fully constrained by DB rules in all cases
- Whether finance exports/reconciliation are production-critical or still partially staged
- Whether platform package status `terminated` is fully used across the UI and entitlements
