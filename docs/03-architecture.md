# 03 Architecture

## Tech Stack

- Backend: ASP.NET Core Web API, .NET 8
- Frontend: React, TypeScript, Vite
- Database: PostgreSQL
- ORM: EF Core
- Jobs: Hangfire with PostgreSQL storage
- Auth: JWT access tokens + refresh tokens
- Email: SMTP abstraction
- Payments: `IPaymentGateway` abstraction with Billplz implementation
- File storage: local filesystem abstraction
- WhatsApp worker: separate Node.js service in `src/Recurvos.WhatsAppWorker`

## Solution Structure

- `src/Recurvos.Domain`
  - entities and enums
- `src/Recurvos.Application`
  - contracts, DTOs, interfaces, validators, shared application abstractions
- `src/Recurvos.Infrastructure`
  - EF Core, services, jobs, gateway adapters, templates, auth helpers, seeding
- `src/Recurvos.Api`
  - controllers, startup, auth middleware, Swagger setup
- `src/Recurvos.Web`
  - React SPA, screens, components, hooks, API client
- `tests/Recurvos.Application.Tests`
  - unit/integration coverage for billing behavior

## Responsibility Split

## Frontend

- Handles routing, forms, dashboards, tables, and workflow screens
- Calls API through `src/Recurvos.Web/src/lib/api.ts`
- Business rules are partially reflected in UI, but backend remains authoritative

## API Layer

- Controllers are thin request/response adapters
- Authorization is done through JWT/claims and policies
- JSON enum serialization is string-based
- Global exception handler maps common domain/service exceptions to HTTP responses

## Application Layer

- Defines contracts and abstractions
- Provides DTOs and validation helpers
- Does not contain most runtime business behavior

## Infrastructure Layer

- Main business logic lives here
- Service classes orchestrate entity changes, feature checks, side effects, and audit logs
- EF Core persistence, storage, templates, gateway integrations, and jobs also live here

## Database / Persistence

- `AppDbContext` is the main model
- Tenant isolation is reinforced by:
  - company-owned entities requiring `CompanyId`
  - subscriber/company ownership checks inside services
- Migrations are extensive and show recent growth in package billing, payment confirmation, feedback, tax, and document-numbering areas

## Background Jobs

Registered in `src/Recurvos.Api/Program.cs`:

- `GenerateInvoicesJob`
- `GenerateSubscriberPackageInvoicesJob`
- `ReconcileSubscriberPackageStatusesJob`
- `SendInvoiceRemindersJob`
- `RetryFailedPaymentsJob`
- `CleanupStaleSignupsJob`

These jobs are part of normal business behavior, not optional tooling.

## Key Services

- `AuthService`
- `CompanyService`
- `CustomerService`
- `ProductService`
- `ProductPlanService`
- `SubscriptionService`
- `InvoiceService`
- `PaymentService`
- `PaymentConfirmationService`
- `RefundService`
- `CreditNoteService`
- `SettingsService`
- `FeatureEntitlementService`
- `SubscriberPackageBillingService`
- `PlatformService`
- `DashboardService`
- `WebhookService`

## Where Business Logic Lives

Mostly in:

- `src/Recurvos.Infrastructure/Services/*.cs`

Especially important:

- `InvoiceService.cs`
- `SubscriptionService.cs`
- `PaymentService.cs`
- `PaymentConfirmationService.cs`
- `SubscriberPackageBillingService.cs`
- `FeatureEntitlementService.cs`
- `SettingsService.cs`

## Important Patterns Already Used

- Thin controllers, service-heavy backend
- DTO/contracts separated from persistence entities
- Package/feature gating before operations
- Audit logging on important mutations
- EF Core includes/query projection rather than repository abstraction
- Hangfire for scheduled operational logic
- Local storage paths resolved through configuration
- UI routing split between tenant screens and platform-owner screens

## Deployment / Environment Overview

Inferred from repo files:

- Docker compose exists for local/staging deployment
- API and web have Dockerfiles
- Hangfire dashboard is exposed by API
- Local development supports reset/reseed mode
- App URLs, SMTP, Billplz, storage, and WhatsApp worker settings are configurable
- `Needs confirmation`: exact production hosting topology is not fully documented in code alone

## Technical Constraints Future Work Should Respect

- Do not move business rules into controllers
- Do not bypass feature entitlement checks
- Do not break background job assumptions
- Keep filesystem paths/config behavior intact unless storage is intentionally redesigned
- Treat package billing and tenant billing as separate architectural flows
