# Sales and Purchases Architecture

## Purpose

This document defines the target architecture for adding full sales and purchases modules to the current Recurvos codebase before implementation.

It is designed to fit the existing stack:

- Backend: `Recurvos.Api`, `Recurvos.Application`, `Recurvos.Infrastructure`, `Recurvos.Domain`
- Frontend: `Recurvos.Web`
- Persistence: EF Core with company-owned entities and audit logs
- Existing accounting primitives: `LedgerPosting`, `CustomerBalanceTransaction`, invoice/payment/refund/credit note models

This document is the architectural contract for phased implementation. Phase 1 foundation work can be implemented while later document modules are still pending.

## Adopted Decisions

### Contact Naming

- `Contact` is the primary business concept
- Existing `Customer` tables, APIs, DTO names, and routes remain in place for backward compatibility
- UI terminology should gradually prefer `Contact`
- New modules should refer conceptually to contacts, while reusing current customer structures until a later migration phase

### Invoice Status Compatibility

- Existing backend `InvoiceStatus` values remain intact for now
- Richer invoice lifecycle states should be derived in DTOs and UI
- Backend enum redesign is deferred to a later compatibility-safe phase

### Phase 1 Master Structures

Phase 1 must include integrated masters for:

- Warehouse
- Account
- Tax
- Payment Term
- Currency

These may start minimal, but they are part of the permanent architecture and should be referenced by new modules from the beginning.

### Sales Workflow Flexibility

Both workflows are supported:

- Quotation -> Sales Order -> Delivery Order -> Invoice -> Payment
- Quotation -> Sales Order -> Invoice -> Payment

Rules:

- Delivery order is optional
- Direct invoicing from sales order is supported
- Invoicing from delivery order is supported
- Partial delivery and partial invoicing must be supported in both branches

## Current Baseline

The system already has:

- Contacts (`Customer`) that can represent Customer, Supplier, Employee, or mixed roles
- Products and product plans
- Invoices, payments, refunds, credit notes
- Subscriptions
- Audit logs
- Early ledger posting and finance export structures

The system does not yet have:

- Sales quotation/order/delivery chain
- Purchase order/receipt/bill chain
- Inventory movement ledger
- Full receivable/payable subledger
- Double-entry accounting engine

## Architectural Principles

1. Reuse the current layered pattern.
   - Domain entities in `Recurvos.Domain`
   - Contracts and service interfaces in `Recurvos.Application`
   - EF and orchestration in `Recurvos.Infrastructure`
   - Thin controllers in `Recurvos.Api`
   - Page-per-module in `Recurvos.Web`

2. Normalize document structure.
   - Use common concepts across sales and purchases: header, line, status, source references, fulfillment state, billing state, tax state, posting state

3. Preserve existing invoice/payment logic where possible.
   - Existing `Invoice`, `Payment`, `Refund`, `CreditNote` should be enhanced, not replaced

4. Build subledger-first, then GL posting.
   - AR/AP balances must be reproducible from document events
   - GL postings should be generated from approved/posted business events

5. Design for warehouse and multi-location support now.
   - Even if only one warehouse exists today, stock movement records must support many warehouses later

6. Never use destructive deletion after downstream usage.
   - Business documents should mostly use status transitions and soft closure, not physical delete

## Bounded Contexts

### 1. Contacts

Owns:

- Contact master record
- Billing and shipping addresses
- Receivable/payable account mapping
- Default terms, currency, tax profile

### 2. Sales

Owns:

- Quotations
- Sales orders
- Delivery orders
- Sales invoices
- Sales credit notes
- Sales receipts/payments
- Sales refunds

### 3. Purchases

Owns:

- Purchase orders
- Goods received notes
- Supplier bills
- Purchase credit notes
- Purchase payments
- Purchase refunds

### 4. Inventory

Owns:

- Item stock movement ledger
- Warehouse/location balances
- Allocation and fulfillment quantities

### 5. Accounting

Owns:

- AR/AP subledger transactions
- GL posting batches and lines
- Tax determination snapshots
- Posting status and period controls

### 6. Document Rendering

Owns:

- Numbering
- Print/PDF generation
- Email/share/export

## Target Domain Model

### Shared Header Pattern

Every business document header should include:

