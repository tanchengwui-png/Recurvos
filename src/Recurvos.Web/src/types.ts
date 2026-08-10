export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  companyId: string;
  companyName: string;
  email: string;
  fullName: string;
  role: string;
  isPlatformOwner: boolean;
};

export type PublicPaymentStatus = {
  externalPaymentId: string;
  invoiceNumber: string;
  paymentStatus: string;
  invoiceStatus: string;
  isPaid: boolean;
  amount: number;
  currency: string;
  paidAtUtc?: string | null;
};

export type RegisterResult = {
  requiresEmailVerification: boolean;
  email: string;
  message: string;
};

export type DashboardSummary = {
  mrr: number;
  collectedThisMonth: number;
  overdueAmount: number;
  activeSubscriptions: number;
  failedPayments: number;
  upcomingRenewals: number;
};

export type UpcomingRenewal = {
  subscriptionId: string;
  companyId: string;
  company: string;
  customer: string;
  plan: string;
  amount: number;
  renewalDateUtc: string;
  status: string;
};

export type OverdueInvoice = {
  invoiceId: string;
  companyId: string;
  invoiceNumber: string;
  company: string;
  customer: string;
  dueDateUtc: string;
  amount: number;
  daysOverdue: number;
  status: string;
};

export type DashboardRecentPayment = {
  paymentId: string;
  companyId: string;
  company: string;
  customer: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: string;
  status: string;
  paymentDateUtc: string;
};

export type ScheduledCancellation = {
  subscriptionId: string;
  companyId: string;
  company: string;
  customer: string;
  plan: string;
  endDateUtc: string;
  currentStatus: string;
};

export type TrialEnding = {
  subscriptionId: string;
  companyId: string;
  company: string;
  customer: string;
  plan: string;
  trialEndDateUtc: string;
  daysLeft: number;
};

export type RevenueTrendPoint = {
  monthStartUtc: string;
  label: string;
  collectedRevenue: number;
};

export type SubscriptionGrowthPoint = {
  monthStartUtc: string;
  label: string;
  newSubscriptions: number;
  canceledSubscriptions: number;
  netGrowth: number;
};

export type RevenueByCompany = {
  companyId: string;
  company: string;
  collectedRevenue: number;
};

export type SubscriptionStatusSummary = {
  active: number;
  trialing: number;
  paused: number;
  cancelingAtPeriodEnd: number;
  canceledOrEnded: number;
};

export type ContactPerson = {
  name: string;
  role: string;
  email: string;
  phoneNumber: string;
};

export type ContactAddress = {
  addressName: string;
  streetAddress: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  postcode: string;
  country: string;
  state: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
};

export type Customer = {
  id: string;
  companyIds: string[];
  name: string;
  email: string;
  phoneNumber: string;
  externalReference: string;
  billingAddress: string;
  entityType: "Company" | "Individual" | "General Public" | "Foreign Company" | "Foreign Individual" | "Exempted Person";
  legalName: string;
  otherName: string;
  registrationNumberType: string;
  registrationNumber: string;
  oldRegistrationNumber: string;
  tin: string;
  sstRegistrationNumber: string;
  contactType: string;
  status: "Active" | "Inactive" | "Archived";
  contactPersons: ContactPerson[];
  phoneNumbers: string[];
  emailAddresses: string[];
  addresses: ContactAddress[];
  receivableAccountId?: string | null;
  receivableAccount: string;
  creditLimit?: number | null;
  payableAccountId?: string | null;
  payableAccount: string;
  groups: string[];
  priceLevel: string;
  currency: string;
  paymentTerm: string;
  incomeAccountId?: string | null;
  incomeAccount: string;
  expenseAccountId?: string | null;
  expenseAccount: string;
  location: string;
  tags: string[];
  myInvoisControl: string;
};

export type CustomerBatchUpdateFields = {
  legalName: boolean;
  email: boolean;
  phoneNumber: boolean;
  contactPersons: boolean;
  phoneNumbers: boolean;
  emailAddresses: boolean;
  addresses: boolean;
  contactType: boolean;
  status: boolean;
  receivableAccount: boolean;
  creditLimit: boolean;
  payableAccount: boolean;
  groups: boolean;
  priceLevel: boolean;
  currency: boolean;
  paymentTerm: boolean;
  incomeAccount: boolean;
  expenseAccount: boolean;
  location: boolean;
  tags: boolean;
  myInvoisControl: boolean;
};

export type CustomerBatchUpdateListMode = "Append" | "Replace" | "Remove";

export type CustomerBatchUpdateListModes = {
  contactPersons: CustomerBatchUpdateListMode;
  phoneNumbers: CustomerBatchUpdateListMode;
  emailAddresses: CustomerBatchUpdateListMode;
  addresses: CustomerBatchUpdateListMode;
  groups: CustomerBatchUpdateListMode;
  tags: CustomerBatchUpdateListMode;
};

export type CustomerBatchUpdateValues = {
  legalName: string;
  email: string;
  phoneNumber: string;
  contactPersons: ContactPerson[];
  phoneNumbers: string[];
  emailAddresses: string[];
  addresses: ContactAddress[];
  contactType: string;
  status: Customer["status"];
  receivableAccountId?: string | null;
  receivableAccount: string;
  creditLimit?: number | null;
  payableAccountId?: string | null;
  payableAccount: string;
  groups: string[];
  priceLevel: string;
  currency: string;
  paymentTerm: string;
  incomeAccountId?: string | null;
  incomeAccount: string;
  expenseAccountId?: string | null;
  expenseAccount: string;
  location: string;
  tags: string[];
  myInvoisControl: string;
};

