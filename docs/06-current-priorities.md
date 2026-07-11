# 06 Current Priorities

This file is an inference from recent services, migrations, pages, and tests. Treat it as directional, not absolute.

## Active Focus

- Stabilize current Sales and Purchase module work so the existing modules remain buildable and functional
- Do not add new Sales/Purchase workflow features during this stabilization phase
- Shift active development focus to foundation/master modules:
  - Chart of Accounts
  - Tax Codes
  - Payment Terms
  - Warehouses
- Deliver the standard module surface for each foundation/master module:
  - listing page
  - create/edit page
  - view page
  - search and filters
  - status support
  - validation
  - database entities
  - API endpoints

## Explicit Hold

- Do not add new Sales/Purchase document conversion flows
- Do not add posting logic
- Do not add inventory integration
- Do not add accounting integration

## Secondary Focus

- Platform administration
  - packages
  - users
  - email logs
  - audit logs
  - WhatsApp session management
- Feedback module
- Finance exports and reconciliation foundations

## Future Candidates

- Additional payment gateways beyond Billplz
- Richer disputes and reconciliation workflows
- Broader customer balance / overpayment behavior
- More complete finance and ledger capabilities
- Stronger document immutability/history features

## Needs Confirmation

- Which parts of the in-progress Sales/Purchase work are considered stable enough to keep versus defer
- Whether foundation/master modules should share a common frontend scaffolding pattern
- Whether any of the held Sales/Purchase inventory/accounting entities must remain exposed for compatibility only