- `Id`
- `CompanyId`
- `DocumentNo`
- `DocumentDateUtc`
- `Status`
- `ContactId`
- `ContactNameSnapshot`
- `Currency`
- `ExchangeRate`
- `Terms`
- `ReferenceNo`
- `Notes`
- `SalespersonOrBuyer`
- `TaxProfileSnapshotJson`
- `BillingAddressSnapshotJson`
- `ShippingAddressSnapshotJson`
- `Subtotal`
- `TaxAmount`
- `DiscountAmount`
- `RoundingAmount`
- `TotalAmount`
- `CreatedByUserId`
- `UpdatedAtUtc`
- `ApprovedByUserId`
- `ApprovedAtUtc`
- `CancelledByUserId`
- `CancelledAtUtc`
- `PostingStatus`

### Shared Line Pattern

Every document line should include:

- `Id`
- `HeaderId`
- `SortOrder`
- `ProductId`
- `ProductNameSnapshot`
- `SkuSnapshot`
- `Description`
- `Uom`
- `Quantity`
- `UnitPrice`
- `DiscountRate`
- `DiscountAmount`
- `TaxCode`
- `TaxRate`
- `TaxAmount`
- `LineSubtotal`
- `LineTotal`
- `WarehouseId` nullable
- `LocationId` nullable
- `SourceDocumentType` nullable
- `SourceDocumentLineId` nullable
- `FulfilledQuantity`
- `BilledQuantity`
- `ReturnedQuantity`

## New Database Design

### Core Master Tables

#### `Warehouses`

Columns:

- `Id`
- `CompanyId`
- `Code`
- `Name`
- `IsActive`
- `AddressJson`

Indexes:

- `(CompanyId, Code)` unique
- `(CompanyId, IsActive)`

#### `Accounts`

Columns:

- `Id`
- `CompanyId`
- `Code`
- `Name`
- `Type` = Asset, Liability, Equity, Revenue, Expense
- `CurrencyCode`
- `AllowManualEntries`
- `IsActive`
- `Description`

Indexes:

- `(CompanyId, Code)` unique
- `(CompanyId, Type, IsActive)`

#### `TaxCodes`

Columns:

- `Id`
- `CompanyId`
- `Code`
- `Name`
- `Rate`
- `Scope` = Sales, Purchase, Both
- `IsSst`
- `MyInvoisTaxTypeCode`
- `IsActive`

Indexes:

- `(CompanyId, Code)` unique
- `(CompanyId, Scope, IsActive)`

#### `PaymentTerms`

Columns:

- `Id`
- `CompanyId`
- `Code`
- `Name`
- `Days`
- `IsActive`

Indexes:

- `(CompanyId, Code)` unique
- `(CompanyId, IsActive)`

#### `CurrencyDefinitions`

Columns:

- `Id`
- `CompanyId`
- `Code`
- `Name`
- `Symbol`
- `DecimalPlaces`
- `IsActive`

Indexes:

- `(CompanyId, Code)` unique
- `(CompanyId, IsActive)`

#### `InventoryItems`

Use current `Product` where possible for sellable items. If services and stock items must diverge, add:

- `ItemType` = Service, Stock, NonStock
- `TrackInventory`
- `DefaultWarehouseId`
- `SalesAccountCode`
- `InventoryAccountCode`
- `CogsAccountCode`
- `PurchaseAccountCode`
- `TaxCode`

Indexes:

- `(CompanyId, Code)` unique
- `(CompanyId, ItemType, IsActive)`

### Sales Tables

#### `SalesQuotations`

Relationships:

- one-to-many `SalesQuotationLines`
- optional source to future revisions

Additional columns:

- `ExpiryDateUtc`
- `Status` = Draft, Sent, Accepted, Rejected, Expired, Converted
- `ConvertedSalesOrderId` nullable

Indexes:

- `(CompanyId, DocumentNo)` unique
- `(CompanyId, ContactId, Status, DocumentDateUtc)`
- `(CompanyId, ExpiryDateUtc, Status)`

#### `SalesQuotationLines`

Indexes:

- `(HeaderId, SortOrder)`
- `(HeaderId, ProductId)`

#### `SalesOrders`

Additional columns:

- `QuotationId` nullable
- `Status` = Draft, Confirmed, PartiallyDelivered, FullyDelivered, Closed, Cancelled
- `DeliveryStatus`
- `InvoiceStatus`

Indexes:

- `(CompanyId, DocumentNo)` unique
- `(CompanyId, ContactId, Status, DocumentDateUtc)`
- `(CompanyId, QuotationId)`

