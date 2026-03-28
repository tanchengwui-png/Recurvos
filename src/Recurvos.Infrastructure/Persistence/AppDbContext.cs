using Microsoft.EntityFrameworkCore;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Common;

namespace Recurvos.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<CompanyInvoiceSettings> CompanyInvoiceSettings => Set<CompanyInvoiceSettings>();
    public DbSet<User> Users => Set<User>();
    public DbSet<EmailVerificationToken> EmailVerificationTokens => Set<EmailVerificationToken>();
    public DbSet<EmailDispatchLog> EmailDispatchLogs => Set<EmailDispatchLog>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Customer> Customers => Set<Customer>();
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
    public DbSet<PlatformPackage> PlatformPackages => Set<PlatformPackage>();
    public DbSet<PlatformPackageFeature> PlatformPackageFeatures => Set<PlatformPackageFeature>();
    public DbSet<PlatformPackageTrustPoint> PlatformPackageTrustPoints => Set<PlatformPackageTrustPoint>();
    public DbSet<WebhookEvent> WebhookEvents => Set<WebhookEvent>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<DunningRule> DunningRules => Set<DunningRule>();
    public DbSet<ReminderSchedule> ReminderSchedules => Set<ReminderSchedule>();
    public DbSet<WhatsAppNotification> WhatsAppNotifications => Set<WhatsAppNotification>();
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

        modelBuilder.Entity<Company>()
            .HasIndex(x => x.SubscriberId);

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
        modelBuilder.Entity<CompanyInvoiceSettings>().Property(x => x.TaxRate).HasPrecision(5, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.UnitAmount).HasPrecision(18, 2);
        modelBuilder.Entity<InvoiceLineItem>().Property(x => x.TotalAmount).HasPrecision(18, 2);
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

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
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

        return base.SaveChangesAsync(cancellationToken);
    }
}
