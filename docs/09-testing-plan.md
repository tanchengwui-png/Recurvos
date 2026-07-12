# 09 Testing Plan

This document defines the practical testing plan for the current foundation and Sales/Purchase stabilization work in this repository.

It is intentionally tied to the test surfaces that already exist:

- backend integration tests in `tests/Recurvos.Application.Tests`
- backend unit tests in `tests/Recurvos.Application.Tests/Billing`
- frontend/browser tests in `src/Recurvos.Web/tests/e2e`
- frontend production build in `src/Recurvos.Web`

## Goals

- keep the current Sales/Purchase workflows stable
- verify the foundation/master-data modules are buildable and usable
- cover the recently added master-data integrations:
  - currencies
  - tax codes
  - payment terms
  - warehouses
  - price levels
  - customer account references
- catch regressions in invoice, purchase, inventory, and customer flows

## Test Layers

### 1. Backend Unit Tests

Use unit tests for isolated billing or formatting behavior that does not need full HTTP/database integration.

Current examples:

- `BillingCalculatorTests`
- `InvoiceTemplateTests`

Use unit tests for:

- pure pricing/default helpers
- formatter logic
- date/due-date calculators
- document numbering helpers if extracted

Command:

```bash
dotnet test tests/Recurvos.Application.Tests/Recurvos.Application.Tests.csproj --filter "FullyQualifiedName~BillingCalculatorTests|FullyQualifiedName~InvoiceTemplateTests"
```

### 2. Backend Integration Tests

This is the primary verification layer for business behavior.

Primary file:

- `tests/Recurvos.Application.Tests/Integration/BillingIntegrationTests.cs`

Cover here:

- CRUD and validation for foundation modules
- customer account/price level/payment term compatibility
- invoice creation and conversion flows
- purchase bill and GRN flows
- inventory movement side effects
- compatibility backfills and schema-repair behavior

Command:

```bash
dotnet test tests/Recurvos.Application.Tests/Recurvos.Application.Tests.csproj --filter "FullyQualifiedName~BillingIntegrationTests"
```

### 3. Frontend Build Validation

The frontend build is the minimum regression gate for TypeScript and route/component wiring.

Command:

```bash
cd src/Recurvos.Web
npm run build
```

### 4. Frontend End-to-End Tests

Use Playwright for browser-level confidence on user workflows.

Current repo commands:

- `npm run e2e`
- `npm run e2e:signup`
- `npm run e2e:step2`
- `npm run e2e:step3`
- `npm run e2e:step4`
- stress suites for invoices, customers, plans, subscriptions, payment confirmations

Core command:

```bash
cd src/Recurvos.Web
npm run e2e
```

## Coverage Matrix

### Foundation Modules

Chart of Accounts

- create/edit/view/list works
- active account filtering works
- customer account selectors only accept valid account types
- compatibility backfill can populate customer account IDs from historical account codes

Tax Codes

- create/edit/view/list works
- scope filtering works
- sales and purchase lines reject missing tax code where required
- document snapshots preserve tax rate and amounts

Payment Terms

- create/edit/view/list works
- invoice and purchase bill due-date defaults derive from selected payment term
- manual due-date override remains possible where intended

Warehouses

- create/edit/view/list works
- GRN creation requires explicit warehouse selection
- inventory movements use the selected warehouse

Currencies

- create/edit/view/list works
- document creation rejects inactive/invalid currencies
- source-document conversions preserve valid currency behavior

Price Levels

- create/edit/view/list works
- customer profile can store active price level
- sales quotation and sales order product selection can suggest price-level-adjusted prices
- manual unit price override remains allowed

### Customer Compatibility

- customer save validates account, price level, currency, and payment term selections
- customer account fields persist both:
  - validated reference IDs
  - code snapshots for compatibility
- unresolved historical rows remain readable

### Sales/Purchase Regression Areas

- invoice creation from sales order
- invoice creation from delivery order
- purchase bill creation from purchase order
- purchase bill creation from GRN
- GRN receipt inventory movement
- payment and credit note flows
- invoice/payment listing pages still render correctly

## Recommended Execution Order

For local or CI verification after changes in these areas:

1. `npm run build` in `src/Recurvos.Web`
2. backend unit tests
3. targeted `BillingIntegrationTests` filters for the touched area
4. full `BillingIntegrationTests`
5. targeted Playwright scenario if UI behavior changed
6. full Playwright suite before release if environment is available

## Targeted Test Filters By Phase

### Phase 8 Payment Terms

- invoice due-date derivation
- purchase bill due-date derivation
- manual due-date override

### Phase 9 Warehouses

- GRN creation requires warehouse
- inventory movement uses GRN warehouse

### Phase 10 Price Levels

- customer profile accepts valid price level
- sales quotation/order UI suggests adjusted price from product default plan

### Phase 11 Account References

- customer create/update persists account reference IDs
- account-type validation still rejects mismatches

### Phase 12 Compatibility Backfill

- legacy schema repair populates account IDs from historical account codes
- unresolved rows remain readable without hard failure

## Manual Smoke Checklist

- create a customer with receivable/payable/income/expense accounts
- assign payment term and price level on the customer
- create a sales quotation using a product with a default plan
- confirm suggested line price reflects the customer price level
- convert quotation to sales order
- convert sales order or delivery order to invoice with payment term behavior
- create GRN with explicit warehouse selection
- receive GRN and verify downstream bill creation still works

## Known Environment Constraints

- backend test execution requires `dotnet`
- Playwright execution requires the browser test environment to be installed and configured
- frontend build can run independently and should always be used as the minimum validation gate

## Definition Of Done For Phase 13

Phase 13 is complete when:

- the repo has a concrete, repo-specific testing plan
- backend integration coverage exists for the implemented master-data integrations
- frontend build remains green after each phase
- the intended Playwright suites are identified for browser regression coverage