#### `SalesOrderLines`

Additional columns:

- `OrderedQuantity`
- `DeliveredQuantity`
- `InvoicedQuantity`

Indexes:

- `(HeaderId, SortOrder)`
- `(HeaderId, SourceDocumentLineId)`

#### `DeliveryOrders`

Additional columns:

- `SalesOrderId` nullable
- `Status` = Draft, Delivered, PartiallyInvoiced, FullyInvoiced, Cancelled
- `DeliveryDateUtc`

Indexes:

- `(CompanyId, DocumentNo)` unique
- `(CompanyId, SalesOrderId, Status)`
- `(CompanyId, ContactId, DeliveryDateUtc)`

#### `DeliveryOrderLines`

Additional columns:

- `DeliveredQuantity`
- `InvoicedQuantity`

Indexes:

- `(HeaderId, SortOrder)`
- `(HeaderId, SourceDocumentLineId)`

### Invoice Enhancement

Current `Invoices` and `InvoiceLineItems` should be enhanced rather than replaced.

Add to `Invoices`:

- `SourceDocumentType` = Manual, SalesOrder, DeliveryOrder, Subscription, PlatformSubscription, PurchaseBillMigration
- `SourceDocumentId` nullable
- `IssueStatus` = Draft, Issued, Cancelled
- `CollectionStatus` = Unpaid, PartiallyPaid, Paid, Overdue
- `PostedAtUtc`
- `PostedByUserId`
- `MyInvoisSubmissionId` nullable
- `MyInvoisStatus`

Status mapping:

- Keep current enum for compatibility if needed
- Add richer derived status in DTO/UI first
- Suggested derived UI states: Draft, Issued, Partially Paid, Paid, Overdue, Cancelled

Indexes:

- `(CompanyId, InvoiceNumber)` unique
- `(CompanyId, CustomerId, DueDateUtc, Status)`
- `(CompanyId, SourceDocumentType, SourceDocumentId)`

### Credit Note Enhancement

Current `CreditNotes` should support:

- `Status` = Draft, Approved, Applied, Cancelled
- `ReferenceMode` = Invoice, ReturnOnly, Adjustment
- `AffectsInventory`
- `ReturnWarehouseId` nullable

Indexes:

- `(CompanyId, CreditNoteNumber)` unique
- `(CompanyId, CustomerId, Status, IssuedAtUtc)`

### Payment Enhancement

Current `Payments` should distinguish:

- `PaymentMode` = Receipt, InvoicePayment, Deposit
- `Status` = Draft, Posted, Reversed
- `CustomerId`
- `UnappliedAmount`
- `DepositBalance`

Add child table `PaymentApplications`:

- `Id`
- `CompanyId`
- `PaymentId`
- `InvoiceId`
- `AppliedAmount`
- `AppliedAtUtc`

Indexes:

- `(CompanyId, PaymentId)`
- `(CompanyId, InvoiceId)`

### Refund Enhancement

Current `Refunds` should add:

- `ReferenceType` = Payment, CreditNote
- `ReferenceId`
- `Status` = Draft, Approved, Refunded, Cancelled

Indexes:

- `(CompanyId, PaymentId, Status)`
- `(CompanyId, ReferenceType, ReferenceId)`

### Purchase Tables

#### `PurchaseOrders`

Columns mirror sales orders, using supplier contact.

Status:

- Draft
- Sent
- Approved
- PartiallyReceived
- FullyReceived
- Closed
- Cancelled

Indexes:

- `(CompanyId, DocumentNo)` unique
- `(CompanyId, ContactId, Status, DocumentDateUtc)`

#### `PurchaseOrderLines`

Track:

- `OrderedQuantity`
- `ReceivedQuantity`
- `BilledQuantity`

#### `GoodsReceivedNotes`

Status:

- Draft
- Received
- PartiallyBilled
- FullyBilled
- Cancelled

Columns:

- `PurchaseOrderId` nullable
- `ReceivedDateUtc`

Indexes:

- `(CompanyId, DocumentNo)` unique
- `(CompanyId, PurchaseOrderId, Status)`

#### `GoodsReceivedNoteLines`

Track:

- `ReceivedQuantity`
- `BilledQuantity`

#### `PurchaseBills`

Recommended approach:

- Add new table instead of overloading current `Invoices`

Columns:

