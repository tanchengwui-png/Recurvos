# README_AI

Read this file first before making changes.

## Purpose

This repository is `Recurvos`, a multi-tenant subscription billing system aimed at Malaysian businesses. It supports:

- subscriber/company onboarding
- customer, product, and plan management
- manual invoices and recurring subscription invoices
- payment tracking and Billplz payment links
- customer-submitted payment confirmations with review
- platform-owned package billing for the Recurvos product itself
- reminders, exports, audit logs, and platform administration

The codebase has two overlapping business layers:

1. Tenant billing for each subscriber's own business operations
2. Platform billing where Recurvos charges subscriber companies for package access

Future work must keep those flows separate.

## What Problem The System Solves

Recurvos lets a subscriber company manage invoices, subscriptions, and payments for its own customers, while the platform owner manages the SaaS packages, subscriber access, and operational controls behind the product.

## Main Modules

- Authentication and onboarding
- Platform packages and feature entitlements
- Companies and billing readiness
- Customers
- Products and product plans
- Subscriptions
- Invoices
- Payments and payment confirmations
- Refunds and credit notes
- Settings, reminders, WhatsApp, SMTP, payment gateway config
- Platform administration, audit logs, email logs, feedback

## High-Level Architecture

- Backend: ASP.NET Core Web API on .NET 8
- Frontend: React + TypeScript + Vite SPA
- Database: PostgreSQL with EF Core migrations
- Jobs: Hangfire recurring jobs
- Storage: local filesystem for invoices, receipts, logos, proofs, email artifacts
- Payment gateway abstraction exists, but Billplz is the only implemented gateway
- Separate Node worker exists for `whatsapp-web.js`

Business logic primarily lives in `src/Recurvos.Infrastructure/Services`, not in controllers.

## Important Constraints

- Truth is in code, especially service classes and integration tests
- Currency is effectively fixed to `MYR` in current flows
- Package features gate many actions; do not assume a user can access a module
- Tenant billing and platform package billing use different invoice/payment flows
- Controllers are thin; service classes carry the behavior
- Status transitions matter and are spread across invoice, payment, subscription, and package-billing services
- Some modules are intentionally limited today:
  - only Billplz is supported
  - some pricing/subscription updates only support simple cases
  - some finance objects exist but are not fully surfaced in UI

## Read Next

Read these files in order:

1. `docs/01-product-overview.md`
2. `docs/02-business-rules.md`
3. `docs/03-architecture.md`
4. `docs/04-module-map.md`
5. `docs/05-coding-rules.md`
6. `docs/06-current-priorities.md`
7. `docs/07-known-issues.md`
8. `docs/08-task-template.md`

## Rules For Future Codex Sessions

- Do not assume business logic from names alone
- Verify behavior in services, contracts, and tests before changing code
- Prefer minimal safe changes over broad refactors
- Preserve the current architecture unless the task explicitly requires restructuring
- Keep controllers thin and place behavior in the correct service/layer
- Keep package/feature gating intact
- Treat invoice numbering, payment state, and audit-sensitive flows carefully
- Mark uncertainty explicitly as `Needs confirmation`

## Required Workflow Before Coding

Before implementing anything:

1. Read this file and the docs above in order
2. Summarize your understanding of the business flow and constraints
3. List assumptions explicitly
4. List the impacted files before editing
5. Confirm you are not mixing tenant billing logic with platform package billing logic

Do not start implementation without first summarizing understanding and impacted files.