export type CustomerBatchUpdateTargets = {
  contactPersons: ContactPerson[];
  phoneNumbers: string[];
  emailAddresses: string[];
  addresses: ContactAddress[];
  groups: string[];
  tags: string[];
};

export type CustomerBatchUpdateRequest = {
  customerIds: string[];
  fields: CustomerBatchUpdateFields;
  values: CustomerBatchUpdateValues;
  modes: CustomerBatchUpdateListModes;
  targets: CustomerBatchUpdateTargets;
};

export type CustomerBatchUpdateResult = {
  requestedCount: number;
  successCount: number;
  failureCount: number;
  failedCustomerIds: string[];
  updatedFields: string[];
  customers: Customer[];
};

export type StatementAccountType = "Customer" | "Supplier";

export type StatementRowSourceType =
  | "OpeningBalance"
  | "Invoice"
  | "Payment"
  | "CreditNote"
  | "Refund"
  | "PurchaseBill"
  | "PurchasePayment"
  | "PurchaseCreditNote"
  | "PurchaseRefund";

export type StatementAgingSummary = {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days91Plus: number;
  totalOutstanding: number;
};

export type StatementRow = {
  id: string;
  sourceType: StatementRowSourceType;
  sourceDocumentId?: string | null;
  referenceDocumentId?: string | null;
  dateUtc: string;
  dueDateUtc?: string | null;
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  outstandingAmount: number;
  isOutstanding: boolean;
  currencyCode: string;
  isOpeningBalance: boolean;
};

export type StatementOfAccountReport = {
  contactId: string;
  contactName: string;
  contactType: string;
  statementType: StatementAccountType;
  currencyCode: string;
  openingBalance: number;
  closingBalance: number;
  hasOpeningBalance: boolean;
  hasMixedCurrencies: boolean;
  currencyCodes: string[];
  aging: StatementAgingSummary;
  rows: StatementRow[];
};

export type ContactGroup = {
  id: string;
  name: string;
  contactsCount: number;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  contactIds: string[];
};

export type ProductGroup = {
  id: string;
  name: string;
  description: string;
  productsCount: number;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  productIds: string[];
};