- standard header fields
- `BillNo`
- `SupplierInvoiceNo`
- `PurchaseOrderId` nullable
- `GoodsReceivedNoteId` nullable
- `Status` = Draft, Issued, PartiallyPaid, Paid, Overdue, Cancelled
- `AmountDue`
- `AmountPaid`

Indexes:

- `(CompanyId, BillNo)` unique
- `(CompanyId, ContactId, DueDateUtc, Status)`
- `(CompanyId, GoodsReceivedNoteId)`

#### `PurchaseBillLines`

Same normalized line fields

#### `PurchaseCreditNotes`

Status:

- Draft
- Approved
- Applied
- Cancelled

#### `PurchasePayments`

Status:

- Draft
- Posted
- Reversed

Add `PurchasePaymentApplications`:

- `PurchasePaymentId`
- `PurchaseBillId`
- `AppliedAmount`

#### `PurchaseRefunds`

Status:

- Draft
- Approved
- Refunded
- Cancelled

### Inventory Tables

#### `InventoryMovements`

Columns:

- `Id`
- `CompanyId`
- `ItemId`
- `WarehouseId`
- `LocationId` nullable
- `MovementType` = SalesDelivery, SalesReturn, PurchaseReceipt, PurchaseReturn, StockAdjustment, OpeningBalance, TransferOut, TransferIn
- `SourceDocumentType`
- `SourceDocumentId`
- `SourceLineId`
- `QuantityIn`
- `QuantityOut`
- `UnitCost`
- `TotalCost`
- `MovementDateUtc`
- `PostedAtUtc`

Indexes:

- `(CompanyId, ItemId, WarehouseId, MovementDateUtc)`
- `(CompanyId, SourceDocumentType, SourceDocumentId)`
- `(CompanyId, WarehouseId, MovementDateUtc)`

#### `InventoryBalances`

Optional materialized balance table:

- `(CompanyId, ItemId, WarehouseId, OnHandQuantity, ReservedQuantity, AvailableQuantity, AverageCost)`

Unique index:

- `(CompanyId, ItemId, WarehouseId)`

### Accounting Tables

#### Extend `LedgerPostings`

Current table is too flat for a real GL.

Recommended:

- rename current usage conceptually to GL lines
- add parent table `LedgerBatches`

`LedgerBatches`:

- `Id`
- `CompanyId`
- `BatchNo`
- `SourceType`
- `SourceId`
- `PostingDateUtc`
- `Status`
- `Description`

`LedgerPostingLines`:

- `Id`
- `BatchId`
- `AccountCode`
- `DebitAmount`
- `CreditAmount`
- `Currency`
- `TaxCode` nullable
- `ContactId` nullable
- `DocumentNo` nullable

Indexes:

- `(CompanyId, SourceType, SourceId)` unique on batch
- `(BatchId)`
- `(CompanyId, PostingDateUtc, Status)`
- `(CompanyId, AccountCode, PostingDateUtc)`

#### AR/AP Subledger Transactions

Add:

- `ReceivableTransactions`
- `PayableTransactions`

Each row:

- `Id`
- `CompanyId`
- `ContactId`
- `DocumentType`
- `DocumentId`
- `DocumentNo`
- `TransactionDateUtc`
- `DueDateUtc` nullable
- `DebitAmount`
- `CreditAmount`
- `BalanceEffect`
- `Currency`
- `Status`
- `Description`

Indexes:

- `(CompanyId, ContactId, TransactionDateUtc)`
- `(CompanyId, DocumentType, DocumentId)`
- `(CompanyId, ContactId, DueDateUtc, Status)`

## Relationships

### Sales Flow

- Quotation 1..n Lines
- Quotation 0..n SalesOrders
- SalesOrder 1..n Lines
- SalesOrder 0..n DeliveryOrders
- SalesOrder 0..n Invoices
- DeliveryOrder 1..n Lines
- DeliveryOrder 0..n Invoices
- Invoice 1..n Payments through `PaymentApplications`
- Invoice 0..n CreditNotes
- Payment 0..n Refunds

### Purchase Flow

- PurchaseOrder 1..n Lines
- PurchaseOrder 0..n GoodsReceivedNotes
- PurchaseOrder 0..n PurchaseBills
- GoodsReceivedNote 1..n Lines
- GoodsReceivedNote 0..n PurchaseBills
- PurchaseBill 0..n PurchasePayments through `PurchasePaymentApplications`
- PurchaseBill 0..n PurchaseCreditNotes

