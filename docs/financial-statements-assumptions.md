# Accounting Phase 3 — Financial Statements

Financial statements consume only `IAccountingReportService.GetTrialBalanceAsync`; no statement service queries Sales, Purchases, or journal tables directly. Reports therefore use the same company scoping, effective-journal rules, base currency, opening balances, and date treatment as Phase 2.

Profit & Loss classifies Revenue and Expense accounts from account type. Cost of Sales is identified by `cost of sales`, `cost of goods`, or `cogs` in account metadata; `other` in the name/code identifies other income or expense. Remaining expense accounts are operating expenses. A later account-category field can replace this classifier without changing report APIs.

Balance Sheet uses closing balances. Current/non-current grouping is a documented metadata placeholder based on account name/code terms (property, plant, equipment, vehicle, long-term, non-current); all other accounts are current. Retained earnings is cumulative Revenue less Expense closing balance and is added to explicit Equity accounts. The report exposes an imbalance if Assets do not equal Liabilities plus Equity.

Cash Flow uses the indirect, base-currency account-movement layer. Cash accounts are Asset accounts whose metadata contains `cash` or `bank`. Non-cash movements are classified into investing for non-current Assets, financing for Liabilities/Equity, and operating otherwise. This is intentionally an interim classifier suitable for later Bank Reconciliation and an explicit cash-flow classification field. The report does not force an adjustment: it reports `Classification mismatch` unless classified activity equals the actual cash movement and opening plus movement equals closing.

Browser Print / Save PDF is reused for PDF output; CSV exports reuse the existing `FinanceExportFile` pattern.
