# 06 Current Priorities

This file is an inference from recent services, migrations, pages, and tests. Treat it as directional, not absolute.

## Active Focus

- Subscriber package billing lifecycle
  - provisioning
  - renewals
  - upgrades
  - reactivation
  - grace-period reconciliation
- Payment operations
  - payment links
  - payment confirmations
  - receipts
  - retry flow
- Subscription billing workflow
  - due invoice generation
  - pricing update constraints
  - pause/resume/cancel behavior
- Settings hardening
  - payment gateway settings
  - tax settings
  - numbering
  - WhatsApp and SMTP configuration

Evidence:

- recent service timestamps
- recent migrations around package state, payment gateway settings, numbering, and tax
- recent integration tests focused on package billing and payment confirmation

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

- Whether platform package billing is now the main product priority or just a recent milestone
- Whether finance/reconciliation entities are already relied on in production workflows
- Whether WhatsApp delivery is expected to be a first-class supported production channel or still stabilizing
- Whether the current package/feature model is final or still being iterated quickly