## UI Design

### Shared Listing Page Pattern

Layout:

- Page title and quick actions
- Summary chips
- Search/filter toolbar
- Desktop table
- Mobile card list
- Pagination

Toolbar filters:

- Document number
- Contact
- Status
- Date range
- Company if platform-owner context ever needs it
- Source document
- Outstanding/open only

### Shared Create/Edit Page Pattern

Sections:

- Header info
- Contact and address
- Dates and terms
- Line items grid
- Totals summary
- Notes/internal notes
- Audit/meta side panel
- Conversion history

### Shared Detail Page Pattern

Sections:

- Document header
- Status ribbon
- Contact snapshot
- Line items
- Related documents timeline
- Activity/audit
- Totals/tax/payment summary

## Per-Module UI

### Quotations

Listing columns:

- Quotation No
- Date
- Expiry Date
- Customer
- Reference
- Total
- Status
- Action

Detail actions:

- Edit
- Send
- Mark accepted
- Mark rejected
- Convert to sales order
- Print/PDF

### Sales Orders

Listing columns:

- SO No
- Date
- Customer
- Source quotation
- Total
- Delivery progress
- Invoice progress
- Status
- Action

Detail actions:

- Confirm
- Convert to delivery order
- Convert to invoice
- Close
- Cancel
- Print/PDF

### Delivery Orders

Listing columns:

- DO No
- Date
- Customer
- Source SO
- Delivery date
- Invoicing progress
- Status
- Action

Detail actions:

- Deliver/post
- Convert to invoice
- Print/PDF

### Invoices

Enhance current page to support:

- richer status tabs
- source document filters
- posted vs draft workflow
- payment application summary
- AR aging indicators

### Credit Notes

Listing columns:

- CN No
- Date
- Customer
- Reference invoice
- Return stock flag
- Total
- Status
- Action

### Payments

Listing columns:

- Receipt No
- Date
- Customer
- Payment method
- Applied amount
- Unapplied amount
- Status
- Action

### Refunds

Listing columns:

- Refund No
- Date
- Customer
- Reference type
- Reference no
- Amount
- Status
- Action

### Purchase Orders

Columns:

- PO No
- Date
- Supplier
- Reference
- Total
- Receipt progress
- Bill progress
- Status
- Action

### GRNs

Columns:

- GRN No
- Date
- Supplier
- Source PO
- Received date
- Bill progress
- Status
- Action

### Bills

Columns:

- Bill No
- Supplier Invoice No
- Date
- Supplier
- Due date
- Total
- Balance
- Status
- Action

### Purchase Credit Notes, Purchase Payments, Purchase Refunds

Mirror sales equivalents with supplier terminology.

## Business Rules

### Validation Rules

Shared:

- Contact must exist and belong to company/subscriber scope
- Currency required
- At least one line required
- Quantities must be positive for commercial documents
- Amounts cannot be negative unless document type explicitly allows adjustments
- Tax snapshot saved at document creation/posting time

Sales-specific:

- Quotation expiry date cannot be before quotation date
- Sales order line quantity cannot exceed quotation remaining quantity when converting, unless user explicitly detaches
- Delivery quantity cannot exceed sales order remaining quantity
- Invoice quantity cannot exceed delivered quantity if company policy requires delivery-before-invoice

Purchase-specific:

- Received quantity cannot exceed purchase order remaining quantity
- Bill quantity cannot exceed received quantity when three-way matching is enabled

### Conversion Rules

Quotation -> Sales Order:

- allowed from `Accepted` or `Sent`
- create remaining quantities only
- preserve source references per line
- quotation status becomes `Converted` only when fully converted

Sales Order -> Delivery Order:

- allowed from `Confirmed` or `PartiallyDelivered`
- create open quantities only

Sales Order/Delivery Order -> Invoice:

- support direct invoicing from sales order without delivery order
- support invoicing from delivery order
- support partial invoicing
- if source is delivery order, invoice from delivered quantities
- if source is sales order without delivery requirement, invoice from open billable quantities

Purchase Order -> GRN:

- create open quantities only

Purchase Order/GRN -> Bill:

- partial billing supported
- quantity controls depend on matching policy

Credit Notes:

- can reference invoice/bill or stand as adjustment if policy allows
- stock return handling must create reverse inventory movement when item is stock-tracked

