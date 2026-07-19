# Journal Entries — Accounting Phase 1

## Scope and architectural fit

Phase 1 adds manual double-entry journals. `JournalEntry` and `JournalEntryLine` are the authoritative accounting records; their posted lines are deliberately report-ready for the General Ledger, Trial Balance, and Financial Statements. The pre-existing `LedgerPosting` remains an integration/export primitive for current billing workflows and is not reused as the journal header/line store.

Existing components reused: company-owned entity scoping, `Account` (chart of accounts), `CurrencyDefinition`, `IAuditService`, `ICurrentUserService`, EF Core `AppDbContext`, `ManageBilling` authorization, and the existing Sales/Purchases controller/service/page/grid/confirmation patterns. No generic document framework is introduced.

## Data model

`JournalEntry` (header) has company, immutable `JournalNumber`, date, transaction currency, exchange rate to the company's base currency, reference, description, status, reversal links, and created/updated/posted/cancelled audit fields. `Company.JournalEntrySequence` allocates unique numbers (`JE-000001`) transactionally per company.

`JournalEntryLine` belongs to one header and stores sort order, account FK, account code/name snapshots, description, transaction-currency debit/credit, and base-currency debit/credit. Account snapshots make historical reporting stable if an account is later renamed. Each line has exactly one positive side. Header-to-lines is cascade delete only while the header is draft; account deletion is restricted. A unique `(CompanyId, JournalNumber)` and `(JournalEntryId, SortOrder)` protect identity and ordering.

Relationships: Company 1:* JournalEntry; JournalEntry 1:* JournalEntryLine; Account 1:* JournalEntryLine; a posted journal has at most one reversal journal, and the reversal references the source.

## Lifecycle and validation

- Draft → Posted: server validates a minimum of two lines, a positive amount on exactly one side of every line, and equal debit/credit totals rounded to two decimals. It then stamps poster/time and locks the journal.
- Posted → Reversed: server creates a new posted journal with debits/credits (including base amounts) swapped, links both records, and marks the source Reversed. It never changes posted amounts.
- Draft → Deleted: physical deletion is allowed only before posting, preserving the established Sales/Purchases draft rule.
- Draft → Cancelled: a retained draft may be cancelled for audit visibility; posted journals cannot be cancelled.

Account selection must be active, manual-entry enabled, and belong to the same company. The company is ownership-scoped through the subscriber, so cross-company access is rejected. Currency must be an active company currency; exchange rate must be positive. Transaction and base amounts are stored separately, avoiding a later reporting migration when multi-currency GL is enabled. Current Phase 1 assumes each company’s `Company.Currency` is its base currency and no accounting-period close exists yet.

## API/service/UI

`/api/accounting/journal-entries` provides scoped list/search/filter (company, status, date, text), get, create, update, delete, post, reverse, and cancel. Write operations use `ManageBilling`; reads require an authenticated owned-company user. The service is the single place enforcing lifecycle, account, balance, currency, and sequence rules; all writes emit audit records.

The UI provides Journal List, Create/Edit Journal with an account editable grid, Journal Detail, status badges, and confirmation dialogs for post/reverse/delete/cancel. It uses the same shared tables, pagination, action menus, confirmation modal, master-data lookup, and form conventions as Sales and Purchases.

## Concerns and assumptions

There is no period-close/lock model, tax engine posting map, dimensions/cost centres, or automatic Sales/Purchases-to-GL generation today. Those are intentionally outside Phase 1. Their future posting routines should create `JournalEntry` headers/lines rather than mutate `LedgerPosting`; source document identifiers can be added as nullable header references when automatic posting is introduced. The current `ManageBilling` policy is the closest established permission; a dedicated accounting permission can replace it later without changing the service contract.
