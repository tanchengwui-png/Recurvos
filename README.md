# Recurvos

Production-ready subscription billing for Malaysian businesses with:

- Backend: ASP.NET Core Web API (.NET 8)
- Frontend: React + TypeScript + Vite
- Database: PostgreSQL + EF Core
- Auth: JWT + refresh tokens
- Jobs: Hangfire
- Gateway abstraction: `IPaymentGateway` with Billplz adapter
- Storage: local invoice PDF abstraction
- Email: SMTP abstraction

## Project structure

```text
src/
  Recurvos.Domain/          Domain entities and enums
  Recurvos.Application/     DTOs, interfaces, billing rules
  Recurvos.Infrastructure/  EF Core, services, jobs, gateway adapter, migrations
  Recurvos.Api/             REST API, auth, Swagger, Hangfire bootstrap
  Recurvos.Web/             React dashboard
tests/
  Recurvos.Application.Tests/
```

## Core capabilities

- Company onboarding and JWT auth with refresh tokens
- Tenant-scoped CRUD for customers, products, and prices
- Subscription lifecycle with pause, resume, and cancel
- Role-aware authorization with `Owner`, `Admin`, and `Member`
- Recurring invoice generation via Hangfire
- Payment link generation through `IPaymentGateway`
- Webhook persistence with idempotency by external event id
- Payment attempt tracking and failed-payment retries
- Persisted dunning rules and reminder schedules
- Dashboard summary for MRR, renewals, failed payments, and overdue invoices
- Audit log persistence
- Seeded platform owner and subscriber company accounts

## Local setup

### Option 1: Docker

1. Copy [`.env.example`](/C:/recurvos/.env.example) to `.env` if you want custom values.
2. Run `docker compose up --build`.
3. API: `http://localhost:7001/swagger`
4. Web: `http://localhost:4173`
5. Mail UI: `http://localhost:8025`
6. Hangfire: `http://localhost:7001/hangfire`

### Option 2: Local tools

1. Start PostgreSQL on `localhost:5432`.
2. Optional: start MailPit on SMTP `1025`.
3. Run `dotnet restore Recurvos.sln`.
4. Run `dotnet tool restore`.
5. Run `dotnet build Recurvos.sln`.
6. Run `dotnet run --project src/Recurvos.Api --urls http://localhost:7001`.
7. In a second terminal:
   `cd src/Recurvos.Web`
   `npm install`
   `npm run dev`

The API applies EF migrations at startup and seeds a platform owner account plus a subscriber company automatically.

## Reset local data

If you want a fresh local dataset with seeded admin accounts again:

- Run [`reset-recurvos-data.cmd`](/C:/Recurvos/reset-recurvos-data.cmd)

Or run the command directly:

- `dotnet run --project src/Recurvos.Api -- --reset-demo-data`

This will:

- wipe the local database
- recreate the schema
- clear stored invoice, receipt, and email files under `storage/`
- reseed the platform owner and demo subscriber accounts

## Seed credentials

- Platform owner
  - Email: `owner@recurvo.com`
  - Password: `Passw0rd!`
- Subscriber Basic
  - Email: `tanchengwui+basic@hotmail.com`
  - Password: `Passw0rd!`
- Subscriber Growth
  - Email: `tanchengwui+growth@hotmail.com`
  - Password: `Passw0rd!`
- Subscriber Premium
  - Email: `tanchengwui+premium@hotmail.com`
  - Password: `Passw0rd!`

## Important endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET/POST/PUT/DELETE /api/customers`
- `GET/POST/PUT/DELETE /api/products`
- `GET/POST/PUT/DELETE /api/prices`
- `GET/POST /api/subscriptions`
- `POST /api/subscriptions/{id}/pause`
- `POST /api/subscriptions/{id}/resume`
- `POST /api/subscriptions/{id}/cancel`
- `GET /api/invoices`
- `GET /api/invoices/{id}`
- `POST /api/invoices/{id}/send`
- `GET /api/payments`
- `GET /api/payments/{id}`
- `POST /api/payments/invoice/{invoiceId}/link`
- `POST /api/webhooks/{gatewayName}`
- `GET /api/dashboard/summary`
- `GET /api/settings/dunning-rules`
- `PUT /api/settings/dunning-rules`

## Notes

- Currency is fixed to `MYR` for the current release.
- Subscription creation currently enforces a single billing interval across all items.
- Billplz is implemented as the first adapter; add iPay88 by implementing `IPaymentGateway`.
- Billplz payment links now call the real `/api/v3/bills` endpoint with Basic auth.
- Billplz callbacks are parsed as form posts and validated with `x_signature` HMAC when `Billplz:XSignatureKey` is configured.
- Invoice PDFs are stored under `storage/invoices`.
- Background jobs are registered for invoice generation, reminders, and failed-payment retries.
- Integration tests cover auth, invoice generation, webhook idempotency, and payment transitions.

## Verification

- `dotnet build Recurvos.sln`
- `dotnet test Recurvos.sln`
- `cd src/Recurvos.Web && npm run build`
