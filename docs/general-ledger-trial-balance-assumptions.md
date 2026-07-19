# Accounting Phase 2 — General Ledger and Trial Balance

Both reports read only `JournalEntryLine` records whose headers are accounting-effective: `Posted` journals and `Reversed` source journals. Draft and cancelled journals are excluded. A reversal journal is posted while its source becomes Reversed in Phase 1; including both makes the debit/credit swap net to zero naturally.

Reports use the base-currency debit and credit snapshots already stored on each journal line. Date ranges are inclusive in the UI; the API converts the end date to an exclusive next-day boundary. Opening balance is all effective posted activity before the selected start, period activity is inside the range, and closing is opening plus period debit less period credit.

The chart of accounts has account type but no parent-account hierarchy yet, so Trial Balance is grouped/sorted by account code and displays account type. It intentionally includes accounts with journal activity through the selected end date, even if currently inactive, to preserve history. Period-close controls and accounting dimensions are not yet available.

`IAccountingReportService` is the shared report-query boundary for future Profit & Loss, Balance Sheet, and Cash Flow modules. CSV exports reuse the existing `FinanceExportFile` convention; browser print reuses the application’s existing print pattern.
