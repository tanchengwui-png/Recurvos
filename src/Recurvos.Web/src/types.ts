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

export type Customer = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  externalReference: string;
  billingAddress: string;
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
  category?: string | null;
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

export type ProductDetails = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  code: string;
  description?: string | null;
  category?: string | null;
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
  pdfPath?: string | null;
  lineItems: { description: string; quantity: number; unitAmount: number; totalAmount: number }[];
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
  isReady: boolean;
  sessionStatus: string;
  sessionPhone?: string | null;
  sessionLastSyncedAtUtc?: string | null;
  sessionQrCodeDataUrl?: string | null;
  sessionLastError?: string | null;
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
  isCompanyBillingAddressConfigured: boolean;
  canCancelPendingUpgrade: boolean;
  availableUpgrades: SubscriberPackageUpgradeOption[];
  invoices: SubscriberPackageBillingInvoice[];
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
  registrationNumber: string;
  email: string;
  phone: string;
  address: string;
  industry?: string | null;
  natureOfBusiness?: string | null;
  isActive: boolean;
  hasLogo: boolean;
};