### Status Transition Rules

Document statuses must be explicit state machines in services, not ad hoc UI changes.

Examples:

- Quotation: Draft -> Sent -> Accepted/Rejected/Expired -> Converted
- Sales Order: Draft -> Confirmed -> PartiallyDelivered/FullyDelivered -> Closed or Cancelled
- Delivery Order: Draft -> Delivered -> PartiallyInvoiced/FullyInvoiced or Cancelled
- Invoice: Draft -> Issued -> PartiallyPaid/Paid/Overdue or Cancelled
- Payment: Draft -> Posted -> Reversed

Rules:

- no skipping from Draft to Paid
- cancelled documents cannot convert further
- posted accounting documents cannot be physically deleted

### Deletion Rules

Allow physical delete only when:

- status is Draft
- no child documents exist
- no inventory movement posted
- no GL batch posted

Otherwise:

- cancel/reverse instead

### Audit Trail Requirements

Every document must write audit entries for:

- created
- updated
- status changed
- converted
- posted
- cancelled
- deleted
- emailed
- printed/PDF exported if required

Audit metadata should include:

- source document
- target document
- quantities/amounts affected
- user id
- timestamp

## Workflow Logic

### Sales Workflow

Quotation -> Sales Order -> Delivery Order -> Invoice -> Payment

Supporting branches:

- Invoice -> Credit Note
- Payment -> Refund
- Credit Note -> Refund optional if overpayment exists

### Purchase Workflow

Purchase Order -> Goods Received Note -> Bill -> Payment

Supporting branches:

- Bill -> Purchase Credit Note
- Purchase Payment -> Purchase Refund

### Subledger Effects

Sales:

- Invoice issue/post: AR debit, revenue credit, tax payable credit
- Payment posted: cash/bank debit, AR credit
- Credit note approved: sales returns/discount debit, AR credit, tax reversal
- Refund posted: AR debit or liability debit, cash/bank credit

Purchases:

- Bill issue/post: expense/inventory debit, tax input debit, AP credit
- Purchase payment posted: AP debit, cash/bank credit
- Purchase credit note approved: AP debit, expense/inventory credit, tax reversal
- Purchase refund posted: cash/bank debit, AP credit or supplier advance credit

### Inventory Effects

Sales DO post:

- inventory out
- COGS recognized if costing engine is active

Sales credit note with return:

- inventory in

GRN post:

- inventory in

Purchase credit note with return:

- inventory out

## Contact Integration

### Customer

Contact page should expose:

- quotations
- sales orders
- delivery orders
- invoices
- payments/receipts
- credit notes
- refunds
- statements

### Supplier

Contact page should expose:

- purchase orders
- GRNs
- bills
- purchase payments
- purchase credit notes
- purchase refunds
- supplier statements

Recommendation:

- add a reusable contact activity shell with tabs by role

Backward compatibility note:

- Continue exposing existing `/customers` APIs and pages during phased migration
- Prefer `Contacts` wording in UI and new documentation

## Inventory Integration Design

### Required Structures

- item master classification
- warehouse master
- inventory movement ledger
- allocation/reservation quantities
- costing method placeholder

### First-phase support

- single-company, multi-warehouse ready
- no manufacturing
- no batch/serial tracking yet

### Future-ready hooks

- batch/lot
- serial number
- stock transfer
- reorder rules
- bin/location

## Accounting Integration Design

### Chart of Accounts

Add a proper account master if not present yet:

- `Accounts`
- `AccountTypes`
- `TaxCodes`
- `PaymentTerms`
- `CurrencyDefinitions`

### Posting Policy

Every commercial document should support:

- `PostingStatus` = Draft, Ready, Posted, Reversed
- `PostingBatchId` nullable

GL posting should be generated by a dedicated posting service, not inline page logic.

### Tax / SST / MyInvois

Store tax snapshot on each line and header:

- tax code
- tax rate
- tax amount
- exemption reason
- SST registration snapshot

For MyInvois:

- invoice and credit note need external submission identifiers and states
- purchase-side documents may later need e-invoice intake references

## API Design

### Controllers

Add controllers:

- `SalesQuotationsController`
- `SalesOrdersController`
- `DeliveryOrdersController`
- `PurchaseOrdersController`
- `GoodsReceivedNotesController`
- `PurchaseBillsController`
- `PurchaseCreditNotesController`
- `PurchasePaymentsController`
- `PurchaseRefundsController`
- optional `InventoryController`
- optional `AccountingController`

