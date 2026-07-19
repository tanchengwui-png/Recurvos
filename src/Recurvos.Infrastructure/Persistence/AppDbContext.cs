using Microsoft.EntityFrameworkCore;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Common;

namespace Recurvos.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<CompanyAddress> CompanyAddresses => Set<CompanyAddress>();
    public DbSet<CompanyInvoiceSettings> CompanyInvoiceSettings => Set<CompanyInvoiceSettings>();
    public DbSet<User> Users => Set<User>();
    public DbSet<EmailVerificationToken> EmailVerificationTokens => Set<EmailVerificationToken>();
    public DbSet<EmailDispatchLog> EmailDispatchLogs => Set<EmailDispatchLog>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<SalesQuotation> SalesQuotations => Set<SalesQuotation>();
    public DbSet<SalesQuotationLine> SalesQuotationLines => Set<SalesQuotationLine>();
    public DbSet<SalesOrder> SalesOrders => Set<SalesOrder>();
    public DbSet<SalesOrderLine> SalesOrderLines => Set<SalesOrderLine>();
    public DbSet<DeliveryOrder> DeliveryOrders => Set<DeliveryOrder>();
    public DbSet<DeliveryOrderLine> DeliveryOrderLines => Set<DeliveryOrderLine>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<GoodsReceivedNote> GoodsReceivedNotes => Set<GoodsReceivedNote>();
    public DbSet<GoodsReceivedNoteLine> GoodsReceivedNoteLines => Set<GoodsReceivedNoteLine>();
    public DbSet<PurchaseBill> PurchaseBills => Set<PurchaseBill>();
    public DbSet<PurchaseBillLine> PurchaseBillLines => Set<PurchaseBillLine>();
    public DbSet<PurchasePayment> PurchasePayments => Set<PurchasePayment>();
    public DbSet<PurchasePaymentAllocation> PurchasePaymentAllocations => Set<PurchasePaymentAllocation>();
    public DbSet<PurchaseCreditNote> PurchaseCreditNotes => Set<PurchaseCreditNote>();
    public DbSet<PurchaseCreditNoteLine> PurchaseCreditNoteLines => Set<PurchaseCreditNoteLine>();
    public DbSet<PurchaseRefund> PurchaseRefunds => Set<PurchaseRefund>();
    public DbSet<PurchaseRefundAllocation> PurchaseRefundAllocations => Set<PurchaseRefundAllocation>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<InventoryBalance> InventoryBalances => Set<InventoryBalance>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<TaxCode> TaxCodes => Set<TaxCode>();
    public DbSet<PaymentTerm> PaymentTerms => Set<PaymentTerm>();
    public DbSet<CurrencyDefinition> CurrencyDefinitions => Set<CurrencyDefinition>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<PriceLevel> PriceLevels => Set<PriceLevel>();
    public DbSet<ContactGroup> ContactGroups => Set<ContactGroup>();
    public DbSet<ProductGroup> ProductGroups => Set<ProductGroup>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductPlan> ProductPlans => Set<ProductPlan>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<SubscriptionItem> SubscriptionItems => Set<SubscriptionItem>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLineItem> InvoiceLineItems => Set<InvoiceLineItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentConfirmationSubmission> PaymentConfirmationSubmissions => Set<PaymentConfirmationSubmission>();
    public DbSet<PaymentAttempt> PaymentAttempts => Set<PaymentAttempt>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<CreditNote> CreditNotes => Set<CreditNote>();
    public DbSet<CreditNoteLine> CreditNoteLines => Set<CreditNoteLine>();
    public DbSet<CustomerBalanceTransaction> CustomerBalanceTransactions => Set<CustomerBalanceTransaction>();
    public DbSet<Dispute> Disputes => Set<Dispute>();
    public DbSet<PayoutBatch> PayoutBatches => Set<PayoutBatch>();
    public DbSet<SettlementLine> SettlementLines => Set<SettlementLine>();
    public DbSet<ReconciliationResult> ReconciliationResults => Set<ReconciliationResult>();
    public DbSet<LedgerPosting> LedgerPostings => Set<LedgerPosting>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalEntryLine> JournalEntryLines => Set<JournalEntryLine>();
    public DbSet<PlatformPackage> PlatformPackages => Set<PlatformPackage>();
    public DbSet<PlatformPackageFeature> PlatformPackageFeatures => Set<PlatformPackageFeature>();
    public DbSet<PlatformPackageTrustPoint> PlatformPackageTrustPoints => Set<PlatformPackageTrustPoint>();
    public DbSet<WebhookEvent> WebhookEvents => Set<WebhookEvent>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<DunningRule> DunningRules => Set<DunningRule>();
    public DbSet<ReminderSchedule> ReminderSchedules => Set<ReminderSchedule>();
    public DbSet<WhatsAppNotification> WhatsAppNotifications => Set<WhatsAppNotification>();
    public DbSet<WhatsAppOutboundQueue> WhatsAppOutboundQueues => Set<WhatsAppOutboundQueue>();
    public DbSet<FeedbackItem> FeedbackItems => Set<FeedbackItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        modelBuilder.Entity<User>()
            .HasIndex(x => new { x.CompanyId, x.Email })
            .IsUnique();

        modelBuilder.Entity<User>()
            .Property(x => x.Email)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<User>()
            .Property(x => x.IsActive)
            .HasDefaultValue(true);

        modelBuilder.Entity<User>()
            .Property(x => x.TermsVersion)
            .HasMaxLength(40);

        modelBuilder.Entity<User>()
            .Property(x => x.PrivacyVersion)
            .HasMaxLength(40);

        modelBuilder.Entity<User>()
            .HasOne(x => x.Company)
            .WithMany(x => x.Users)
            .HasForeignKey(x => x.CompanyId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<EmailVerificationToken>()
            .HasIndex(x => x.TokenHash)
            .IsUnique();

        modelBuilder.Entity<EmailVerificationToken>()
            .Property(x => x.TokenHash)
            .HasMaxLength(128)
            .IsRequired();

        modelBuilder.Entity<EmailVerificationToken>()
            .HasOne(x => x.User)
            .WithMany(x => x.EmailVerificationTokens)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.NotificationType)
            .HasMaxLength(50);

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.InvoiceNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.CustomerName)
            .HasMaxLength(200);

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.Status)
            .HasMaxLength(30)
            .IsRequired();

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.OriginalRecipient)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.EffectiveRecipient)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.Subject)
            .HasMaxLength(300)
            .IsRequired();

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.DeliveryMode)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.RedirectReason)
            .HasMaxLength(100);

        modelBuilder.Entity<EmailDispatchLog>()
            .Property(x => x.ErrorMessage)
            .HasMaxLength(1000);

        modelBuilder.Entity<EmailDispatchLog>()
            .HasIndex(x => new { x.CompanyId, x.CreatedAtUtc });

        modelBuilder.Entity<PasswordResetToken>()
            .HasIndex(x => x.TokenHash)
            .IsUnique();

        modelBuilder.Entity<PasswordResetToken>()
            .Property(x => x.TokenHash)
            .HasMaxLength(128)
            .IsRequired();

        modelBuilder.Entity<PasswordResetToken>()
            .HasOne(x => x.User)
            .WithMany(x => x.PasswordResetTokens)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Customer>()
            .HasIndex(x => x.SubscriberId);

        modelBuilder.Entity<Customer>()
            .Property(x => x.ContactType)
            .HasMaxLength(30)
            .HasDefaultValue("Customer")
            .IsRequired();

        modelBuilder.Entity<Customer>()
            .Property(x => x.Status)
            .HasMaxLength(30)
            .HasDefaultValue("Active")
            .IsRequired();

        modelBuilder.Entity<Customer>()
            .Property(x => x.EntityType)
            .HasMaxLength(50)
            .HasDefaultValue("Company")
            .IsRequired();

        modelBuilder.Entity<Customer>()
            .Property(x => x.LegalName)
            .HasMaxLength(200);

        modelBuilder.Entity<Customer>()
            .Property(x => x.OtherName)
            .HasMaxLength(200);

        modelBuilder.Entity<Customer>()
            .Property(x => x.RegistrationNumberType)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.RegistrationNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.OldRegistrationNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.Tin)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.SstRegistrationNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.ReceivableAccount)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.CreditLimit)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Customer>()
            .Property(x => x.PayableAccount)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.PriceLevel)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.Currency)
            .HasMaxLength(20);

        modelBuilder.Entity<Customer>()
            .Property(x => x.PaymentTerm)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.IncomeAccount)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.ExpenseAccount)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.Location)
            .HasMaxLength(100);

        modelBuilder.Entity<Customer>()
            .Property(x => x.MyInvoisControl)
            .HasMaxLength(100);

        modelBuilder.Entity<ContactGroup>()
            .HasIndex(x => x.SubscriberId);

        modelBuilder.Entity<ContactGroup>()
            .HasIndex(x => new { x.SubscriberId, x.Name })
            .IsUnique();

        modelBuilder.Entity<ContactGroup>()
            .Property(x => x.Name)
            .HasMaxLength(150)
            .IsRequired();

        modelBuilder.Entity<ProductGroup>()
            .HasIndex(x => x.SubscriberId);

        modelBuilder.Entity<ProductGroup>()
            .HasIndex(x => new { x.SubscriberId, x.Name })
            .IsUnique();

        modelBuilder.Entity<ProductGroup>()
            .Property(x => x.Name)
            .HasMaxLength(150)
            .IsRequired();

        modelBuilder.Entity<ProductGroup>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<Warehouse>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<Warehouse>()
            .HasIndex(x => new { x.CompanyId, x.IsActive });

        modelBuilder.Entity<Warehouse>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<Warehouse>()
            .Property(x => x.Name)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<Warehouse>()
            .Property(x => x.AddressJson)
            .HasMaxLength(2000)
            .IsRequired();

        modelBuilder.Entity<InventoryBalance>()
            .HasIndex(x => new { x.CompanyId, x.ProductId, x.WarehouseId })
            .IsUnique();

        modelBuilder.Entity<InventoryBalance>()
            .Property(x => x.QuantityOnHand)
            .HasPrecision(18, 2);

        modelBuilder.Entity<InventoryBalance>()
            .ToTable(x => x.HasCheckConstraint("CK_InventoryBalance_QuantityOnHand", "\"QuantityOnHand\" >= 0"));

        modelBuilder.Entity<InventoryMovement>()
            .HasIndex(x => new { x.CompanyId, x.SourceDocumentType, x.SourceDocumentId, x.CreatedAtUtc });

        modelBuilder.Entity<InventoryMovement>()
            .HasIndex(x => new { x.CompanyId, x.ProductId, x.TransactionDateUtc });

        modelBuilder.Entity<InventoryMovement>()
            .Property(x => x.SourceDocumentType)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<InventoryMovement>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<InventoryMovement>()
            .Property(x => x.Notes)
            .HasMaxLength(500);

        modelBuilder.Entity<Account>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<Account>()
            .HasIndex(x => new { x.CompanyId, x.Type, x.IsActive });

        modelBuilder.Entity<Account>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<Account>()
            .Property(x => x.Name)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<Account>()
            .Property(x => x.CurrencyCode)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<Account>()
            .Property(x => x.Description)
            .HasMaxLength(500);

        modelBuilder.Entity<JournalEntry>()
            .HasIndex(x => new { x.CompanyId, x.JournalNumber })
            .IsUnique();
        modelBuilder.Entity<JournalEntry>()
            .HasIndex(x => new { x.CompanyId, x.JournalDateUtc, x.Status });
        modelBuilder.Entity<JournalEntry>().Property(x => x.JournalNumber).HasMaxLength(50).IsRequired();
        modelBuilder.Entity<JournalEntry>().Property(x => x.Currency).HasMaxLength(3).IsRequired();
        modelBuilder.Entity<JournalEntry>().Property(x => x.ReferenceNo).HasMaxLength(100);
        modelBuilder.Entity<JournalEntry>().Property(x => x.Description).HasMaxLength(1000);
        modelBuilder.Entity<JournalEntry>().Property(x => x.ExchangeRate).HasPrecision(18, 8);
        modelBuilder.Entity<JournalEntry>()
            .HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<JournalEntry>()
            .HasOne(x => x.ReversesJournalEntry).WithOne(x => x.ReversedByJournalEntry)
            .HasForeignKey<JournalEntry>(x => x.ReversesJournalEntryId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<JournalEntryLine>().HasIndex(x => new { x.JournalEntryId, x.SortOrder }).IsUnique();
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.AccountCodeSnapshot).HasMaxLength(50).IsRequired();
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.AccountNameSnapshot).HasMaxLength(200).IsRequired();
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.Description).HasMaxLength(1000);
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.DebitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.CreditAmount).HasPrecision(18, 2);
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.BaseDebitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<JournalEntryLine>().Property(x => x.BaseCreditAmount).HasPrecision(18, 2);
        modelBuilder.Entity<JournalEntryLine>()
            .HasOne(x => x.JournalEntry).WithMany(x => x.Lines).HasForeignKey(x => x.JournalEntryId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<JournalEntryLine>()
            .HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<TaxCode>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<TaxCode>()
            .HasIndex(x => new { x.CompanyId, x.Scope, x.IsActive });

        modelBuilder.Entity<TaxCode>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<TaxCode>()
            .Property(x => x.Name)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<TaxCode>()
            .Property(x => x.Rate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<TaxCode>()
            .Property(x => x.MyInvoisTaxTypeCode)
            .HasMaxLength(50);

        modelBuilder.Entity<PaymentTerm>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<PaymentTerm>()
            .HasIndex(x => new { x.CompanyId, x.IsActive });

        modelBuilder.Entity<PaymentTerm>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PaymentTerm>()
            .Property(x => x.Name)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<CurrencyDefinition>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<CurrencyDefinition>()
            .HasIndex(x => new { x.CompanyId, x.IsActive });

        modelBuilder.Entity<CurrencyDefinition>()
            .Property(x => x.Code)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<CurrencyDefinition>()
            .Property(x => x.Name)
            .HasMaxLength(100)
            .IsRequired();

        modelBuilder.Entity<CurrencyDefinition>()
            .Property(x => x.Symbol)
            .HasMaxLength(10)
            .IsRequired();

        modelBuilder.Entity<ProductCategory>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<ProductCategory>()
            .HasIndex(x => new { x.CompanyId, x.IsActive });

        modelBuilder.Entity<ProductCategory>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<ProductCategory>()
            .Property(x => x.Name)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<ProductCategory>()
            .Property(x => x.Description)
            .HasMaxLength(500);

        modelBuilder.Entity<PriceLevel>()
            .HasIndex(x => new { x.CompanyId, x.Code })
            .IsUnique();

        modelBuilder.Entity<PriceLevel>()
            .HasIndex(x => new { x.CompanyId, x.IsActive });

        modelBuilder.Entity<PriceLevel>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PriceLevel>()
            .Property(x => x.Name)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PriceLevel>()
            .Property(x => x.AdjustmentPercent)
            .HasPrecision(8, 2);

        modelBuilder.Entity<PriceLevel>()
            .Property(x => x.Description)
            .HasMaxLength(500);

        modelBuilder.Entity<PriceLevel>()
            .ToTable(x => x.HasCheckConstraint("CK_PriceLevel_AdjustmentPercent", "\"AdjustmentPercent\" >= -100 AND \"AdjustmentPercent\" <= 1000"));

        modelBuilder.Entity<SalesQuotation>()
            .HasIndex(x => new { x.CompanyId, x.QuotationNumber })
            .IsUnique();

        modelBuilder.Entity<SalesQuotation>()
            .HasIndex(x => new { x.CompanyId, x.ContactId, x.Status, x.DocumentDateUtc });

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.QuotationNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotation>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotationLine>()
            .HasIndex(x => new { x.SalesQuotationId, x.SortOrder });

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.ProductNameSnapshot)
            .HasMaxLength(200);

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotationLine>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.TaxRate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotationLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesQuotationLine>()
            .HasOne(x => x.SalesQuotation)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.SalesQuotationId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SalesOrder>()
            .HasIndex(x => new { x.CompanyId, x.SalesOrderNumber })
            .IsUnique();

        modelBuilder.Entity<SalesOrder>()
            .HasIndex(x => new { x.CompanyId, x.ContactId, x.Status, x.DocumentDateUtc });

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.SalesOrderNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrder>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .HasIndex(x => new { x.SalesOrderId, x.SortOrder });

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.ProductNameSnapshot)
            .HasMaxLength(200);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.TaxRate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.DeliveredQuantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .Property(x => x.InvoicedQuantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SalesOrderLine>()
            .HasOne(x => x.SalesOrder)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.SalesOrderId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<DeliveryOrder>()
            .HasIndex(x => new { x.CompanyId, x.DeliveryOrderNumber })
            .IsUnique();

        modelBuilder.Entity<DeliveryOrder>()
            .HasIndex(x => new { x.CompanyId, x.SalesOrderId, x.Status, x.DocumentDateUtc });

        modelBuilder.Entity<DeliveryOrder>()
            .HasIndex(x => x.WarehouseId);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.DeliveryOrderNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.SalesOrderNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrder>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .HasIndex(x => new { x.DeliveryOrderId, x.SortOrder });

        modelBuilder.Entity<DeliveryOrderLine>()
            .HasIndex(x => new { x.SalesOrderLineId, x.CreatedAtUtc });

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.ProductNameSnapshot)
            .HasMaxLength(200);

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.TaxRate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .Property(x => x.InvoicedQuantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<DeliveryOrderLine>()
            .HasOne(x => x.DeliveryOrder)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.DeliveryOrderId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PurchaseOrder>()
            .HasIndex(x => new { x.CompanyId, x.PurchaseOrderNumber })
            .IsUnique();

        modelBuilder.Entity<PurchaseOrder>()
            .HasIndex(x => new { x.CompanyId, x.ContactId, x.Status, x.DocumentDateUtc });

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.PurchaseOrderNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .HasIndex(x => new { x.PurchaseOrderId, x.SortOrder });

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.ProductNameSnapshot)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.TaxRate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.ReceivedQuantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .Property(x => x.BilledQuantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderLine>()
            .HasOne(x => x.PurchaseOrder)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.PurchaseOrderId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PurchaseOrderLine>()
            .ToTable(x => x.HasCheckConstraint("CK_PurchaseOrderLine_WorkflowQuantities", "\"Quantity\" >= 0 AND \"ReceivedQuantity\" >= 0 AND \"BilledQuantity\" >= 0 AND \"ReceivedQuantity\" <= \"Quantity\" AND \"BilledQuantity\" <= \"ReceivedQuantity\""));

        modelBuilder.Entity<GoodsReceivedNote>()
            .HasIndex(x => new { x.CompanyId, x.GoodsReceivedNoteNumber })
            .IsUnique();

        modelBuilder.Entity<GoodsReceivedNote>()
            .HasIndex(x => new { x.CompanyId, x.PurchaseOrderId, x.Status, x.DocumentDateUtc });

        modelBuilder.Entity<GoodsReceivedNote>()
            .HasIndex(x => x.WarehouseId);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.GoodsReceivedNoteNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.PurchaseOrderNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.CreatedFromDocumentNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.CreatedFromDocumentType)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNote>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .HasIndex(x => new { x.GoodsReceivedNoteId, x.SortOrder });

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .HasIndex(x => new { x.PurchaseOrderLineId, x.CreatedAtUtc });

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.ProductNameSnapshot)
            .HasMaxLength(200);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.TaxRate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .Property(x => x.BilledQuantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .HasOne(x => x.GoodsReceivedNote)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.GoodsReceivedNoteId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GoodsReceivedNoteLine>()
            .ToTable(x => x.HasCheckConstraint("CK_GoodsReceivedNoteLine_BilledQuantity", "\"Quantity\" >= 0 AND \"BilledQuantity\" >= 0 AND \"BilledQuantity\" <= \"Quantity\""));

        modelBuilder.Entity<PurchaseBill>()
            .HasIndex(x => new { x.CompanyId, x.PurchaseBillNumber })
            .IsUnique();

        modelBuilder.Entity<PurchaseBill>()
            .HasIndex(x => new { x.CompanyId, x.ContactId, x.Status, x.IssueDateUtc });

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.PurchaseBillNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.CreatedFromDocumentNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.CreatedFromDocumentType)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.AmountDue)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBill>()
            .Property(x => x.AmountPaid)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBill>()
            .ToTable(x => x.HasCheckConstraint("CK_PurchaseBill_Amounts", "\"TotalAmount\" >= 0 AND \"AmountDue\" >= 0 AND \"AmountPaid\" >= 0"));

        modelBuilder.Entity<PurchaseBillLine>()
            .HasIndex(x => new { x.PurchaseBillId, x.CreatedAtUtc });

        modelBuilder.Entity<PurchaseBillLine>()
            .HasIndex(x => x.PurchaseOrderLineId);

        modelBuilder.Entity<PurchaseBillLine>()
            .HasIndex(x => x.GoodsReceivedNoteLineId);

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.ProductNameSnapshot)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.Description)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBillLine>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.TaxRate)
            .HasPrecision(5, 2);

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBillLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseBillLine>()
            .HasOne(x => x.PurchaseBill)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.PurchaseBillId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PurchaseBillLine>()
            .ToTable(x => x.HasCheckConstraint("CK_PurchaseBillLine_SourceReference", "(CASE WHEN \"PurchaseOrderLineId\" IS NULL THEN 0 ELSE 1 END + CASE WHEN \"GoodsReceivedNoteLineId\" IS NULL THEN 0 ELSE 1 END) >= 1"));

        modelBuilder.Entity<PurchasePayment>()
            .HasIndex(x => new { x.CompanyId, x.PurchasePaymentNumber })
            .IsUnique();

        modelBuilder.Entity<PurchasePayment>()
            .HasIndex(x => new { x.CompanyId, x.ContactId, x.Status, x.PaymentDateUtc });

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.PurchasePaymentNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<PurchasePayment>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchasePaymentAllocation>()
            .HasIndex(x => new { x.PurchasePaymentId, x.PurchaseBillId });

        modelBuilder.Entity<PurchasePaymentAllocation>()
            .Property(x => x.PurchaseBillNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchasePaymentAllocation>()
            .Property(x => x.Amount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchasePaymentAllocation>()
            .HasOne(x => x.PurchasePayment)
            .WithMany(x => x.Allocations)
            .HasForeignKey(x => x.PurchasePaymentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PurchaseRefund>()
            .HasIndex(x => new { x.CompanyId, x.PurchaseRefundNumber })
            .IsUnique();

        modelBuilder.Entity<PurchaseRefund>()
            .HasIndex(x => new { x.CompanyId, x.PurchasePaymentId, x.Status, x.RefundDateUtc });

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.PurchaseRefundNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.ReferenceNo)
            .HasMaxLength(100);

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.Notes)
            .HasMaxLength(4000);

        modelBuilder.Entity<PurchaseRefund>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseRefund>()
            .HasOne(x => x.PurchasePayment)
            .WithMany(x => x.Refunds)
            .HasForeignKey(x => x.PurchasePaymentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PurchaseRefundAllocation>()
            .HasIndex(x => new { x.PurchaseRefundId, x.PurchasePaymentAllocationId })
            .IsUnique();

        modelBuilder.Entity<PurchaseRefundAllocation>()
            .Property(x => x.PurchaseBillNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseRefundAllocation>()
            .Property(x => x.Amount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseRefundAllocation>()
            .HasOne(x => x.PurchaseRefund)
            .WithMany(x => x.Allocations)
            .HasForeignKey(x => x.PurchaseRefundId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PurchaseCreditNote>()
            .HasIndex(x => new { x.CompanyId, x.PurchaseCreditNoteNumber })
            .IsUnique();

        modelBuilder.Entity<PurchaseCreditNote>()
            .HasIndex(x => new { x.CompanyId, x.PurchaseBillId, x.Status, x.IssuedAtUtc });

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.PurchaseCreditNoteNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.ContactName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.ContactEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.ContactPhoneNumber)
            .HasMaxLength(50);

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.Currency)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.Reason)
            .HasMaxLength(1000)
            .IsRequired();

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.SubtotalReduction)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.TaxReduction)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNote>()
            .Property(x => x.TotalReduction)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .HasIndex(x => new { x.PurchaseCreditNoteId, x.CreatedAtUtc });

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .Property(x => x.Description)
            .HasMaxLength(250)
            .IsRequired();

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .Property(x => x.UnitAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .Property(x => x.TaxAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .Property(x => x.LineTotal)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseCreditNoteLine>()
            .HasOne(x => x.PurchaseCreditNote)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.PurchaseCreditNoteId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Company>()
            .HasIndex(x => x.SubscriberId);

        modelBuilder.Entity<Company>()
            .Property(x => x.LegalName)
            .HasMaxLength(200);

        modelBuilder.Entity<Company>()
            .Property(x => x.RegistrationNumberType)
            .HasMaxLength(100);

        modelBuilder.Entity<Company>()
            .Property(x => x.OldRegistrationNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<Company>()
            .Property(x => x.Tin)
            .HasMaxLength(100);

        modelBuilder.Entity<Company>()
            .Property(x => x.MsicCode)
            .HasMaxLength(50);

        modelBuilder.Entity<Company>()
            .Property(x => x.TourismTaxRegistrationNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<Company>()
            .Property(x => x.HomeCountry)
            .HasMaxLength(100);

        modelBuilder.Entity<Company>()
            .Property(x => x.Currency)
            .HasMaxLength(3)
            .IsRequired();

        modelBuilder.Entity<Company>()
            .Property(x => x.SelectedPackage)
            .HasMaxLength(20);

        modelBuilder.Entity<Company>()
            .Property(x => x.PendingPackageCode)
            .HasMaxLength(20);

        modelBuilder.Entity<Company>()
            .Property(x => x.PackageStatus)
            .HasMaxLength(40);

        modelBuilder.Entity<Company>()
            .Property(x => x.PackageGracePeriodEndsAtUtc);

        modelBuilder.Entity<Company>()
            .Property(x => x.PackageBillingCycleStartUtc);

        modelBuilder.Entity<Company>()
            .HasOne(x => x.Subscriber)
            .WithMany(x => x.ManagedCompanies)
            .HasForeignKey(x => x.SubscriberId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);

        modelBuilder.Entity<CompanyAddress>()
            .ToTable("company_addresses");

        modelBuilder.Entity<CompanyAddress>()
            .HasIndex(x => x.CompanyId);

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.AddressName)
            .HasMaxLength(120)
            .IsRequired();

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.AddressLine1)
            .HasMaxLength(250)
            .IsRequired();

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.AddressLine2)
            .HasMaxLength(250);

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.AddressLine3)
            .HasMaxLength(250);

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.Postcode)
            .HasMaxLength(50);

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.City)
            .HasMaxLength(150);

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.State)
            .HasMaxLength(150);

        modelBuilder.Entity<CompanyAddress>()
            .Property(x => x.Country)
            .HasMaxLength(100)
            .IsRequired();

        modelBuilder.Entity<CompanyAddress>()
            .HasOne(x => x.Company)
            .WithMany(x => x.Addresses)
            .HasForeignKey(x => x.CompanyId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .ToTable("company_invoice_settings");

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .HasKey(x => x.CompanyId);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.Prefix)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.CreditNotePrefix)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BankName)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BankAccountName)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BankAccount)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.PaymentDueDays)
            .HasDefaultValue(7);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.PaymentLink)
            .HasMaxLength(500);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.PaymentGatewayProvider)
            .HasMaxLength(40)
            .HasDefaultValue("none");

        modelBuilder.Entity<Payment>()
            .Property(x => x.ReceiptEmailedAtUtc);

        modelBuilder.Entity<CreditNote>()
            .Property(x => x.CreditNoteNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<CreditNote>()
            .Property(x => x.PdfPath)
            .HasMaxLength(500);

        modelBuilder.Entity<CreditNote>()
            .HasIndex(x => new { x.CompanyId, x.CreditNoteNumber })
            .IsUnique();

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SubscriberBillplzApiKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SubscriberBillplzCollectionId)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SubscriberBillplzXSignatureKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SubscriberBillplzBaseUrl)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.PlatformPaymentGatewayProvider)
            .HasMaxLength(40)
            .HasDefaultValue("billplz");

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionPlatformPaymentGatewayProvider)
            .HasMaxLength(40)
            .HasDefaultValue("billplz");

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.TaxName)
            .HasMaxLength(50)
            .HasDefaultValue("SST");

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.TaxRegistrationNo)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.PaymentQrPath)
            .HasMaxLength(500);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppSendWindowStartHourUtc)
            .HasDefaultValue(9);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppSendWindowEndHourUtc)
            .HasDefaultValue(18);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .Property(x => x.RecipientPhoneNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .Property(x => x.Template)
            .HasMaxLength(2000);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .Property(x => x.Reference)
            .HasMaxLength(100)
            .IsRequired();

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .Property(x => x.Status)
            .HasMaxLength(40)
            .IsRequired();

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .Property(x => x.ExternalMessageId)
            .HasMaxLength(200);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .Property(x => x.ErrorMessage)
            .HasMaxLength(1000);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .HasIndex(x => x.InvoiceId);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .HasIndex(x => x.ReminderScheduleId);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .HasIndex(x => new { x.CompanyId, x.Status, x.NextAttemptAtUtc });

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .HasIndex(x => new { x.CompanyId, x.Status, x.NotBeforeUtc });

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .HasOne(x => x.Invoice)
            .WithMany()
            .HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<WhatsAppOutboundQueue>()
            .HasOne(x => x.ReminderSchedule)
            .WithMany()
            .HasForeignKey(x => x.ReminderScheduleId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.PaymentQrResponsibilityStatement)
            .HasMaxLength(1000);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.AutoSendInvoices)
            .HasDefaultValue(false);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.CcSubscriberOnCustomerEmails)
            .HasDefaultValue(true);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.AutoCompressUploads)
            .HasDefaultValue(true);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.UploadMaxBytes)
            .HasDefaultValue(2 * 1024 * 1024);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.UploadImageMaxDimension)
            .HasDefaultValue(1600);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.UploadImageQuality)
            .HasDefaultValue(80);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppProvider)
            .HasMaxLength(50);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppApiUrl)
            .HasMaxLength(500);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppAccessToken)
            .HasMaxLength(500);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppSenderId)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppTemplate)
            .HasMaxLength(2000);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppSessionStatus)
            .HasMaxLength(50);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.WhatsAppSessionPhone)
            .HasMaxLength(50);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.FeedbackNotificationEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SmtpHost)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionIssuerCompanyName)
            .HasMaxLength(150);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionIssuerRegistrationNumber)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionIssuerBillingEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionIssuerPhone)
            .HasMaxLength(50);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionIssuerAddress)
            .HasMaxLength(500);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionSmtpHost)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SmtpUsername)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SmtpPassword)
            .HasMaxLength(500);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SmtpFromEmail)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.SmtpFromName)
            .HasMaxLength(150);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BillplzApiKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionBillplzApiKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BillplzCollectionId)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionBillplzCollectionId)
            .HasMaxLength(100);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BillplzXSignatureKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionBillplzXSignatureKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.BillplzBaseUrl)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionBillplzBaseUrl)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.StripePublishableKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.StripeSecretKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.StripeWebhookSecret)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionStripePublishableKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionStripeSecretKey)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.ProductionStripeWebhookSecret)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.LocalEmailCaptureEnabled)
            .HasDefaultValue(false);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .Property(x => x.EmailShieldAddress)
            .HasMaxLength(200);

        modelBuilder.Entity<CompanyInvoiceSettings>()
            .HasOne(x => x.Company)
            .WithOne(x => x.InvoiceSettings)
            .HasForeignKey<CompanyInvoiceSettings>(x => x.CompanyId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<RefreshToken>()
            .HasIndex(x => x.Token)
            .IsUnique();

        modelBuilder.Entity<Invoice>()
            .HasIndex(x => new { x.CompanyId, x.InvoiceNumber })
            .IsUnique();

        modelBuilder.Entity<Invoice>()
            .Property(x => x.CompanyAddressSnapshot)
            .HasMaxLength(2000);

        modelBuilder.Entity<Invoice>()
            .HasIndex(x => x.PaymentConfirmationTokenHash)
            .IsUnique();

        modelBuilder.Entity<Invoice>()
            .HasIndex(x => new { x.SubscriberCompanyId, x.SourceType });

        modelBuilder.Entity<WebhookEvent>()
            .HasIndex(x => new { x.CompanyId, x.GatewayName, x.ExternalEventId })
            .IsUnique();

        modelBuilder.Entity<Refund>()
            .HasIndex(x => new { x.CompanyId, x.PaymentId });

        modelBuilder.Entity<PaymentConfirmationSubmission>()
            .HasIndex(x => new { x.CompanyId, x.InvoiceId, x.Status });

        modelBuilder.Entity<CreditNote>()
            .HasIndex(x => new { x.CompanyId, x.InvoiceId });

        modelBuilder.Entity<Dispute>()
            .HasIndex(x => new { x.CompanyId, x.ExternalDisputeId })
            .IsUnique();

        modelBuilder.Entity<PayoutBatch>()
            .HasIndex(x => new { x.CompanyId, x.ExternalBatchRef })
            .IsUnique();

        modelBuilder.Entity<PlatformPackage>()
            .HasIndex(x => x.Code)
            .IsUnique();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.Code)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.Name)
            .HasMaxLength(100)
            .IsRequired();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.PriceLabel)
            .HasMaxLength(100)
            .IsRequired();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.Description)
            .HasMaxLength(500)
            .IsRequired();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.Currency)
            .HasMaxLength(3)
            .IsRequired();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.IntervalUnit)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.GracePeriodDays)
            .HasDefaultValue(7);

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.MaxWhatsAppRemindersPerMonth)
            .HasDefaultValue(0);

        modelBuilder.Entity<PlatformPackage>()
            .Property(x => x.MaxPlans)
            .HasDefaultValue(0);

        modelBuilder.Entity<PlatformPackageFeature>()
            .Property(x => x.Text)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PlatformPackageFeature>()
            .HasOne(x => x.PlatformPackage)
            .WithMany(x => x.Features)
            .HasForeignKey(x => x.PlatformPackageId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PlatformPackageTrustPoint>()
            .Property(x => x.Text)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<PlatformPackageTrustPoint>()
            .HasOne(x => x.PlatformPackage)
            .WithMany(x => x.TrustPoints)
            .HasForeignKey(x => x.PlatformPackageId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductPlan>()
            .HasIndex(x => new { x.ProductId, x.IsDefault })
            .HasDatabaseName("IX_product_plans_ProductId_IsDefault_True")
            .IsUnique()
            .HasFilter("\"IsDefault\" = TRUE");

        modelBuilder.Entity<DunningRule>()
            .HasIndex(x => new { x.CompanyId, x.Name })
            .IsUnique();

        modelBuilder.Entity<ReminderSchedule>()
            .Property(x => x.ReminderName)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<ReminderSchedule>()
            .HasIndex(x => new { x.CompanyId, x.InvoiceId, x.OffsetDays })
            .IsUnique();

        modelBuilder.Entity<ReminderSchedule>()
            .HasOne(x => x.DunningRule)
            .WithMany()
            .HasForeignKey(x => x.DunningRuleId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<WhatsAppNotification>()
            .HasIndex(x => new { x.CompanyId, x.CreatedAtUtc });

        modelBuilder.Entity<WhatsAppNotification>()
            .HasIndex(x => x.InvoiceId);

        modelBuilder.Entity<WhatsAppNotification>()
            .HasIndex(x => x.ReminderScheduleId);

        modelBuilder.Entity<WhatsAppNotification>()
            .Property(x => x.RecipientPhoneNumber)
            .HasMaxLength(50)
            .IsRequired();

        modelBuilder.Entity<WhatsAppNotification>()
            .Property(x => x.Status)
            .HasMaxLength(40)
            .IsRequired();

        modelBuilder.Entity<WhatsAppNotification>()
            .Property(x => x.ExternalMessageId)
            .HasMaxLength(200);

        modelBuilder.Entity<WhatsAppNotification>()
            .Property(x => x.ErrorMessage)
            .HasMaxLength(1000);

        modelBuilder.Entity<WhatsAppNotification>()
            .HasOne(x => x.Invoice)
            .WithMany()
            .HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<WhatsAppNotification>()
            .HasOne(x => x.ReminderSchedule)
            .WithMany()
            .HasForeignKey(x => x.ReminderScheduleId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<FeedbackItem>()
            .HasIndex(x => new { x.CompanyId, x.Status, x.CreatedAtUtc });

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.SubmittedByName)
            .HasMaxLength(150)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.SubmittedByEmail)
            .HasMaxLength(200)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.Subject)
            .HasMaxLength(150)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.Category)
            .HasMaxLength(40)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.Priority)
            .HasMaxLength(20)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.Message)
            .HasMaxLength(2000)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.Status)
            .HasMaxLength(30)
            .IsRequired();

        modelBuilder.Entity<FeedbackItem>()
            .Property(x => x.AdminNote)
            .HasMaxLength(1000);

        modelBuilder.Entity<FeedbackItem>()
            .HasIndex(x => new { x.CompanyId, x.LastPlatformResponseAtUtc });

        modelBuilder.Entity<FeedbackItem>()
            .HasOne(x => x.Company)
            .WithMany()
            .HasForeignKey(x => x.CompanyId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<FeedbackItem>()
            .HasOne(x => x.SubmittedByUser)
            .WithMany()
            .HasForeignKey(x => x.SubmittedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<FeedbackItem>()
            .HasOne(x => x.ReviewedByUser)
            .WithMany()
            .HasForeignKey(x => x.ReviewedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Invoice>().Property(x => x.Subtotal).HasPrecision(18, 2);
        modelBuilder.Entity<Invoice>().Property(x => x.TaxAmount).HasPrecision(18, 2);
        modelBuilder.Entity<Invoice>().Property(x => x.TaxName).HasMaxLength(50);
        modelBuilder.Entity<Invoice>().Property(x => x.TaxRate).HasPrecision(5, 2);
        modelBuilder.Entity<Invoice>().Property(x => x.TaxRegistrationNo).HasMaxLength(100);
        modelBuilder.Entity<Invoice>().Property(x => x.Total).HasPrecision(18, 2);
        modelBuilder.Entity<Invoice>().Property(x => x.AmountDue).HasPrecision(18, 2);
        modelBuilder.Entity<Invoice>().Property(x => x.AmountPaid).HasPrecision(18, 2);
        modelBuilder.Entity<Invoice>().HasIndex(x => x.SalesOrderId);
        modelBuilder.Entity<Invoice>().HasIndex(x => x.DeliveryOrderId);
        modelBuilder.Entity<CompanyInvoiceSettings>().Property(x => x.TaxRate).HasPrecision(5, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.Quantity).HasPrecision(18, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.UnitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.TaxRate).HasPrecision(5, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.TaxAmount).HasPrecision(18, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.TotalAmount).HasPrecision(18, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.LineTotal).HasPrecision(18, 2);
        modelBuilder.Entity<Payment>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<Payment>().Property(x => x.ProofFilePath).HasMaxLength(500);
        modelBuilder.Entity<Payment>().Property(x => x.ProofFileName).HasMaxLength(255);
        modelBuilder.Entity<Payment>().Property(x => x.ProofContentType).HasMaxLength(100);
        modelBuilder.Entity<Invoice>().Property(x => x.PaymentConfirmationTokenHash).HasMaxLength(128);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.PayerName).HasMaxLength(150).IsRequired();
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.TransactionReference).HasMaxLength(100);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.Notes).HasMaxLength(500);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.ReviewNote).HasMaxLength(500);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.ProofFilePath).HasMaxLength(500);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.ProofFileName).HasMaxLength(255);
        modelBuilder.Entity<PaymentConfirmationSubmission>().Property(x => x.ProofContentType).HasMaxLength(100);
        modelBuilder.Entity<Refund>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNote>().Property(x => x.SubtotalReduction).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNote>().Property(x => x.TaxReduction).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNote>().Property(x => x.TotalReduction).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNoteLine>().Property(x => x.Quantity).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNoteLine>().Property(x => x.UnitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNoteLine>().Property(x => x.TaxAmount).HasPrecision(18, 2);
        modelBuilder.Entity<CreditNoteLine>().Property(x => x.LineTotal).HasPrecision(18, 2);
        modelBuilder.Entity<CustomerBalanceTransaction>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<Dispute>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<PayoutBatch>().Property(x => x.GrossAmount).HasPrecision(18, 2);
        modelBuilder.Entity<PayoutBatch>().Property(x => x.FeeAmount).HasPrecision(18, 2);
        modelBuilder.Entity<PayoutBatch>().Property(x => x.NetAmount).HasPrecision(18, 2);
        modelBuilder.Entity<SettlementLine>().Property(x => x.GrossAmount).HasPrecision(18, 2);
        modelBuilder.Entity<SettlementLine>().Property(x => x.FeeAmount).HasPrecision(18, 2);
        modelBuilder.Entity<SettlementLine>().Property(x => x.NetAmount).HasPrecision(18, 2);
        modelBuilder.Entity<ReconciliationResult>().Property(x => x.ExpectedAmount).HasPrecision(18, 2);
        modelBuilder.Entity<ReconciliationResult>().Property(x => x.ActualAmount).HasPrecision(18, 2);
        modelBuilder.Entity<LedgerPosting>().Property(x => x.DebitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<LedgerPosting>().Property(x => x.CreditAmount).HasPrecision(18, 2);
        modelBuilder.Entity<PlatformPackage>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<Subscription>().Property(x => x.CancellationReason).HasMaxLength(1000);
        modelBuilder.Entity<SubscriptionItem>().Property(x => x.UnitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<SubscriptionItem>().Property(x => x.Currency).HasMaxLength(3).IsRequired();
        modelBuilder.Entity<SubscriptionItem>().Property(x => x.BillingType).HasConversion<string>().HasMaxLength(20).IsRequired();
        modelBuilder.Entity<SubscriptionItem>().Property(x => x.IntervalUnit).HasConversion<string>().HasMaxLength(20).IsRequired();

        modelBuilder.Entity<SubscriptionItem>()
            .HasOne(x => x.ProductPlan)
            .WithMany()
            .HasForeignKey(x => x.ProductPlanId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<InvoiceLineItem>()
            .HasOne(x => x.SubscriptionItem)
            .WithMany()
            .HasForeignKey(x => x.SubscriptionItemId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<InvoiceLineItem>()
            .HasIndex(x => x.SalesOrderLineId);

        modelBuilder.Entity<InvoiceLineItem>()
            .HasIndex(x => x.DeliveryOrderLineId);

        modelBuilder.Entity<InvoiceLineItem>()
            .HasIndex(x => x.TaxCodeId);

        modelBuilder.Entity<Refund>()
            .HasOne(x => x.Payment)
            .WithMany(x => x.Refunds)
            .HasForeignKey(x => x.PaymentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PaymentConfirmationSubmission>()
            .HasOne(x => x.Invoice)
            .WithMany(x => x.PaymentConfirmations)
            .HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Refund>()
            .HasOne(x => x.Invoice)
            .WithMany(x => x.Refunds)
            .HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CreditNote>()
            .HasOne(x => x.Invoice)
            .WithMany(x => x.CreditNotes)
            .HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CreditNote>()
            .HasOne(x => x.Customer)
            .WithMany(x => x.CreditNotes)
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CreditNoteLine>()
            .HasOne(x => x.CreditNote)
            .WithMany(x => x.Lines)
            .HasForeignKey(x => x.CreditNoteId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CreditNoteLine>()
            .HasOne(x => x.InvoiceLine)
            .WithMany()
            .HasForeignKey(x => x.InvoiceLineId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CustomerBalanceTransaction>()
            .HasOne(x => x.Customer)
            .WithMany(x => x.BalanceTransactions)
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CustomerBalanceTransaction>()
            .HasOne(x => x.Invoice)
            .WithMany(x => x.BalanceTransactions)
            .HasForeignKey(x => x.InvoiceId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CustomerBalanceTransaction>()
            .HasOne(x => x.Payment)
            .WithMany(x => x.BalanceTransactions)
            .HasForeignKey(x => x.PaymentId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CustomerBalanceTransaction>()
            .HasOne(x => x.Refund)
            .WithMany()
            .HasForeignKey(x => x.RefundId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CustomerBalanceTransaction>()
            .HasOne(x => x.CreditNote)
            .WithMany()
            .HasForeignKey(x => x.CreditNoteId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Dispute>()
            .HasOne(x => x.Payment)
            .WithMany(x => x.Disputes)
            .HasForeignKey(x => x.PaymentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<SettlementLine>()
            .HasOne(x => x.PayoutBatch)
            .WithMany(x => x.SettlementLines)
            .HasForeignKey(x => x.PayoutBatchId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SettlementLine>()
            .HasOne(x => x.Payment)
            .WithMany()
            .HasForeignKey(x => x.PaymentId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<SettlementLine>()
            .HasOne(x => x.Refund)
            .WithMany()
            .HasForeignKey(x => x.RefundId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ReconciliationResult>()
            .HasOne(x => x.SettlementLine)
            .WithMany()
            .HasForeignKey(x => x.SettlementLineId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ReconciliationResult>()
            .HasOne(x => x.Payment)
            .WithMany()
            .HasForeignKey(x => x.PaymentId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ReconciliationResult>()
            .HasOne(x => x.Refund)
            .WithMany()
            .HasForeignKey(x => x.RefundId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Subscription>()
            .HasOne(x => x.Company)
            .WithMany(x => x.Subscriptions)
            .HasForeignKey(x => x.CompanyId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    public override int SaveChanges()
    {
        ApplyBaseEntityAuditMetadata();
        ValidatePurchaseWorkflowInvariants();
        return base.SaveChanges();
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyBaseEntityAuditMetadata();
        ValidatePurchaseWorkflowInvariants();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyBaseEntityAuditMetadata();
        ValidatePurchaseWorkflowInvariants();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyBaseEntityAuditMetadata();
        ValidatePurchaseWorkflowInvariants();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void ApplyBaseEntityAuditMetadata()
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAtUtc = DateTime.UtcNow;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAtUtc = DateTime.UtcNow;
            }
        }

        foreach (var entry in ChangeTracker.Entries<CompanyOwnedEntity>().Where(x => x.State == EntityState.Added))
        {
            if (entry.Entity.CompanyId == Guid.Empty)
            {
                throw new InvalidOperationException($"{entry.Entity.GetType().Name} requires CompanyId for tenant isolation.");
            }
        }
    }

    private void ValidatePurchaseWorkflowInvariants()
    {
        foreach (var entry in ChangeTracker.Entries<PurchaseOrderLine>().Where(x => x.State is EntityState.Added or EntityState.Modified))
        {
            var line = entry.Entity;
            if (line.Quantity < 0m || line.ReceivedQuantity < 0m || line.BilledQuantity < 0m)
            {
                throw new InvalidOperationException("Purchase order quantities cannot be negative.");
            }

            if (line.ReceivedQuantity > line.Quantity)
            {
                throw new InvalidOperationException($"Purchase order line '{line.Description}' cannot receive more than ordered.");
            }

            if (line.BilledQuantity > line.ReceivedQuantity)
            {
                throw new InvalidOperationException($"Purchase order line '{line.Description}' cannot bill more than received.");
            }
        }

        foreach (var entry in ChangeTracker.Entries<GoodsReceivedNoteLine>().Where(x => x.State is EntityState.Added or EntityState.Modified))
        {
            var line = entry.Entity;
            if (line.Quantity < 0m || line.BilledQuantity < 0m)
            {
                throw new InvalidOperationException("GRN quantities cannot be negative.");
            }

            if (line.BilledQuantity > line.Quantity)
            {
                throw new InvalidOperationException($"GRN line '{line.Description}' cannot bill more than received.");
            }
        }

        foreach (var entry in ChangeTracker.Entries<PurchaseBillLine>().Where(x => x.State is EntityState.Added or EntityState.Modified))
        {
            var line = entry.Entity;
            if (!line.PurchaseOrderLineId.HasValue && !line.GoodsReceivedNoteLineId.HasValue)
            {
                throw new InvalidOperationException("Purchase bill lines must reference a purchase order line or GRN line.");
            }
        }

        foreach (var entry in ChangeTracker.Entries<PurchaseBill>().Where(x => x.State is EntityState.Added or EntityState.Modified))
        {
            var bill = entry.Entity;
            if (bill.TotalAmount < 0m || bill.AmountDue < 0m || bill.AmountPaid < 0m)
            {
                throw new InvalidOperationException("Purchase bill amounts cannot be negative.");
            }
        }

        foreach (var entry in ChangeTracker.Entries<InventoryBalance>().Where(x => x.State is EntityState.Added or EntityState.Modified))
        {
            if (entry.Entity.QuantityOnHand < 0m)
            {
                throw new InvalidOperationException("Inventory balances cannot be negative.");
            }
        }
    }
}
