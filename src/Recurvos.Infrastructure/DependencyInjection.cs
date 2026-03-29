using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Auth;
using Recurvos.Application.Customers;
using Recurvos.Application.Dashboard;
using Recurvos.Application.Features;
using Recurvos.Application.Companies;
using Recurvos.Application.Invoices;
using Recurvos.Application.Payments;
using Recurvos.Application.Platform;
using Recurvos.Application.ProductPlans;
using Recurvos.Application.Products;
using Recurvos.Application.CreditNotes;
using Recurvos.Application.Finance;
using Recurvos.Application.Feedback;
using Recurvos.Application.Refunds;
using Recurvos.Application.Subscriptions;
using Recurvos.Application.Webhooks;
using Recurvos.Application.Settings;
using Recurvos.Infrastructure.Auth;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Gateways;
using Recurvos.Infrastructure.Jobs;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));
        services.Configure<SmtpOptions>(configuration.GetSection(SmtpOptions.SectionName));
        services.Configure<StorageOptions>(configuration.GetSection(StorageOptions.SectionName));
        services.Configure<BillplzOptions>(configuration.GetSection(BillplzOptions.SectionName));
        services.Configure<StripeOptions>(configuration.GetSection(StripeOptions.SectionName));
        services.Configure<AppUrlOptions>(configuration.GetSection(AppUrlOptions.SectionName));
        services.Configure<WhatsAppWebJsOptions>(configuration.GetSection(WhatsAppWebJsOptions.SectionName));

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=recurvos;Username=postgres;Password=postgres";

        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
        services.AddHangfire(config => config.UsePostgreSqlStorage(
            connectionString,
            new PostgreSqlStorageOptions
            {
                SchemaName = "hangfire",
                PrepareSchemaIfNecessary = true
            }));
        services.AddHangfireServer();
        services.AddHttpContextAccessor();
        services.AddMemoryCache();

        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IEmailSender, SmtpEmailSender>();
        services.AddScoped<PlatformOwnerNotificationService>();
        services.AddHttpClient<IWhatsAppSender, GenericWhatsAppSender>();
        services.AddHttpClient<IPlatformWhatsAppGateway, PlatformWhatsAppGateway>();
        services.AddScoped<IInvoiceStorage, LocalInvoiceStorage>();
        services.AddHttpClient<BillplzPaymentGateway>();
        services.AddHttpClient<StripePaymentGateway>();
        services.AddScoped<IPaymentGateway, BillplzPaymentGateway>();
        services.AddScoped<IPaymentGateway, StripePaymentGateway>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IRegistrationGuardService, RegistrationGuardService>();
        services.AddScoped<ICompanyService, CompanyService>();
        services.AddScoped<IFeatureEntitlementService, FeatureEntitlementService>();
        services.AddScoped<ICustomerService, CustomerService>();
        services.AddScoped<IProductService, ProductService>();
        services.AddScoped<IProductPlanService, ProductPlanService>();
        services.AddScoped<ISubscriptionService, SubscriptionService>();
        services.AddScoped<IInvoiceService, InvoiceService>();
        services.AddScoped<PaymentService>();
        services.AddScoped<IPaymentService, PaymentService>();
        services.AddScoped<IPaymentConfirmationService, PaymentConfirmationService>();
        services.AddScoped<IRefundService, RefundService>();
        services.AddScoped<ICreditNoteService, CreditNoteService>();
        services.AddScoped<IAccountingExportService, AccountingExportService>();
        services.AddScoped<IReconciliationService, ReconciliationService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IPlatformService, PlatformService>();
        services.AddScoped<ISubscriberPackageBillingService, SubscriberPackageBillingService>();
        services.AddScoped<IPackageLimitService, PackageLimitService>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IFeedbackService, FeedbackService>();
        services.AddScoped<IBillingReadinessService, BillingReadinessService>();
        services.AddScoped<IWebhookService, WebhookService>();
        services.AddScoped<StaleSignupCleanupService>();
        services.AddScoped<DbSeeder>();
        services.AddScoped<StorageResetService>();
        services.AddScoped<GenerateInvoicesJob>();
        services.AddScoped<GenerateSubscriberPackageInvoicesJob>();
        services.AddScoped<ReconcileSubscriberPackageStatusesJob>();
        services.AddScoped<SendInvoiceRemindersJob>();
        services.AddScoped<RetryFailedPaymentsJob>();
        services.AddScoped<CleanupStaleSignupsJob>();

        return services;
    }
}