### Application Contracts

For each module add:

- request DTOs
- list DTOs
- detail DTOs
- conversion request DTOs
- print/export DTOs if needed
- status transition request DTOs

### Service Interfaces

Add services:

- `ISalesQuotationService`
- `ISalesOrderService`
- `IDeliveryOrderService`
- `IPurchaseOrderService`
- `IGoodsReceivedNoteService`
- `IPurchaseBillService`
- `IPurchaseCreditNoteService`
- `IPurchasePaymentService`
- `IPurchaseRefundService`
- `IInventoryService`
- `IGeneralLedgerService`
- `IReceivableService`
- `IPayableService`

## Frontend Design

### Pages

Add pages:

- `SalesQuotationsPage`
- `SalesQuotationFormPage`
- `SalesQuotationDetailPage`
- `SalesOrdersPage`
- `SalesOrderFormPage`
- `SalesOrderDetailPage`
- `DeliveryOrdersPage`
- `DeliveryOrderFormPage`
- `DeliveryOrderDetailPage`
- `PurchaseOrdersPage`
- `PurchaseOrderFormPage`
- `PurchaseOrderDetailPage`
- `GoodsReceivedNotesPage`
- `GoodsReceivedNoteFormPage`
- `GoodsReceivedNoteDetailPage`
- `PurchaseBillsPage`
- `PurchaseBillFormPage`
- `PurchaseBillDetailPage`
- `PurchaseCreditNotesPage`
- `PurchasePaymentsPage`
- `PurchaseRefundsPage`

### Shared UI Components

Create reusable components:

- document filter toolbar
- line item editor grid
- totals sidebar
- status badge
- related document timeline
- conversion modal
- allocation/remaining quantity cell renderer
- print/export action cluster

## Implementation Strategy

### Phase 1. Foundation

- enums
- document numbering policies
- shared document abstractions
- account/tax/warehouse tables
- AR/AP subledger tables
- ledger batch model

### Phase 2. Sales Pre-Invoice Flow

- quotations
- sales orders
- delivery orders
- source document conversions

### Phase 3. Invoice/Payment Refactor

- enhance current invoices
- payment applications
- richer invoice status logic
- customer statement rebuilt on AR subledger

### Phase 4. Purchases

- purchase orders
- GRNs
- bills
- purchase payments

### Phase 5. Credit/Refund/Inventory/Posting

- stock returns
- purchase credit notes
- subledger integration
- GL posting engine

### Phase 6. Compliance and Exports

- MyInvois enhancements
- SST reporting structures
- finance export improvements

## Code-Level Recommendations

### Domain

Add new entities under `src/Recurvos.Domain/Entities`.

Add enums under `src/Recurvos.Domain/Enums` for:

- quotation status
- sales order status
- delivery order status
- purchase order status
- GRN status
- purchase bill status
- posting status
- inventory movement type
- source document type
- payment application status if needed

### Application

Add per-module contracts and service interfaces.

Keep contracts split by bounded context, not one large accounting contract file.

### Infrastructure

Add services mirroring the existing style:

- EF-backed services
- centralized validation/state transition logic
- helper methods for conversion and posting

### API

Controllers should only orchestrate request/response and authorization.

### Web

Follow the current page style:

- listing page with filter toolbar
- form/detail pages with cards and drawer patterns
- route-per-page in `App.tsx`

## Key Decisions

1. Do not overload the current `Invoice` table to represent purchase bills.
   - Sales invoice and purchase bill accounting semantics are different enough to justify separate entities.

2. Do not model inventory as derived only from documents.
   - Keep explicit `InventoryMovements`.

3. Do not continue using flat `LedgerPosting` alone for a full GL.
   - Add a batch/header model.

4. Do not rely only on invoice/payment/refund tables for statements long term.
   - Build explicit AR/AP subledger transaction tables.

5. Keep contact master unified.
   - A single contact can be both customer and supplier.

## Immediate Next Step

Implementation should proceed in this order:

1. Phase 1 foundations
   - master data entities, APIs, pages
   - shared document/status enums
   - contact-compatible terminology updates
2. Sales document chain
   - quotations
   - sales orders
   - optional delivery orders
   - invoice conversions
3. Purchase document chain
4. Inventory and posting integration