export type ProductGroupProductLookup = {
  id: string;
  name: string;
  code: string;
  barcode?: string | null;
  isSelling: boolean;
  isBuying: boolean;
  trackInventory: boolean;
  isActive: boolean;
  companyName: string;
  productGroups: string[];
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  addressJson: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type Account = {
  id: string;
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  currencyCode: string;
  isActive: boolean;
  allowManualEntries: boolean;
  description?: string | null;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type JournalEntryStatus = "Draft" | "Posted" | "Reversed" | "Cancelled";
export type JournalEntryLine = { id: string; sortOrder: number; accountId: string; accountCode: string; accountName: string; description: string; debitAmount: number; creditAmount: number; baseDebitAmount: number; baseCreditAmount: number };
export type JournalEntryListItem = { id: string; companyId: string; companyName: string; journalNumber: string; journalDateUtc: string; currency: string; exchangeRate: number; referenceNo: string; description: string; totalDebit: number; totalCredit: number; status: JournalEntryStatus; reversesJournalEntryId?: string | null; reversedByJournalEntryId?: string | null };
export type JournalEntry = JournalEntryListItem & { createdAtUtc: string; updatedAtUtc?: string | null; postedAtUtc?: string | null; lines: JournalEntryLine[] };
export type GeneralLedgerTransaction = { journalEntryId: string; journalNumber: string; journalDateUtc: string; referenceNo: string; description: string; debitAmount: number; creditAmount: number; runningBalance: number };
export type GeneralLedgerAccount = { accountId: string; accountCode: string; accountName: string; accountType: Account["type"]; openingBalance: number; periodDebit: number; periodCredit: number; closingBalance: number; transactions: GeneralLedgerTransaction[] };
export type GeneralLedgerReport = { companyId: string; companyName: string; currency: string; fromDateUtc: string; toDateUtc: string; accounts: GeneralLedgerAccount[] };
export type TrialBalanceLine = { accountId: string; accountCode: string; accountName: string; accountType: Account["type"]; openingDebit: number; openingCredit: number; periodDebit: number; periodCredit: number; closingDebit: number; closingCredit: number };
export type TrialBalanceReport = { companyId: string; companyName: string; currency: string; fromDateUtc: string; toDateUtc: string; lines: TrialBalanceLine[]; totalOpeningDebit: number; totalOpeningCredit: number; totalPeriodDebit: number; totalPeriodCredit: number; totalClosingDebit: number; totalClosingCredit: number; isBalanced: boolean };
export type FinancialStatementAccount = { accountId: string; accountCode: string; accountName: string; amount: number; comparisonAmount?: number | null };
export type FinancialStatementGroup = { key: string; name: string; amount: number; comparisonAmount?: number | null; accounts: FinancialStatementAccount[] };
export type ProfitAndLossReport = { companyId: string; companyName: string; currency: string; fromDateUtc: string; toDateUtc: string; hasComparison: boolean; groups: FinancialStatementGroup[]; revenue: number; costOfSales: number; grossProfit: number; operatingExpenses: number; otherIncome: number; otherExpenses: number; netProfit: number; comparisonNetProfit?: number | null };
export type BalanceSheetReport = { companyId: string; companyName: string; currency: string; asOfDateUtc: string; assetGroups: FinancialStatementGroup[]; liabilityGroups: FinancialStatementGroup[]; equityGroup: FinancialStatementGroup; totalAssets: number; totalLiabilities: number; totalEquity: number; retainedEarnings: number; isBalanced: boolean };
export type CashFlowReport = { companyId: string; companyName: string; currency: string; fromDateUtc: string; toDateUtc: string; operatingActivities: FinancialStatementGroup[]; investingActivities: FinancialStatementGroup[]; financingActivities: FinancialStatementGroup[]; openingCash: number; netCashMovement: number; closingCash: number; isBalanced: boolean };

export type TaxCode = {
  id: string;
  code: string;
  name: string;
  rate: number;
  scope: "Sales" | "Purchase" | "Both";
  isSst: boolean;
  myInvoisTaxTypeCode?: string | null;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type PaymentTerm = {
  id: string;
  code: string;
  name: string;
  days: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type CurrencyDefinition = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type ProductCategory = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type PriceLevel = {
  id: string;
  code: string;
  name: string;
  adjustmentPercent: number;
  description?: string | null;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type MasterDataSnapshot = {
  warehouses: Warehouse[];
  accounts: Account[];
  taxCodes: TaxCode[];
  paymentTerms: PaymentTerm[];
  currencies: CurrencyDefinition[];
  productCategories: ProductCategory[];
  priceLevels: PriceLevel[];
};

export type SalesDocumentLine = {
  id: string;
  productId?: string | null;
  taxCodeId?: string | null;
  productNameSnapshot: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  sourceQuotationLineId?: string | null;
  salesOrderLineId?: string | null;
  deliveredQuantity: number;
  invoicedQuantity: number;
};

export type SalesQuotation = {
  id: string;
  companyId: string;
  companyName: string;
  quotationNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  documentDateUtc: string;
  expiryDateUtc?: string | null;
  currency: string;
  referenceNo: string;
  notes: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired" | "Converted";
  convertedSalesOrderId?: string | null;
  lines: SalesDocumentLine[];
};

export type SalesQuotationListItem = {
  id: string;
  companyId: string;
  companyName: string;
  quotationNumber: string;
  contactId: string;
  contactName: string;
  documentDateUtc: string;
  expiryDateUtc?: string | null;
  currency: string;
  totalAmount: number;
  status: "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired" | "Converted";
  convertedSalesOrderId?: string | null;
};

export type SalesOrder = {
  id: string;
  companyId: string;
  companyName: string;
  salesOrderNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  documentDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "Draft" | "Confirmed" | "PartiallyDelivered" | "FullyDelivered" | "Closed" | "Cancelled";
  salesQuotationId?: string | null;
  lines: SalesDocumentLine[];
};

export type SalesOrderListItem = {
  id: string;
  companyId: string;
  companyName: string;
  salesOrderNumber: string;
  contactId: string;
  contactName: string;
  documentDateUtc: string;
  currency: string;
  totalAmount: number;
  status: "Draft" | "Confirmed" | "PartiallyDelivered" | "FullyDelivered" | "Closed" | "Cancelled";
  salesQuotationId?: string | null;
};

export type DeliveryOrder = {
  id: string;
  companyId: string;
  companyName: string;
  deliveryOrderNumber: string;
  salesOrderId: string;
  salesOrderNumber: string;
  warehouseId?: string | null;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  documentDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "Draft" | "Delivered" | "PartiallyInvoiced" | "FullyInvoiced" | "Cancelled";
  lines: SalesDocumentLine[];
};

export type DeliveryOrderListItem = {
  id: string;
  companyId: string;
  companyName: string;
  deliveryOrderNumber: string;
  salesOrderId: string;
  salesOrderNumber: string;
  contactId: string;
  contactName: string;
  documentDateUtc: string;
  currency: string;
  totalAmount: number;
  status: "Draft" | "Delivered" | "PartiallyInvoiced" | "FullyInvoiced" | "Cancelled";
};

export type PurchaseDocumentLine = {
  id: string;
  productId?: string | null;
  taxCodeId?: string | null;
  productNameSnapshot: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  purchaseOrderLineId?: string | null;
  receivedQuantity: number;
  billedQuantity: number;
};

export type PurchaseRelatedDocument = {
  id: string;
  documentNumber: string;
  documentType: string;
  status: string;
  documentDateUtc: string;
  amount: number;
};

export type PurchaseOrderRelatedDocuments = {
  goodsReceivedNotes: PurchaseRelatedDocument[];
  bills: PurchaseRelatedDocument[];
};

export type GoodsReceivedNoteRelatedDocuments = {
  bills: PurchaseRelatedDocument[];
};

export type PurchaseBillRelatedDocuments = {
  payments: PurchaseRelatedDocument[];
};

export type PurchaseOrder = {
  id: string;
  companyId: string;
  companyName: string;
  purchaseOrderNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  documentDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "Draft" | "Sent" | "Approved" | "PartiallyReceived" | "FullyReceived" | "Closed" | "Cancelled";
  lines: PurchaseDocumentLine[];
  relatedDocuments: PurchaseOrderRelatedDocuments;
};

export type PurchaseOrderListItem = {
  id: string;
  companyId: string;
  companyName: string;
  purchaseOrderNumber: string;
  contactId: string;
  contactName: string;
  documentDateUtc: string;
  currency: string;
  totalAmount: number;
  status: "Draft" | "Sent" | "Approved" | "PartiallyReceived" | "FullyReceived" | "Closed" | "Cancelled";
};

export type GoodsReceivedNote = {
  id: string;
  companyId: string;
  companyName: string;
  goodsReceivedNoteNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  warehouseId?: string | null;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  createdFromDocumentId: string;
  createdFromDocumentNumber: string;
  createdFromDocumentType: string;
  documentDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "Draft" | "Received" | "PartiallyBilled" | "FullyBilled" | "Cancelled";
  lines: PurchaseDocumentLine[];
  relatedDocuments: GoodsReceivedNoteRelatedDocuments;
};

export type GoodsReceivedNoteListItem = {
  id: string;
  companyId: string;
  companyName: string;
  goodsReceivedNoteNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  contactId: string;
  contactName: string;
  documentDateUtc: string;
  currency: string;
  totalAmount: number;
  status: "Draft" | "Received" | "PartiallyBilled" | "FullyBilled" | "Cancelled";
};

export type PurchaseBillLine = {
  id: string;
  purchaseOrderLineId?: string | null;
  goodsReceivedNoteLineId?: string | null;
  productId?: string | null;
  taxCodeId?: string | null;
  productNameSnapshot: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
};

export type PurchaseBill = {
  id: string;
  companyId: string;
  companyName: string;
  purchaseBillNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  purchaseOrderId?: string | null;
  goodsReceivedNoteId?: string | null;
  createdFromDocumentId: string;
  createdFromDocumentNumber: string;
  createdFromDocumentType: string;
  issueDateUtc: string;
  dueDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountDue: number;
  amountPaid: number;
  status: "Draft" | "Issued" | "PartiallyPaid" | "Paid" | "Overdue" | "Cancelled";
  lines: PurchaseBillLine[];
  relatedDocuments: PurchaseBillRelatedDocuments;
};

export type PurchaseBillListItem = {
  id: string;
  companyId: string;
  companyName: string;
  purchaseBillNumber: string;
  contactId: string;
  contactName: string;
  issueDateUtc: string;
  dueDateUtc: string;
  currency: string;
  totalAmount: number;
  amountDue: number;
  status: "Draft" | "Issued" | "PartiallyPaid" | "Paid" | "Overdue" | "Cancelled";
};

export type PurchasePaymentAllocation = {
  id: string;
  purchaseBillId: string;
  purchaseBillNumber: string;
  amount: number;
  refundedAmount: number;
};

export type PurchasePaymentRefundSummary = {
  id: string;
  purchaseRefundNumber: string;
  refundDateUtc: string;
  totalAmount: number;
  status: "Draft" | "Approved" | "Refunded" | "Cancelled";
};

export type PurchasePayment = {
  id: string;
  companyId: string;
  companyName: string;
  purchasePaymentNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  paymentDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  totalAmount: number;
  refundedAmount: number;
  status: "Draft" | "Posted" | "Reversed";
  allocations: PurchasePaymentAllocation[];
  refunds: PurchasePaymentRefundSummary[];
};

export type PurchasePaymentListItem = {
  id: string;
  companyId: string;
  companyName: string;
  purchasePaymentNumber: string;
  contactId: string;
  contactName: string;
  paymentDateUtc: string;
  currency: string;
  totalAmount: number;
  refundedAmount: number;
  status: "Draft" | "Posted" | "Reversed";
};

export type PurchaseCreditNoteLine = {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type PurchaseCreditNote = {
  id: string;
  companyId: string;
  companyName: string;
  purchaseBillId: string;
  purchaseBillNumber: string;
  purchaseCreditNoteNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  issuedAtUtc: string;
  currency: string;
  subtotalReduction: number;
  taxReduction: number;
  totalReduction: number;
  reason: string;
  status: "Draft" | "Approved" | "Applied" | "Cancelled";
  lines: PurchaseCreditNoteLine[];
};

export type PurchaseCreditNoteListItem = {
  id: string;
  companyId: string;
  companyName: string;
  purchaseBillId: string;
  purchaseBillNumber: string;
  purchaseCreditNoteNumber: string;
  contactId: string;
  contactName: string;
  issuedAtUtc: string;
  currency: string;
  totalReduction: number;
  status: "Draft" | "Approved" | "Applied" | "Cancelled";
};

export type PurchaseRefundAllocation = {
  id: string;
  purchasePaymentAllocationId: string;
  purchaseBillId: string;
  purchaseBillNumber: string;
  amount: number;
};

export type PurchaseRefund = {
  id: string;
  companyId: string;
  companyName: string;
  purchasePaymentId: string;
  purchasePaymentNumber: string;
  purchaseRefundNumber: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhoneNumber: string;
  refundDateUtc: string;
  currency: string;
  referenceNo: string;
  notes: string;
  totalAmount: number;
  status: "Draft" | "Approved" | "Refunded" | "Cancelled";
  allocations: PurchaseRefundAllocation[];
};

export type PurchaseRefundListItem = {
  id: string;
  companyId: string;
  companyName: string;
  purchasePaymentId: string;
  purchasePaymentNumber: string;
  purchaseRefundNumber: string;
  contactId: string;
  contactName: string;
  refundDateUtc: string;
  currency: string;
  totalAmount: number;
  status: "Draft" | "Approved" | "Refunded" | "Cancelled";
};

export type PagedResult<T> = {
  items: T[];
  totalCount: number;
};

export type Product = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  code: string;
  barcode?: string | null;
  category?: string | null;
  productGroups: string[];
  salesPrice?: number | null;
  purchasePrice?: number | null;
  isSelling: boolean;
  isBuying: boolean;
  baseUnitLabel: string;
  hasMultipleUoms: boolean;
  uomConversions: ProductUomConversion[];
  hasCustomSalesPrices: boolean;
  customSalesPrices: ProductCustomPrice[];
  hasCustomPurchasePrices: boolean;
  customPurchasePrices: ProductCustomPrice[];
  productType: string;
  plansCount: number;
  isActive: boolean;
  isSubscriptionProduct: boolean;
  defaultPlan?: ProductDefaultPlanSummary | null;
};

export type ProductDefaultPlanSummary = {
  id: string;
  planName: string;
  billingLabel: string;
  unitAmount: number;
  currency: string;
};

export type ProductUomConversion = {
  label: string;
  factor: number;
  salePrice?: number | null;
  purchasePrice?: number | null;
  isDefaultSalesUom: boolean;
  isDefaultPurchaseUom: boolean;
};

export type ProductCustomPriceTargetType = "Contact" | "ContactGroup" | "PriceLevel";

export type ProductCustomPrice = {
  targetType: ProductCustomPriceTargetType;
  contactId?: string | null;
  contactCode: string;
  contactName: string;
  contactGroup: string;
  priceLevel: string;
  dateFromUtc?: string | null;
  dateToUtc?: string | null;
  minQuantity?: number | null;
  uom: string;
  unitPrice: number;
};

export type ProductDetails = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  code: string;
  description?: string | null;
  barcode?: string | null;
  category?: string | null;
  productGroups: string[];
  binLocation?: string | null;
  hasImage: boolean;
  trackInventory: boolean;
  inventoryAccountId?: string | null;
  inventoryAccount: string;
  reorderLevel?: number | null;
  openingQuantity?: number | null;
  openingCost?: number | null;
  isSelling: boolean;
  salesPrice?: number | null;
  salesTaxCodeId?: string | null;
  salesTaxCode: string;
  incomeAccountId?: string | null;
  incomeAccount: string;
  salesDescription?: string | null;
  isBuying: boolean;
  purchasePrice?: number | null;
  purchaseTaxCodeId?: string | null;
  purchaseTaxCode: string;
  expenseAccountId?: string | null;
  expenseAccount: string;
  preferredSupplierId?: string | null;
  preferredSupplierName: string;
  purchaseDescription?: string | null;
  baseUnitLabel: string;
  hasMultipleUoms: boolean;
  uomConversions: ProductUomConversion[];
  hasCustomSalesPrices: boolean;
  customSalesPrices: ProductCustomPrice[];
  hasCustomPurchasePrices: boolean;
  customPurchasePrices: ProductCustomPrice[];
  isSubscriptionProduct: boolean;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  plansCount: number;
  activePlansCount: number;
  defaultPlan?: ProductDefaultPlanSummary | null;
  startingPrice?: number | null;
};

export type ProductPlan = {
  id: string;
  productId: string;
  productName: string;
  planName: string;
  planCode: string;
  billingType: "OneTime" | "Recurring";
  intervalUnit: "None" | "Month" | "Quarter" | "Year";
  intervalCount: number;
  billingLabel: string;
  currency: string;
  unitAmount: number;
  taxBehavior: "Exclusive" | "Inclusive" | "Unspecified";
  isDefault: boolean;
  isActive: boolean;
  isInUse: boolean;
  sortOrder: number;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
};

export type Subscription = {
  id: string;
  companyId: string;
  companyName: string;
  customerId: string;
  customerName: string;
  status: string;
  startDateUtc: string;
  trialStartUtc?: string | null;
  trialEndUtc?: string | null;
  isTrialing: boolean;
  currentPeriodStartUtc?: string | null;
  currentPeriodEndUtc?: string | null;
  nextBillingUtc?: string | null;
  isDue: boolean;
  isActiveInPeriod: boolean;
  cancelAtPeriodEnd: boolean;
  canceledAtUtc?: string | null;
  cancellationReason?: string | null;
  endedAtUtc?: string | null;
  autoRenew: boolean;
  unitPrice: number;
  currency: string;
  intervalUnit: "None" | "Month" | "Quarter" | "Year";
  intervalCount: number;
  quantity: number;
  effectiveBillingAmount: number;
  hasMixedBillingIntervals: boolean;
  notes?: string | null;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  items: {
    id: string;
    productPlanId: string;
    productPlanName: string;
    quantity: number;
    unitAmount: number;
    currency: string;
    intervalUnit: "None" | "Month" | "Quarter" | "Year";
    intervalCount: number;
    trialStartUtc?: string | null;
    trialEndUtc?: string | null;
    currentPeriodStartUtc?: string | null;
    currentPeriodEndUtc?: string | null;
    nextBillingUtc?: string | null;
    autoRenew: boolean;
    isDue: boolean;
    effectiveBillingAmount: number;
  }[];
};
export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhoneNumber?: string | null;
  subscriptionId?: string | null;
  status: string;
  statusLabel: string;
  issueDateUtc: string;
  dueDateUtc: string;
  periodStartUtc?: string | null;
  periodEndUtc?: string | null;
  sourceType: "Manual" | "Subscription" | "PlatformSubscription";
  subtotal: number;
  taxAmount: number;
  isTaxEnabled: boolean;
  taxName?: string | null;
  taxRate?: number | null;
  taxRegistrationNo?: string | null;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  currency: string;
  companyAddressSnapshot?: string | null;
  pdfPath?: string | null;
  lineItems: { taxCodeId?: string | null; description: string; quantity: number; unitAmount: number; taxRate: number; taxAmount: number; totalAmount: number; lineTotal: number }[];
  history: { createdAtUtc: string; action: string; description: string }[];
  creditNotes: CreditNote[];
  refunds: Refund[];
  creditedAmount: number;
  eligibleCreditAmount: number;
};
export type Payment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  refundedAmount: number;
  netCollectedAmount: number;
  status: string;
  gatewayName: string;
  externalPaymentId?: string | null;
  paymentLinkUrl?: string | null;
  hasProof: boolean;
  hasReceipt: boolean;
  proofFileName?: string | null;
  paidAtUtc?: string | null;
  history: { createdAtUtc: string; action: string; description: string }[];
  attempts: { attemptNumber: number; status: string; failureCode?: string | null; failureMessage?: string | null }[];
  refunds: Refund[];
  disputes: PaymentDispute[];
};

export type PaymentConfirmation = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  currency: string;
  paidAtUtc: string;
  payerName: string;
  transactionReference?: string | null;
  notes?: string | null;
  hasProof: boolean;
  proofFileName?: string | null;
  createdAtUtc: string;
  status: string;
  reviewNote?: string | null;
};

export type PaymentConfirmationLink = {
  invoiceId: string;
  invoiceNumber: string;
  url: string;
};

export type InvoiceWhatsAppLinkOptions = {
  invoiceId: string;
  invoiceNumber: string;
  actionLink?: string | null;
  paymentGatewayLink?: string | null;
  paymentConfirmationLink?: string | null;
};

export type PublicPaymentConfirmationInvoice = {
  invoiceNumber: string;
  customerName: string;
  balanceAmount: number;
  currency: string;
  dueDateUtc: string;
  paymentLinkUrl?: string | null;
  proofUploadMaxBytes: number;
  autoCompressUploads: boolean;
  uploadImageMaxDimension: number;
  uploadImageQuality: number;
};

export type Refund = {
  id: string;
  paymentId: string;
  invoiceId?: string | null;
  amount: number;
  currency: string;
  reason: string;
  externalRefundId?: string | null;
  status: string;
  createdAtUtc: string;
  createdByUserId?: string | null;
};

export type CreditNoteLine = {
  id: string;
  invoiceLineId?: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type CreditNote = {
  id: string;
  invoiceId: string;
  customerId: string;
  creditNoteNumber: string;
  currency: string;
  subtotalReduction: number;
  taxReduction: number;
  totalReduction: number;
  reason: string;
  status: string;
  issuedAtUtc: string;
  createdAtUtc: string;
  createdByUserId?: string | null;
  lines: CreditNoteLine[];
};

export type PaymentDispute = {
  id: string;
  externalDisputeId: string;
  amount: number;
  reason: string;
  status: string;
  openedAtUtc: string;
  resolvedAtUtc?: string | null;
};

export type ReconciliationStatus = {
  phase: string;
  status: string;
  message: string;
};

export type DunningRule = {
  id: string;
  name: string;
  offsetDays: number;
  isActive: boolean;
};

export type ReminderHistoryItem = {
  id: string;
  reminderName: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  scheduledAtUtc: string;
  sentAtUtc?: string | null;
  cancelled: boolean;
  status: "sent" | "pending" | "cancelled";
};

export type ReminderHistoryPage = {
  items: ReminderHistoryItem[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export type SubscriberWhatsAppQueueItem = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  recipientPhoneNumber: string;
  status: string;
  attemptCount: number;
  createdAtUtc: string;
  lastAttemptAtUtc?: string | null;
  nextAttemptAtUtc?: string | null;
  errorMessage?: string | null;
};

export type SubscriberWhatsAppMessageItem = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  recipientPhoneNumber: string;
  source: "invoice" | "reminder";
  reminderName?: string | null;
  reminderOffsetDays?: number | null;
  status: string;
  message: string;
  attemptCount: number;
  createdAtUtc: string;
  lastAttemptAtUtc?: string | null;
  nextAttemptAtUtc?: string | null;
  externalMessageId?: string | null;
  errorMessage?: string | null;
};

export type SubscriberWhatsAppMessagePage = {
  items: SubscriberWhatsAppMessageItem[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export type CompanyInvoiceSettings = {
  companyId: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  resetYearly: boolean;
  lastResetYear?: number | null;
  receiptPrefix: string;
  receiptNextNumber: number;
  receiptPadding: number;
  receiptResetYearly: boolean;
  receiptLastResetYear?: number | null;
  creditNotePrefix: string;
  creditNoteNextNumber: number;
  creditNotePadding: number;
  creditNoteResetYearly: boolean;
  creditNoteLastResetYear?: number | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccount?: string | null;
  paymentDueDays: number;
  paymentLink?: string | null;
  paymentGatewayProvider: "none" | "billplz";
  paymentGatewayTermsAccepted: boolean;
  paymentGatewayTermsAcceptedAtUtc?: string | null;
  subscriberBillplzApiKey?: string | null;
  subscriberBillplzCollectionId?: string | null;
  subscriberBillplzXSignatureKey?: string | null;
  subscriberBillplzBaseUrl?: string | null;
  subscriberBillplzRequireSignatureVerification: boolean;
  paymentGatewayReady: boolean;
  isTaxEnabled: boolean;
  taxName: string;
  taxRate?: number | null;
  taxRegistrationNo?: string | null;
  showCompanyAddressOnInvoice: boolean;
  showCompanyAddressOnReceipt: boolean;
  autoSendInvoices: boolean;
  ccSubscriberOnCustomerEmails: boolean;
  hasPaymentQr: boolean;
  whatsAppEnabled: boolean;
  whatsAppTemplate?: string | null;
  whatsAppReady: boolean;
  whatsAppMonthlyLimit: number;
  whatsAppMonthlySent: number;
};

export type CompanyPaymentGatewayTestResult = {
  success: boolean;
  message: string;
};

export type PlatformWhatsAppSettings = {
  isEnabled: boolean;
  provider: "generic_api" | "whatsapp_web_js";
  apiUrl?: string | null;
  accessToken?: string | null;
  senderId?: string | null;
  template?: string | null;
  sendWindowStartHourUtc: number;
  sendWindowEndHourUtc: number;
  isReady: boolean;
  sessionStatus: string;
  sessionPhone?: string | null;
  sessionLastSyncedAtUtc?: string | null;
  sessionQrCodeDataUrl?: string | null;
  sessionLastError?: string | null;
  pendingQueueCount: number;
  deferredQueueCount: number;
  failedQueueCount: number;
  nextQueueAttemptAtUtc?: string | null;
};

export type PlatformWhatsAppTestMessageResult = {
  success: boolean;
  message: string;
  externalMessageId?: string | null;
};

export type FailedWhatsAppNotification = {
  id: string;
  companyId: string;
  companyName: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  recipientPhoneNumber: string;
  isReminder: boolean;
  errorMessage?: string | null;
  createdAtUtc: string;
};

export type PlatformWhatsAppQueueItem = {
  id: string;
  companyId: string;
  companyName: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  recipientPhoneNumber: string;
  isReminder: boolean;
  status: string;
  attemptCount: number;
  createdAtUtc: string;
  lastAttemptAtUtc?: string | null;
  nextAttemptAtUtc?: string | null;
  errorMessage?: string | null;
};

export type WhatsAppRetryResult = {
  success: boolean;
  message: string;
  externalMessageId?: string | null;
};

export type PlatformFeedbackSettings = {
  ownerNotificationEmail?: string | null;
  isReady: boolean;
};

export type PlatformIssuerSettings = {
  environment: "staging" | "production";
  companyName: string;
  registrationNumber: string;
  billingEmail: string;
  phone?: string | null;
  address?: string | null;
  isActiveProfile: boolean;
  isReady: boolean;
};

export type PlatformDocumentNumberingSettings = {
  invoicePrefix: string;
  invoiceNextNumber: number;
  invoiceMinimumDigits: number;
  invoiceResetYearly: boolean;
  invoiceLastResetYear?: number | null;
  receiptPrefix: string;
  receiptNextNumber: number;
  receiptMinimumDigits: number;
  receiptResetYearly: boolean;
  receiptLastResetYear?: number | null;
};

export type PlatformSmtpSettings = {
  environment: "staging" | "production";
  host?: string | null;
  port: number;
  username?: string | null;
  password?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  useSsl: boolean;
  localEmailCaptureEnabled: boolean;
  emailShieldEnabled: boolean;
  emailShieldAddress?: string | null;
  isActiveProfile: boolean;
  isReady: boolean;
};

export type PlatformSmtpTestResult = {
  success: boolean;
  message: string;
};

export type PlatformBillplzSettings = {
  environment: "staging" | "production";
  apiKey?: string | null;
  collectionId?: string | null;
  xSignatureKey?: string | null;
  baseUrl?: string | null;
  requireSignatureVerification: boolean;
  isActiveProvider: boolean;
  isActiveProfile: boolean;
  isReady: boolean;
};

export type PlatformRuntimeProfile = {
  activeEnvironment: "staging" | "production";
};

export type PlatformBillplzTestResult = {
  success: boolean;
  message: string;
};

export type PlatformStripeSettings = {
  environment: "staging" | "production";
  publishableKey?: string | null;
  secretKey?: string | null;
  webhookSecret?: string | null;
  useAsActiveProvider: boolean;
  isActiveProfile: boolean;
  isReady: boolean;
};

export type PlatformStripeTestResult = {
  success: boolean;
  message: string;
};

export type PlatformUploadPolicy = {
  autoCompressUploads: boolean;
  uploadMaxBytes: number;
  uploadImageMaxDimension: number;
  uploadImageQuality: number;
};

export type BillingReadinessItem = {
  key: string;
  title: string;
  description: string;
  required: boolean;
  done: boolean;
  actionPath: string;
};

export type BillingReadiness = {
  companyId?: string | null;
  isReady: boolean;
  items: BillingReadinessItem[];
};

export type SubscriberCompany = {
  companyId: string;
  companyName: string;
  registrationNumber: string;
  email: string;
  customerCount: number;
  subscriptionCount: number;
  openInvoiceCount: number;
  packageCode?: string | null;
  packageName?: string | null;
  packageStatus?: string | null;
  packageGracePeriodEndsAtUtc?: string | null;
  trialEndsAtUtc?: string | null;
};

export type PlatformDashboardSummary = {
  totalSubscribers: number;
  subscribersPaid: number;
  subscribersPendingPayment: number;
  subscribersInGracePeriod: number;
  subscribersOnTrial: number;
  billingProfiles: number;
  products: number;
  customers: number;
  subscriptions: number;
  openInvoices: number;
  outstandingAmount: number;
  whatsAppSentThisMonth: number;
  companiesUsingWhatsAppThisMonth: number;
};

export type SubscriberAccountBillingRolloutAccount = {
  accountId: string;
  accountBillingEnabled: boolean;
  health: string;
  warning?: string | null;
  lastValidatedAtUtc?: string | null;
  companies: Array<{ companyId: string; companyName: string }>;
};

export type PlatformJobTriggerResult = {
  jobKey: string;
  jobName: string;
  hangfireJobId: string;
  message: string;
  triggeredAtUtc: string;
};

export type PlatformJobHistoryEntry = {
  stateName: string;
  reason?: string | null;
  createdAtUtc: string;
};

export type PlatformJobStatus = {
  jobKey: string;
  jobName: string;
  cron: string;
  queue: string;
  timeZoneId: string;
  nextExecutionAtUtc?: string | null;
  lastExecutionAtUtc?: string | null;
  lastManualTriggerAtUtc?: string | null;
  lastManualTriggerJobId?: string | null;
  lastJobId?: string | null;
  lastJobState?: string | null;
  error?: string | null;
  retryAttempt: number;
  lastJobCreatedAtUtc?: string | null;
  recentHistory: PlatformJobHistoryEntry[];
};

export type PlatformUser = {
  id: string;
  companyId: string;
  companyName: string;
  fullName: string;
  email: string;
  role: string;
  isPlatformAccess: boolean;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAtUtc: string;
};

export type EmailDispatchLog = {
  id: string;
  notificationType?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  messageBody?: string | null;
  status: string;
  originalRecipient: string;
  effectiveRecipient: string;
  subject: string;
  deliveryMode: string;
  wasRedirected: boolean;
  redirectReason?: string | null;
  succeeded: boolean;
  errorMessage?: string | null;
  createdAtUtc: string;
};

export type AuditLogEntry = {
  id: string;
  companyId: string;
  companyName: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityName: string;
  entityId: string;
  metadata?: string | null;
  createdAtUtc: string;
};

export type PlatformPackageItem = {
  id: string;
  text: string;
  sortOrder: number;
};

export type PlatformPackage = {
  id: string;
  code: string;
  name: string;
  priceLabel: string;
  description: string;
  amount: number;
  currency: string;
  intervalUnit: string;
  intervalCount: number;
  gracePeriodDays: number;
  maxCompanies: number;
  maxProducts: number;
  maxPlans: number;
  maxCustomers: number;
  maxWhatsAppRemindersPerMonth: number;
  isActive: boolean;
  displayOrder: number;
  features: PlatformPackageItem[];
  trustPoints: PlatformPackageItem[];
};

export type SubscriberPackageBillingInvoice = {
  id: string;
  invoiceNumber: string;
  packageName: string;
  status: string;
  issueDateUtc: string;
  dueDateUtc: string;
  total: number;
  amountDue: number;
  currency: string;
  hasReceipt: boolean;
  paymentLinkUrl?: string | null;
  hasPendingPaymentConfirmation: boolean;
};

export type SubscriberPackageUpgradeOption = {
  code: string;
  name: string;
  description: string;
  priceLabel: string;
  amount: number;
  currency: string;
  billingIntervalLabel: string;
};

export type SubscriberPackageUpgradePreview = {
  currentPackageCode: string;
  currentPackageName: string;
  targetPackageCode: string;
  targetPackageName: string;
  currentPackageAmount: number;
  targetPackageAmount: number;
  upgradeSubtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  remainingDays: number;
  totalDays: number;
  currentCycleEndUtc: string;
};

export type SubscriberPackageReactivationPreview = {
  packageCode: string;
  packageName: string;
  packageAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  billingIntervalLabel: string;
};

export type SubscriberPackageBillingSummary = {
  packageCode?: string | null;
  packageName?: string | null;
  packageStatus?: string | null;
  gracePeriodEndsAtUtc?: string | null;
  packageAmount?: number | null;
  currency?: string | null;
  billingIntervalLabel?: string | null;
  pendingUpgradePackageCode?: string | null;
  pendingUpgradePackageName?: string | null;
  currentCycleEndUtc?: string | null;
  isAccountBillingProfileConfigured: boolean;
  canCancelPendingUpgrade: boolean;
  availableUpgrades: SubscriberPackageUpgradeOption[];
  invoices: SubscriberPackageBillingInvoice[];
};

export type AccountBillingProfile = {
  billingContactName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  billingAddress?: string | null;
  billingTaxIdType?: string | null;
  billingTaxIdNumber?: string | null;
  isComplete: boolean;
};

export type FeatureAccess = {
  packageCode: string;
  packageStatus: string;
  featureKeys: string[];
  featureRequirements: { featureKey: string; packageCode: string; packageName: string }[];
};

export type FeedbackItem = {
  id: string;
  companyId: string;
  companyName: string;
  subject: string;
  category: "Bug" | "FeatureRequest" | "BillingIssue" | "GeneralFeedback";
  priority: "Low" | "Normal" | "Urgent";
  message: string;
  status: "New" | "InReview" | "Planned" | "Resolved" | "Closed";
  adminNote?: string | null;
  submittedByName: string;
  submittedByEmail: string;
  createdAtUtc: string;
  reviewedAtUtc?: string | null;
  hasUnreadPlatformUpdate: boolean;
};

export type FeedbackNotificationSummary = {
  unreadReplies: number;
};

export type CompanyLookup = {
  id: string;
  name: string;
  legalName?: string | null;
  registrationNumberType?: string | null;
  registrationNumber: string;
  oldRegistrationNumber?: string | null;
  tin?: string | null;
  msicCode?: string | null;
  tourismTaxRegistrationNumber?: string | null;
  homeCountry?: string | null;
  homeCurrency: string;
  email: string;
  phone: string;
  address: string;
  addresses: {
    id: string;
    addressName: string;
    addressLine1: string;
    addressLine2?: string | null;
    addressLine3?: string | null;
    postcode?: string | null;
    city?: string | null;
    state?: string | null;
    country: string;
    isDefault: boolean;
    isDefaultBilling: boolean;
    isDefaultShipping: boolean;
  }[];
  industry?: string | null;
  natureOfBusiness?: string | null;
  isActive: boolean;
  hasLogo: boolean;
};
