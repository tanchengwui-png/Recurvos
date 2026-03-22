using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Features;
using Recurvos.Application.Settings;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Persistence;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using System.Net.Sockets;
using MailKit.Net.Smtp;
using MailKit.Security;
using MailKit;
using MimeKit;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Recurvos.Infrastructure.Services;

public sealed class SettingsService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService,
    IPlatformWhatsAppGateway platformWhatsAppGateway,
    IOptions<BillplzOptions> billplzOptions,
    IOptions<StorageOptions> storageOptions,
    IHostEnvironment environment) : ISettingsService
{
    private const int AbsoluteUploadMaxBytes = 5 * 1024 * 1024;
    private const int DefaultMinimumDigits = 6;
    private readonly BillplzOptions _billplzOptions = billplzOptions.Value;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly IHostEnvironment _environment = environment;

    public async Task<IReadOnlyCollection<DunningRuleDto>> GetDunningRulesAsync(Guid? companyId, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = await GetOwnedCompanyIdAsync(companyId, cancellationToken);

        return await dbContext.DunningRules
            .Where(x => x.CompanyId == resolvedCompanyId)
            .OrderBy(x => x.OffsetDays)
            .Select(x => new DunningRuleDto(x.Id, x.Name, x.OffsetDays, x.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<DunningRuleDto>> UpdateDunningRulesAsync(Guid? companyId, UpdateDunningRulesRequest request, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = await GetOwnedCompanyIdAsync(companyId, cancellationToken);
        await featureEntitlementService.EnsureCompanyHasFeatureAsync(resolvedCompanyId, PlatformFeatureKeys.DunningWorkflows, cancellationToken);
        var existing = await dbContext.DunningRules.Where(x => x.CompanyId == resolvedCompanyId).ToListAsync(cancellationToken);
        dbContext.DunningRules.RemoveRange(existing);

        var rules = request.Rules.Select(x => new DunningRule
        {
            CompanyId = resolvedCompanyId,
            Name = x.Name,
            OffsetDays = x.OffsetDays,
            IsActive = x.IsActive
        }).ToList();

        dbContext.DunningRules.AddRange(rules);
        await dbContext.SaveChangesAsync(cancellationToken);
        await RebuildReminderSchedulesAsync(resolvedCompanyId, rules, cancellationToken);
        await auditService.WriteAsync("settings.dunning.updated", nameof(DunningRule), resolvedCompanyId.ToString(), $"rules={rules.Count}", cancellationToken);
        return rules.OrderBy(x => x.OffsetDays).Select(x => new DunningRuleDto(x.Id, x.Name, x.OffsetDays, x.IsActive)).ToList();
    }

    public async Task<CompanyInvoiceSettingsDto> GetCompanyInvoiceSettingsAsync(Guid? companyId, CancellationToken cancellationToken = default)
    {
        var settings = await EnsureInvoiceSettingsAsync(await GetOwnedCompanyIdAsync(companyId, cancellationToken), cancellationToken);
        return MapInvoiceSettings(settings);
    }

    public async Task<CompanyInvoiceSettingsDto> UpdateCompanyInvoiceSettingsAsync(Guid? companyId, UpdateCompanyInvoiceSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = await GetOwnedCompanyIdAsync(companyId, cancellationToken);
        var settings = await EnsureInvoiceSettingsAsync(resolvedCompanyId, cancellationToken);
        var modifiesWhatsAppSettings = settings.WhatsAppEnabled != request.WhatsAppEnabled
            || !string.Equals(settings.WhatsAppTemplate ?? string.Empty, request.WhatsAppTemplate ?? string.Empty, StringComparison.Ordinal);
        var emailRemindersEnabled = await featureEntitlementService.CompanyHasFeatureAsync(resolvedCompanyId, PlatformFeatureKeys.EmailReminders, cancellationToken);

        if (request.IsTaxEnabled && (!request.TaxRate.HasValue || request.TaxRate.Value <= 0))
        {
            throw new InvalidOperationException("Tax rate is required when SST is enabled.");
        }

        if (request.AutoSendInvoices && !emailRemindersEnabled)
        {
            throw new InvalidOperationException("Your current package does not include invoice email sending.");
        }

        if (modifiesWhatsAppSettings)
        {
            await featureEntitlementService.EnsureCompanyHasFeatureAsync(resolvedCompanyId, PlatformFeatureKeys.ConfigurableWhatsApp, cancellationToken);
        }

        var paymentGatewayProvider = NormalizePaymentGatewayProvider(request.PaymentGatewayProvider);
        var modifiesPaymentGatewaySettings =
            !string.Equals(settings.PaymentGatewayProvider, paymentGatewayProvider, StringComparison.OrdinalIgnoreCase)
            || settings.PaymentGatewayTermsAccepted != request.PaymentGatewayTermsAccepted
            || !string.Equals(settings.SubscriberBillplzApiKey ?? string.Empty, request.SubscriberBillplzApiKey ?? string.Empty, StringComparison.Ordinal)
            || !string.Equals(settings.SubscriberBillplzCollectionId ?? string.Empty, request.SubscriberBillplzCollectionId ?? string.Empty, StringComparison.Ordinal)
            || !string.Equals(settings.SubscriberBillplzXSignatureKey ?? string.Empty, request.SubscriberBillplzXSignatureKey ?? string.Empty, StringComparison.Ordinal)
            || !string.Equals(settings.SubscriberBillplzBaseUrl ?? string.Empty, request.SubscriberBillplzBaseUrl ?? string.Empty, StringComparison.Ordinal)
            || (settings.SubscriberBillplzRequireSignatureVerification ?? true) != request.SubscriberBillplzRequireSignatureVerification;

        if (modifiesPaymentGatewaySettings)
        {
            await featureEntitlementService.EnsureCompanyHasFeatureAsync(resolvedCompanyId, PlatformFeatureKeys.PaymentGatewayConfiguration, cancellationToken);
        }

        if (paymentGatewayProvider == "billplz")
        {
            if (!request.PaymentGatewayTermsAccepted)
            {
                throw new InvalidOperationException("You must accept the payment gateway terms before saving Billplz settings.");
            }

            ValidateSubscriberBillplzSettings(
                request.SubscriberBillplzApiKey,
                request.SubscriberBillplzCollectionId,
                request.SubscriberBillplzXSignatureKey,
                request.SubscriberBillplzBaseUrl,
                request.SubscriberBillplzRequireSignatureVerification);
        }

        settings.Prefix = request.Prefix.Trim();
        settings.NextNumber = request.NextNumber;
        settings.Padding = NormalizeMinimumDigits(request.Padding);
        settings.ResetYearly = request.ResetYearly;
        settings.ReceiptPrefix = request.ReceiptPrefix.Trim();
        settings.ReceiptNextNumber = request.ReceiptNextNumber;
        settings.ReceiptPadding = NormalizeMinimumDigits(request.ReceiptPadding);
        settings.ReceiptResetYearly = request.ReceiptResetYearly;
        settings.BankName = string.IsNullOrWhiteSpace(request.BankName) ? null : request.BankName.Trim();
        settings.BankAccountName = string.IsNullOrWhiteSpace(request.BankAccountName) ? null : request.BankAccountName.Trim();
        settings.BankAccount = string.IsNullOrWhiteSpace(request.BankAccount) ? null : request.BankAccount.Trim();
        settings.PaymentDueDays = request.PaymentDueDays;
        settings.PaymentLink = string.IsNullOrWhiteSpace(request.PaymentLink) ? null : request.PaymentLink.Trim();
        settings.PaymentGatewayProvider = paymentGatewayProvider;
        settings.PaymentGatewayTermsAccepted = paymentGatewayProvider != "none" && request.PaymentGatewayTermsAccepted;
        settings.PaymentGatewayTermsAcceptedAtUtc = paymentGatewayProvider != "none" && request.PaymentGatewayTermsAccepted
            ? settings.PaymentGatewayTermsAcceptedAtUtc ?? DateTime.UtcNow
            : null;
        settings.SubscriberBillplzApiKey = paymentGatewayProvider == "billplz" && !string.IsNullOrWhiteSpace(request.SubscriberBillplzApiKey)
            ? request.SubscriberBillplzApiKey.Trim()
            : null;
        settings.SubscriberBillplzCollectionId = paymentGatewayProvider == "billplz" && !string.IsNullOrWhiteSpace(request.SubscriberBillplzCollectionId)
            ? request.SubscriberBillplzCollectionId.Trim()
            : null;
        settings.SubscriberBillplzXSignatureKey = paymentGatewayProvider == "billplz" && !string.IsNullOrWhiteSpace(request.SubscriberBillplzXSignatureKey)
            ? request.SubscriberBillplzXSignatureKey.Trim()
            : null;
        settings.SubscriberBillplzBaseUrl = paymentGatewayProvider == "billplz" && !string.IsNullOrWhiteSpace(request.SubscriberBillplzBaseUrl)
            ? request.SubscriberBillplzBaseUrl.Trim()
            : null;
        settings.SubscriberBillplzRequireSignatureVerification = paymentGatewayProvider == "billplz"
            ? request.SubscriberBillplzRequireSignatureVerification
            : null;
        settings.IsTaxEnabled = request.IsTaxEnabled;
        settings.TaxName = string.IsNullOrWhiteSpace(request.TaxName) ? "SST" : request.TaxName.Trim();
        settings.TaxRate = request.IsTaxEnabled ? request.TaxRate : null;
        settings.TaxRegistrationNo = request.IsTaxEnabled && !string.IsNullOrWhiteSpace(request.TaxRegistrationNo)
            ? request.TaxRegistrationNo.Trim()
            : null;
        settings.ShowCompanyAddressOnInvoice = request.ShowCompanyAddressOnInvoice;
        settings.ShowCompanyAddressOnReceipt = request.ShowCompanyAddressOnReceipt;
        settings.AutoSendInvoices = request.AutoSendInvoices;
        settings.CcSubscriberOnCustomerEmails = request.CcSubscriberOnCustomerEmails;
        settings.WhatsAppEnabled = request.WhatsAppEnabled;
        settings.WhatsAppTemplate = string.IsNullOrWhiteSpace(request.WhatsAppTemplate) ? null : request.WhatsAppTemplate.Trim();
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.invoice-numbering.updated", nameof(CompanyInvoiceSettings), resolvedCompanyId.ToString(), $"{settings.Prefix}{settings.NextNumber}", cancellationToken);
        return MapInvoiceSettings(settings);
    }

    public async Task<PlatformWhatsAppSettingsDto> GetPlatformWhatsAppSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return await BuildPlatformWhatsAppSettingsDtoAsync(settings, refreshSession: true, cancellationToken);
    }

    public async Task<PlatformWhatsAppSettingsDto> UpdatePlatformWhatsAppSettingsAsync(UpdatePlatformWhatsAppSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        settings.WhatsAppEnabled = request.IsEnabled;
        settings.WhatsAppProvider = NormalizeWhatsAppProvider(request.Provider);
        settings.WhatsAppApiUrl = string.IsNullOrWhiteSpace(request.ApiUrl) ? null : request.ApiUrl.Trim();
        settings.WhatsAppAccessToken = string.IsNullOrWhiteSpace(request.AccessToken) ? null : request.AccessToken.Trim();
        settings.WhatsAppSenderId = string.IsNullOrWhiteSpace(request.SenderId) ? null : request.SenderId.Trim();
        settings.WhatsAppTemplate = string.IsNullOrWhiteSpace(request.Template) ? null : request.Template.Trim();
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-whatsapp.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), settings.WhatsAppSenderId, cancellationToken);
        return await BuildPlatformWhatsAppSettingsDtoAsync(settings, refreshSession: true, cancellationToken);
    }

    public async Task<PlatformWhatsAppSettingsDto> ConnectPlatformWhatsAppSessionAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        if (NormalizeWhatsAppProvider(settings.WhatsAppProvider) != "whatsapp_web_js")
        {
            throw new InvalidOperationException("Select WhatsApp Web (whatsapp-web.js) as the provider first.");
        }

        var snapshot = await platformWhatsAppGateway.ConnectAsync(settings.CompanyId, BuildPlatformWhatsAppConfiguration(settings), cancellationToken);
        await ApplyPlatformWhatsAppSnapshotAsync(settings, snapshot, cancellationToken);
        return MapPlatformWhatsAppSettings(settings, snapshot);
    }

    public async Task<PlatformWhatsAppSettingsDto> DisconnectPlatformWhatsAppSessionAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        var snapshot = await platformWhatsAppGateway.DisconnectAsync(settings.CompanyId, BuildPlatformWhatsAppConfiguration(settings), cancellationToken);
        await ApplyPlatformWhatsAppSnapshotAsync(settings, snapshot, cancellationToken);
        return MapPlatformWhatsAppSettings(settings, snapshot);
    }

    public async Task<PlatformWhatsAppSettingsDto> RefreshPlatformWhatsAppSessionAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return await BuildPlatformWhatsAppSettingsDtoAsync(settings, refreshSession: true, cancellationToken);
    }

    public async Task<PlatformWhatsAppTestMessageResultDto> SendPlatformWhatsAppTestMessageAsync(PlatformWhatsAppTestMessageRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        if (string.IsNullOrWhiteSpace(request.RecipientPhoneNumber))
        {
            throw new InvalidOperationException("Recipient phone number is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Message))
        {
            throw new InvalidOperationException("Test message cannot be empty.");
        }

        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        var savedConfiguration = BuildPlatformWhatsAppConfiguration(settings);
        var configuration = savedConfiguration with { IsEnabled = true };
        var result = await platformWhatsAppGateway.SendAsync(
            settings.CompanyId,
            configuration,
            NormalizePhoneNumber(request.RecipientPhoneNumber),
            request.Message.Trim(),
            settings.WhatsAppTemplate,
            $"test-{DateTime.UtcNow:yyyyMMddHHmmss}",
            cancellationToken);

        if (!result.Success)
        {
            throw new InvalidOperationException(result.ErrorMessage ?? "Unable to send WhatsApp test message.");
        }

        return new PlatformWhatsAppTestMessageResultDto(true, "WhatsApp test message sent.", result.ExternalMessageId);
    }

    public async Task<PlatformFeedbackSettingsDto> GetPlatformFeedbackSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return MapPlatformFeedbackSettings(settings);
    }

    public async Task<PlatformFeedbackSettingsDto> UpdatePlatformFeedbackSettingsAsync(UpdatePlatformFeedbackSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        settings.FeedbackNotificationEmail = string.IsNullOrWhiteSpace(request.OwnerNotificationEmail) ? null : request.OwnerNotificationEmail.Trim();
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-feedback.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), settings.FeedbackNotificationEmail, cancellationToken);
        return MapPlatformFeedbackSettings(settings);
    }

    public async Task<PlatformIssuerSettingsDto> GetPlatformIssuerSettingsAsync(string environment, CancellationToken cancellationToken = default)
    {
        var company = await GetPlatformCompanyAsync(cancellationToken);
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return MapPlatformIssuerSettings(company, settings, NormalizePlatformEnvironment(environment));
    }

    public async Task<PlatformIssuerSettingsDto> UpdatePlatformIssuerSettingsAsync(UpdatePlatformIssuerSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var company = await GetPlatformCompanyAsync(cancellationToken);
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        var environment = NormalizePlatformEnvironment(request.Environment);
        if (environment == "production")
        {
            settings.ProductionIssuerCompanyName = request.CompanyName.Trim();
            settings.ProductionIssuerRegistrationNumber = request.RegistrationNumber.Trim();
            settings.ProductionIssuerBillingEmail = request.BillingEmail.Trim();
            settings.ProductionIssuerPhone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            settings.ProductionIssuerAddress = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        }
        else
        {
            company.Name = request.CompanyName.Trim();
            company.RegistrationNumber = request.RegistrationNumber.Trim();
            company.Email = request.BillingEmail.Trim();
            company.Phone = string.IsNullOrWhiteSpace(request.Phone) ? string.Empty : request.Phone.Trim();
            company.Address = string.IsNullOrWhiteSpace(request.Address) ? string.Empty : request.Address.Trim();
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-issuer.updated", nameof(Company), company.Id.ToString(), $"{environment}:{request.CompanyName.Trim()}", cancellationToken);
        return MapPlatformIssuerSettings(company, settings, environment);
    }

    public async Task<PlatformDocumentNumberingSettingsDto> GetPlatformDocumentNumberingSettingsAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return MapPlatformDocumentNumberingSettings(settings);
    }

    public async Task<PlatformDocumentNumberingSettingsDto> UpdatePlatformDocumentNumberingSettingsAsync(UpdatePlatformDocumentNumberingSettingsRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        settings.Prefix = request.InvoicePrefix.Trim();
        settings.NextNumber = request.InvoiceNextNumber;
        settings.Padding = request.InvoiceMinimumDigits;
        settings.ResetYearly = request.InvoiceResetYearly;
        settings.ReceiptPrefix = request.ReceiptPrefix.Trim();
        settings.ReceiptNextNumber = request.ReceiptNextNumber;
        settings.ReceiptPadding = request.ReceiptMinimumDigits;
        settings.ReceiptResetYearly = request.ReceiptResetYearly;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-document-numbering.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), settings.Prefix, cancellationToken);
        return MapPlatformDocumentNumberingSettings(settings);
    }

    public async Task<PlatformRuntimeProfileDto> GetPlatformRuntimeProfileAsync(CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return new PlatformRuntimeProfileDto(settings.UseProductionPlatformSettings ? "production" : "staging");
    }

    public async Task<PlatformRuntimeProfileDto> UpdatePlatformRuntimeProfileAsync(UpdatePlatformRuntimeProfileRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        settings.UseProductionPlatformSettings = NormalizePlatformEnvironment(request.ActiveEnvironment) == "production";
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-runtime-profile.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), request.ActiveEnvironment, cancellationToken);
        return new PlatformRuntimeProfileDto(settings.UseProductionPlatformSettings ? "production" : "staging");
    }

    public async Task<PlatformSmtpSettingsDto> GetPlatformSmtpSettingsAsync(string environment, CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return MapPlatformSmtpSettings(settings, NormalizePlatformEnvironment(environment));
    }

    public async Task<PlatformSmtpSettingsDto> UpdatePlatformSmtpSettingsAsync(UpdatePlatformSmtpSettingsRequest request, CancellationToken cancellationToken = default)
    {
        ValidatePlatformSmtpSettings(request);
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        var environment = NormalizePlatformEnvironment(request.Environment);
        if (environment == "production")
        {
            settings.ProductionSmtpHost = string.IsNullOrWhiteSpace(request.Host) ? null : request.Host.Trim();
            settings.ProductionSmtpPort = request.Port;
            settings.ProductionSmtpUsername = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim();
            settings.ProductionSmtpPassword = string.IsNullOrWhiteSpace(request.Password) ? null : request.Password;
            settings.ProductionSmtpFromEmail = string.IsNullOrWhiteSpace(request.FromEmail) ? null : request.FromEmail.Trim();
            settings.ProductionSmtpFromName = string.IsNullOrWhiteSpace(request.FromName) ? null : request.FromName.Trim();
            settings.ProductionSmtpUseSsl = request.UseSsl;
            settings.ProductionLocalEmailCaptureEnabled = request.LocalEmailCaptureEnabled;
            settings.ProductionEmailShieldEnabled = request.EmailShieldEnabled;
            settings.ProductionEmailShieldAddress = string.IsNullOrWhiteSpace(request.EmailShieldAddress) ? null : request.EmailShieldAddress.Trim();
        }
        else
        {
            settings.SmtpHost = string.IsNullOrWhiteSpace(request.Host) ? null : request.Host.Trim();
            settings.SmtpPort = request.Port;
            settings.SmtpUsername = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim();
            settings.SmtpPassword = string.IsNullOrWhiteSpace(request.Password) ? null : request.Password;
            settings.SmtpFromEmail = string.IsNullOrWhiteSpace(request.FromEmail) ? null : request.FromEmail.Trim();
            settings.SmtpFromName = string.IsNullOrWhiteSpace(request.FromName) ? null : request.FromName.Trim();
            settings.SmtpUseSsl = request.UseSsl;
            settings.LocalEmailCaptureEnabled = request.LocalEmailCaptureEnabled;
            settings.EmailShieldEnabled = request.EmailShieldEnabled;
            settings.EmailShieldAddress = string.IsNullOrWhiteSpace(request.EmailShieldAddress) ? null : request.EmailShieldAddress.Trim();
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-smtp.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), $"{environment}:{request.FromEmail}", cancellationToken);
        return MapPlatformSmtpSettings(settings, environment);
    }

    public async Task<PlatformSmtpTestResultDto> TestPlatformSmtpAsync(UpdatePlatformSmtpSettingsRequest request, CancellationToken cancellationToken = default)
    {
        if (!currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException();
        }

        ValidatePlatformSmtpSettings(request);
        var host = string.IsNullOrWhiteSpace(request.Host) ? null : request.Host.Trim();
        if (string.IsNullOrWhiteSpace(host))
        {
            throw new InvalidOperationException("SMTP host is required for connection testing.");
        }

        if (request.Port is < 1 or > 65535)
        {
            throw new InvalidOperationException("SMTP port must be between 1 and 65535.");
        }

        try
        {
            using var client = new SmtpClient();
            await client.ConnectAsync(
                host,
                request.Port,
                request.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable,
                cancellationToken);

            if (!string.IsNullOrWhiteSpace(request.Username))
            {
                await client.AuthenticateAsync(request.Username.Trim(), request.Password ?? string.Empty, cancellationToken);
            }

            await client.DisconnectAsync(true, cancellationToken);
            return new PlatformSmtpTestResultDto(true, $"SMTP connection succeeded for {host}:{request.Port}.");
        }
        catch (SocketException)
        {
            throw new InvalidOperationException($"SMTP server is not reachable at {host}:{request.Port}.");
        }
        catch (SmtpCommandException exception)
        {
            throw new InvalidOperationException($"SMTP command failed: {exception.Message}");
        }
        catch (SmtpProtocolException exception)
        {
            throw new InvalidOperationException($"SMTP protocol error: {exception.Message}");
        }
        catch (AuthenticationException exception)
        {
            throw new InvalidOperationException($"SMTP authentication failed: {exception.Message}");
        }
    }

    public async Task<PlatformBillplzSettingsDto> GetPlatformBillplzSettingsAsync(string environment, CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return MapPlatformBillplzSettings(settings, _billplzOptions, NormalizePlatformEnvironment(environment));
    }

    public async Task<PlatformBillplzSettingsDto> UpdatePlatformBillplzSettingsAsync(UpdatePlatformBillplzSettingsRequest request, CancellationToken cancellationToken = default)
    {
        ValidatePlatformBillplzSettings(request);
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        var environment = NormalizePlatformEnvironment(request.Environment);
        if (environment == "production")
        {
            settings.ProductionBillplzApiKey = string.IsNullOrWhiteSpace(request.ApiKey) ? null : request.ApiKey.Trim();
            settings.ProductionBillplzCollectionId = string.IsNullOrWhiteSpace(request.CollectionId) ? null : request.CollectionId.Trim();
            settings.ProductionBillplzXSignatureKey = string.IsNullOrWhiteSpace(request.XSignatureKey) ? null : request.XSignatureKey.Trim();
            settings.ProductionBillplzBaseUrl = string.IsNullOrWhiteSpace(request.BaseUrl) ? null : request.BaseUrl.Trim();
            settings.ProductionBillplzRequireSignatureVerification = request.RequireSignatureVerification;
        }
        else
        {
            settings.BillplzApiKey = string.IsNullOrWhiteSpace(request.ApiKey) ? null : request.ApiKey.Trim();
            settings.BillplzCollectionId = string.IsNullOrWhiteSpace(request.CollectionId) ? null : request.CollectionId.Trim();
            settings.BillplzXSignatureKey = string.IsNullOrWhiteSpace(request.XSignatureKey) ? null : request.XSignatureKey.Trim();
            settings.BillplzBaseUrl = string.IsNullOrWhiteSpace(request.BaseUrl) ? null : request.BaseUrl.Trim();
            settings.BillplzRequireSignatureVerification = request.RequireSignatureVerification;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-billplz.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), $"{environment}:{request.CollectionId}", cancellationToken);
        return MapPlatformBillplzSettings(settings, _billplzOptions, environment);
    }

    public async Task<PlatformBillplzTestResultDto> TestPlatformBillplzAsync(UpdatePlatformBillplzSettingsRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformOwner();
        ValidatePlatformBillplzSettings(request);

        var apiKey = string.IsNullOrWhiteSpace(request.ApiKey) ? null : request.ApiKey.Trim();
        var collectionId = string.IsNullOrWhiteSpace(request.CollectionId) ? null : request.CollectionId.Trim();
        var baseUrl = string.IsNullOrWhiteSpace(request.BaseUrl) ? BillplzOptions.SandboxBaseUrl : request.BaseUrl.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Billplz API key is required.");
        }

        if (string.IsNullOrWhiteSpace(collectionId))
        {
            throw new InvalidOperationException("Billplz collection ID is required.");
        }

        try
        {
            using var client = new HttpClient();
            using var message = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/v4/collections/{collectionId}");
            var token = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{apiKey}:"));
            message.Headers.Authorization = new AuthenticationHeaderValue("Basic", token);

            using var response = await client.SendAsync(message, cancellationToken);
            var payload = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return new PlatformBillplzTestResultDto(true, $"Billplz connection succeeded for collection {collectionId}.");
            }

            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                throw new InvalidOperationException("Billplz could not find that collection. Check that Base URL matches the correct environment (sandbox vs live) and that the Collection ID exists in that same Billplz account.");
            }

            var cleanPayload = SanitizeRemoteError(payload);
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(cleanPayload) ? $"Billplz returned HTTP {(int)response.StatusCode}." : cleanPayload);
        }
        catch (HttpRequestException exception)
        {
            throw new InvalidOperationException($"Billplz is not reachable: {exception.Message}");
        }
    }

    private static string SanitizeRemoteError(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return string.Empty;
        }

        var trimmed = payload.Trim();
        if (!trimmed.Contains('<'))
        {
            return trimmed;
        }

        var titleMatch = System.Text.RegularExpressions.Regex.Match(
            trimmed,
            @"<title>\s*(.*?)\s*</title>",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline);

        if (titleMatch.Success)
        {
            return System.Net.WebUtility.HtmlDecode(titleMatch.Groups[1].Value.Trim());
        }

        return "Remote server returned an HTML error page.";
    }

    private static void ValidatePlatformSmtpSettings(UpdatePlatformSmtpSettingsRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.FromEmail))
        {
            EnsureValidEmailAddress(request.FromEmail, "From email");
        }

        if (request.EmailShieldEnabled)
        {
            if (string.IsNullOrWhiteSpace(request.EmailShieldAddress))
            {
                throw new InvalidOperationException("Shield email address is required when email shield mode is enabled.");
            }

            EnsureValidEmailAddress(request.EmailShieldAddress, "Shield email address");
        }
        else if (!string.IsNullOrWhiteSpace(request.EmailShieldAddress))
        {
            EnsureValidEmailAddress(request.EmailShieldAddress, "Shield email address");
        }
    }

    private static void ValidatePlatformBillplzSettings(UpdatePlatformBillplzSettingsRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.BaseUrl) && !Uri.TryCreate(request.BaseUrl.Trim(), UriKind.Absolute, out _))
        {
            throw new InvalidOperationException("Billplz base URL must be a valid absolute URL.");
        }

        if (request.RequireSignatureVerification && string.IsNullOrWhiteSpace(request.XSignatureKey))
        {
            throw new InvalidOperationException("Billplz X signature key is required when signature verification is enabled.");
        }
    }

    private static void EnsureValidEmailAddress(string value, string fieldName)
    {
        try
        {
            _ = MailboxAddress.Parse(value.Trim());
        }
        catch (ParseException)
        {
            throw new InvalidOperationException($"{fieldName} is not a valid email address.");
        }
        catch (FormatException)
        {
            throw new InvalidOperationException($"{fieldName} is not a valid email address.");
        }
    }

    public async Task<PlatformUploadPolicyDto> GetPlatformUploadPolicyAsync(CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        return MapPlatformUploadPolicy(settings);
    }

    public async Task<PlatformUploadPolicyDto> UpdatePlatformUploadPolicyAsync(UpdatePlatformUploadPolicyRequest request, CancellationToken cancellationToken = default)
    {
        var settings = await EnsurePlatformInvoiceSettingsAsync(cancellationToken);
        settings.AutoCompressUploads = request.AutoCompressUploads;
        settings.UploadMaxBytes = request.UploadMaxBytes;
        settings.UploadImageMaxDimension = request.UploadImageMaxDimension;
        settings.UploadImageQuality = request.UploadImageQuality;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.platform-upload-policy.updated", nameof(CompanyInvoiceSettings), settings.CompanyId.ToString(), $"{settings.UploadMaxBytes}", cancellationToken);
        return MapPlatformUploadPolicy(settings);
    }

    public async Task<PlatformUploadPolicyDto> GetCurrentUploadPolicyAsync(CancellationToken cancellationToken = default)
    {
        var settings = await GetPlatformUploadPolicySettingsAsync(cancellationToken);
        return MapPlatformUploadPolicy(settings);
    }

    public async Task<CompanyInvoiceSettingsDto?> UploadPaymentQrAsync(Guid? companyId, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = await GetOwnedCompanyIdAsync(companyId, cancellationToken);
        var settings = await EnsureInvoiceSettingsAsync(resolvedCompanyId, cancellationToken);
        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension) || !new[] { ".png", ".jpg", ".jpeg", ".webp" }.Contains(extension, StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Payment QR must be a PNG, JPG, JPEG, or WEBP image.");
        }

        var policy = await GetPlatformUploadPolicySettingsAsync(cancellationToken);
        if (content.CanSeek && content.Length > Math.Min(AbsoluteUploadMaxBytes, Math.Max(200_000, policy.UploadMaxBytes)))
        {
            throw new InvalidOperationException($"Payment QR must be {(Math.Min(AbsoluteUploadMaxBytes, Math.Max(200_000, policy.UploadMaxBytes)) / 1_000_000d):0.#} MB or smaller.");
        }

        var qrRoot = StoragePathResolver.Resolve(_environment, _storageOptions.PaymentQrDirectory);
        Directory.CreateDirectory(qrRoot);
        var companyDirectory = Path.Combine(qrRoot, resolvedCompanyId.ToString("N"));
        Directory.CreateDirectory(companyDirectory);

        foreach (var existing in Directory.GetFiles(companyDirectory))
        {
            File.Delete(existing);
        }

        var filePath = Path.Combine(companyDirectory, $"payment-qr{extension.ToLowerInvariant()}");
        await using var fileStream = File.Create(filePath);
        await content.CopyToAsync(fileStream, cancellationToken);

        settings.PaymentQrPath = filePath.Replace("\\", "/");
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("settings.payment-qr.updated", nameof(CompanyInvoiceSettings), resolvedCompanyId.ToString(), Path.GetFileName(filePath), cancellationToken);
        return MapInvoiceSettings(settings);
    }

    public async Task<CompanyPaymentQrFile?> GetPaymentQrAsync(Guid? companyId, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = await GetOwnedCompanyIdAsync(companyId, cancellationToken);
        var settings = await EnsureInvoiceSettingsAsync(resolvedCompanyId, cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.PaymentQrPath) || !File.Exists(settings.PaymentQrPath))
        {
            return null;
        }

        var content = await File.ReadAllBytesAsync(settings.PaymentQrPath, cancellationToken);
        var extension = Path.GetExtension(settings.PaymentQrPath).ToLowerInvariant();
        var contentType = extension switch
        {
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };

        return new CompanyPaymentQrFile(Path.GetFileName(settings.PaymentQrPath), content, contentType);
    }

    private async Task<CompanyInvoiceSettings> EnsureInvoiceSettingsAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var settings = await dbContext.CompanyInvoiceSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);
        if (settings is not null)
        {
            return settings;
        }

        var company = await dbContext.Companies.FirstAsync(x => x.Id == companyId, cancellationToken);
        settings = new CompanyInvoiceSettings
        {
            CompanyId = companyId,
            Prefix = "INV",
            NextNumber = company.InvoiceSequence > 0 ? company.InvoiceSequence : 1,
            Padding = DefaultMinimumDigits,
            ResetYearly = false,
            LastResetYear = null,
            ReceiptPrefix = "RCT",
            ReceiptNextNumber = 1,
            ReceiptPadding = DefaultMinimumDigits,
            ReceiptResetYearly = false,
            ReceiptLastResetYear = null,
            IsTaxEnabled = false,
            TaxName = "SST",
            TaxRate = null,
            TaxRegistrationNo = null,
            PaymentDueDays = 7,
            ShowCompanyAddressOnInvoice = true,
            ShowCompanyAddressOnReceipt = true,
            AutoSendInvoices = true,
            CcSubscriberOnCustomerEmails = true,
            WhatsAppProvider = "generic_api",
            AutoCompressUploads = true,
            UploadMaxBytes = 2_000_000,
            UploadImageMaxDimension = 1600,
            UploadImageQuality = 80
        };
        dbContext.CompanyInvoiceSettings.Add(settings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return settings;
    }

    private async Task<CompanyInvoiceSettings> EnsurePlatformInvoiceSettingsAsync(CancellationToken cancellationToken)
    {
        if (!currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException();
        }

        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var isPlatformCompany = await dbContext.Companies.AnyAsync(x => x.Id == companyId && x.IsPlatformAccount, cancellationToken);
        if (!isPlatformCompany)
        {
            throw new UnauthorizedAccessException();
        }

        return await EnsureInvoiceSettingsAsync(companyId, cancellationToken);
    }

    private CompanyInvoiceSettingsDto MapInvoiceSettings(CompanyInvoiceSettings settings)
    {
        settings.Padding = NormalizeMinimumDigits(settings.Padding);
        settings.ReceiptPadding = NormalizeMinimumDigits(settings.ReceiptPadding);
        var monthStartUtc = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthlySent = dbContext.WhatsAppNotifications.Count(x => x.CompanyId == settings.CompanyId && x.Status == "Sent" && x.CreatedAtUtc >= monthStartUtc);
        var monthlyLimit = dbContext.Companies
            .Where(x => x.Id == settings.CompanyId)
            .Select(x => dbContext.PlatformPackages
                .Where(p => p.Code == x.SelectedPackage)
                .Select(p => p.MaxWhatsAppRemindersPerMonth)
                .FirstOrDefault())
            .FirstOrDefault();
        var platformSettings = dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefault();
        var platformProvider = NormalizeWhatsAppProvider(platformSettings?.WhatsAppProvider);
        var whatsAppReady = platformSettings is not null
            && platformSettings.WhatsAppEnabled
            && (platformProvider switch
            {
                "whatsapp_web_js" => string.Equals(platformSettings.WhatsAppSessionStatus, "connected", StringComparison.OrdinalIgnoreCase),
                _ => !string.IsNullOrWhiteSpace(platformSettings.WhatsAppApiUrl)
                    && !string.IsNullOrWhiteSpace(platformSettings.WhatsAppAccessToken)
                    && !string.IsNullOrWhiteSpace(platformSettings.WhatsAppSenderId),
            });

        return new(
            settings.CompanyId,
            settings.Prefix,
            settings.NextNumber,
            settings.Padding,
            settings.ResetYearly,
            settings.LastResetYear,
            settings.ReceiptPrefix,
            settings.ReceiptNextNumber,
            settings.ReceiptPadding,
            settings.ReceiptResetYearly,
            settings.ReceiptLastResetYear,
            settings.BankName,
            settings.BankAccountName,
            settings.BankAccount,
            settings.PaymentDueDays,
            settings.PaymentLink,
            settings.PaymentGatewayProvider,
            settings.PaymentGatewayTermsAccepted,
            settings.PaymentGatewayTermsAcceptedAtUtc,
            settings.SubscriberBillplzApiKey,
            settings.SubscriberBillplzCollectionId,
            settings.SubscriberBillplzXSignatureKey,
            settings.SubscriberBillplzBaseUrl,
            settings.SubscriberBillplzRequireSignatureVerification ?? true,
            IsSubscriberPaymentGatewayReady(settings),
            settings.IsTaxEnabled,
            settings.TaxName,
            settings.TaxRate,
            settings.TaxRegistrationNo,
            settings.ShowCompanyAddressOnInvoice,
            settings.ShowCompanyAddressOnReceipt,
            settings.AutoSendInvoices,
            settings.CcSubscriberOnCustomerEmails,
            !string.IsNullOrWhiteSpace(settings.PaymentQrPath),
            settings.WhatsAppEnabled,
            settings.WhatsAppTemplate,
            whatsAppReady,
            monthlyLimit,
            monthlySent);
    }

    private static PlatformUploadPolicyDto MapPlatformUploadPolicy(CompanyInvoiceSettings settings) =>
        new(
            settings.AutoCompressUploads,
            settings.UploadMaxBytes,
            settings.UploadImageMaxDimension,
            settings.UploadImageQuality);

    private static PlatformFeedbackSettingsDto MapPlatformFeedbackSettings(CompanyInvoiceSettings settings) =>
        new(
            settings.FeedbackNotificationEmail,
            !string.IsNullOrWhiteSpace(settings.FeedbackNotificationEmail));

    private static PlatformIssuerSettingsDto MapPlatformIssuerSettings(Company company, CompanyInvoiceSettings settings, string environment)
    {
        var isProduction = environment == "production";
        var companyName = isProduction && !string.IsNullOrWhiteSpace(settings.ProductionIssuerCompanyName) ? settings.ProductionIssuerCompanyName : company.Name;
        var registrationNumber = isProduction && !string.IsNullOrWhiteSpace(settings.ProductionIssuerRegistrationNumber) ? settings.ProductionIssuerRegistrationNumber : company.RegistrationNumber;
        var billingEmail = isProduction && !string.IsNullOrWhiteSpace(settings.ProductionIssuerBillingEmail) ? settings.ProductionIssuerBillingEmail : company.Email;
        var phone = isProduction ? settings.ProductionIssuerPhone : company.Phone;
        var address = isProduction ? settings.ProductionIssuerAddress : company.Address;

        return new(
            environment,
            companyName,
            registrationNumber,
            billingEmail,
            string.IsNullOrWhiteSpace(phone) ? null : phone,
            string.IsNullOrWhiteSpace(address) ? null : address,
            settings.UseProductionPlatformSettings == isProduction,
            !string.IsNullOrWhiteSpace(companyName)
            && !string.IsNullOrWhiteSpace(registrationNumber)
            && !string.IsNullOrWhiteSpace(billingEmail));
    }

    private static PlatformDocumentNumberingSettingsDto MapPlatformDocumentNumberingSettings(CompanyInvoiceSettings settings) =>
        new(
            settings.Prefix,
            settings.NextNumber,
            settings.Padding,
            settings.ResetYearly,
            settings.LastResetYear,
            settings.ReceiptPrefix,
            settings.ReceiptNextNumber,
            settings.ReceiptPadding,
            settings.ReceiptResetYearly,
            settings.ReceiptLastResetYear);

    private static PlatformSmtpSettingsDto MapPlatformSmtpSettings(CompanyInvoiceSettings settings, string environment)
    {
        var isProduction = environment == "production";
        var host = isProduction ? settings.ProductionSmtpHost : settings.SmtpHost;
        var port = isProduction ? settings.ProductionSmtpPort : settings.SmtpPort;
        var username = isProduction ? settings.ProductionSmtpUsername : settings.SmtpUsername;
        var password = isProduction ? settings.ProductionSmtpPassword : settings.SmtpPassword;
        var fromEmail = isProduction ? settings.ProductionSmtpFromEmail : settings.SmtpFromEmail;
        var fromName = isProduction ? settings.ProductionSmtpFromName : settings.SmtpFromName;
        var useSsl = isProduction ? settings.ProductionSmtpUseSsl : settings.SmtpUseSsl;
        var localCapture = isProduction ? settings.ProductionLocalEmailCaptureEnabled : settings.LocalEmailCaptureEnabled;
        var shieldEnabled = isProduction ? settings.ProductionEmailShieldEnabled : settings.EmailShieldEnabled;
        var shieldAddress = isProduction ? settings.ProductionEmailShieldAddress : settings.EmailShieldAddress;
        var hasMinimumConfig =
            !string.IsNullOrWhiteSpace(host)
            && port.HasValue
            && !string.IsNullOrWhiteSpace(fromEmail);

        return new(
            environment,
            host,
            port ?? 1025,
            username,
            password,
            fromEmail,
            fromName,
            useSsl ?? false,
            localCapture,
            shieldEnabled,
            shieldAddress,
            settings.UseProductionPlatformSettings == isProduction,
            hasMinimumConfig);
    }

    private static PlatformBillplzSettingsDto MapPlatformBillplzSettings(CompanyInvoiceSettings settings, BillplzOptions fallback, string environment)
    {
        var isProduction = environment == "production";
        var apiKey = isProduction
            ? settings.ProductionBillplzApiKey
            : (string.IsNullOrWhiteSpace(settings.BillplzApiKey) ? fallback.ApiKey : settings.BillplzApiKey);
        var collectionId = isProduction
            ? settings.ProductionBillplzCollectionId
            : (string.IsNullOrWhiteSpace(settings.BillplzCollectionId) ? fallback.CollectionId : settings.BillplzCollectionId);
        var signatureKey = isProduction
            ? settings.ProductionBillplzXSignatureKey
            : (string.IsNullOrWhiteSpace(settings.BillplzXSignatureKey) ? fallback.XSignatureKey : settings.BillplzXSignatureKey);
        var baseUrl = isProduction
            ? settings.ProductionBillplzBaseUrl
            : (string.IsNullOrWhiteSpace(settings.BillplzBaseUrl) ? fallback.BaseUrl : settings.BillplzBaseUrl);
        var requireSignatureVerification = isProduction
            ? settings.ProductionBillplzRequireSignatureVerification ?? true
            : settings.BillplzRequireSignatureVerification ?? fallback.RequireSignatureVerification;
        var ready = !string.IsNullOrWhiteSpace(apiKey)
            && !string.IsNullOrWhiteSpace(collectionId)
            && !string.IsNullOrWhiteSpace(baseUrl)
            && (!requireSignatureVerification || !string.IsNullOrWhiteSpace(signatureKey));

        return new(
            environment,
            apiKey,
            collectionId,
            signatureKey,
            baseUrl,
            requireSignatureVerification,
            settings.UseProductionPlatformSettings == isProduction,
            ready);
    }

    private static string NormalizePlatformEnvironment(string? environment) =>
        string.Equals(environment, "production", StringComparison.OrdinalIgnoreCase) ? "production" : "staging";

    private static string NormalizePaymentGatewayProvider(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "billplz" => "billplz",
            _ => "none",
        };
    }

    private async Task<PlatformWhatsAppSettingsDto> BuildPlatformWhatsAppSettingsDtoAsync(CompanyInvoiceSettings settings, bool refreshSession, CancellationToken cancellationToken)
    {
        PlatformWhatsAppSessionSnapshot? snapshot = null;
        if (refreshSession)
        {
            try
            {
                snapshot = await platformWhatsAppGateway.GetSessionAsync(settings.CompanyId, BuildPlatformWhatsAppConfiguration(settings), cancellationToken);
                await ApplyPlatformWhatsAppSnapshotAsync(settings, snapshot, cancellationToken);
            }
            catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or InvalidOperationException)
            {
                snapshot = new PlatformWhatsAppSessionSnapshot(
                    "worker_unreachable",
                    settings.WhatsAppSessionPhone,
                    settings.WhatsAppSessionLastSyncedAtUtc ?? DateTime.UtcNow,
                    null,
                    "WhatsApp worker is not reachable yet. Start the worker and refresh this page.",
                    false);
            }
        }

        return MapPlatformWhatsAppSettings(settings, snapshot);
    }

    private async Task ApplyPlatformWhatsAppSnapshotAsync(CompanyInvoiceSettings settings, PlatformWhatsAppSessionSnapshot snapshot, CancellationToken cancellationToken)
    {
        settings.WhatsAppSessionStatus = snapshot.Status;
        settings.WhatsAppSessionPhone = snapshot.ConnectedPhone;
        settings.WhatsAppSessionLastSyncedAtUtc = snapshot.LastSyncedAtUtc ?? DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static PlatformWhatsAppConfiguration BuildPlatformWhatsAppConfiguration(CompanyInvoiceSettings settings) =>
        new(
            settings.WhatsAppEnabled,
            NormalizeWhatsAppProvider(settings.WhatsAppProvider),
            settings.WhatsAppApiUrl,
            settings.WhatsAppAccessToken,
            settings.WhatsAppSenderId,
            settings.WhatsAppTemplate,
            settings.WhatsAppSessionStatus,
            settings.WhatsAppSessionPhone,
            settings.WhatsAppSessionLastSyncedAtUtc);

    private static PlatformWhatsAppSettingsDto MapPlatformWhatsAppSettings(CompanyInvoiceSettings settings, PlatformWhatsAppSessionSnapshot? snapshot = null)
    {
        var provider = NormalizeWhatsAppProvider(settings.WhatsAppProvider);
        var sessionStatus = snapshot?.Status ?? (string.IsNullOrWhiteSpace(settings.WhatsAppSessionStatus) ? "not_connected" : settings.WhatsAppSessionStatus.Trim().ToLowerInvariant());
        var sessionPhone = snapshot?.ConnectedPhone ?? settings.WhatsAppSessionPhone;
        var sessionLastSyncedAtUtc = snapshot?.LastSyncedAtUtc ?? settings.WhatsAppSessionLastSyncedAtUtc;
        var ready = settings.WhatsAppEnabled && (provider switch
        {
            "whatsapp_web_js" => snapshot?.IsReady ?? sessionStatus == "connected",
            "generic_api" => !string.IsNullOrWhiteSpace(settings.WhatsAppApiUrl)
                && !string.IsNullOrWhiteSpace(settings.WhatsAppAccessToken)
                && !string.IsNullOrWhiteSpace(settings.WhatsAppSenderId),
            _ => false,
        });

        return new(
            settings.WhatsAppEnabled,
            provider,
            settings.WhatsAppApiUrl,
            settings.WhatsAppAccessToken,
            settings.WhatsAppSenderId,
            settings.WhatsAppTemplate,
            ready,
            sessionStatus,
            sessionPhone,
            sessionLastSyncedAtUtc,
            snapshot?.QrCodeDataUrl,
            snapshot?.LastError);
    }

    private static string NormalizeWhatsAppProvider(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "whatsapp_web_js" => "whatsapp_web_js",
            "generic_api" => "generic_api",
            _ => "generic_api",
        };
    }

    private void EnsurePlatformOwner()
    {
        if (!currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException();
        }
    }

    private static string NormalizePhoneNumber(string input)
    {
        var digits = new string(input.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("00", StringComparison.Ordinal))
        {
            digits = digits[2..];
        }

        if (digits.StartsWith("0", StringComparison.Ordinal))
        {
            digits = "60" + digits[1..];
        }

        return digits;
    }

    private async Task<CompanyInvoiceSettings> GetPlatformUploadPolicySettingsAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.Companies
            .Where(x => x.IsPlatformAccount)
            .Select(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(cancellationToken);

        if (settings is not null)
        {
            return settings;
        }

        var platformCompany = await dbContext.Companies.FirstOrDefaultAsync(x => x.IsPlatformAccount, cancellationToken);
        if (platformCompany is null)
        {
            throw new InvalidOperationException("Platform account settings could not be resolved.");
        }

        return await EnsureInvoiceSettingsAsync(platformCompany.Id, cancellationToken);
    }

    private async Task RebuildReminderSchedulesAsync(Guid companyId, IReadOnlyCollection<DunningRule> rules, CancellationToken cancellationToken)
    {
        var activeRules = rules.Where(x => x.IsActive).ToList();
        var existingSchedules = await dbContext.ReminderSchedules
            .Where(x => x.CompanyId == companyId && x.SentAtUtc == null)
            .ToListAsync(cancellationToken);
        if (existingSchedules.Count > 0)
        {
            dbContext.ReminderSchedules.RemoveRange(existingSchedules);
        }

        if (activeRules.Count == 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return;
        }

        var openInvoices = await dbContext.Invoices
            .Where(x => x.CompanyId == companyId
                && x.Status != InvoiceStatus.Voided
                && x.AmountDue > 0)
            .Select(x => new
            {
                x.Id,
                x.DueDateUtc
            })
            .ToListAsync(cancellationToken);

        foreach (var invoice in openInvoices)
        {
            foreach (var rule in activeRules)
            {
                dbContext.ReminderSchedules.Add(new ReminderSchedule
                {
                    CompanyId = companyId,
                    InvoiceId = invoice.Id,
                    DunningRuleId = rule.Id,
                    ScheduledAtUtc = invoice.DueDateUtc.Date.AddDays(rule.OffsetDays)
                });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<Company> GetPlatformCompanyAsync(CancellationToken cancellationToken)
    {
        if (!currentUserService.IsPlatformOwner)
        {
            throw new UnauthorizedAccessException();
        }

        var company = await dbContext.Companies.FirstOrDefaultAsync(x => x.IsPlatformAccount, cancellationToken);
        if (company is not null)
        {
            return company;
        }

        company = new Company
        {
            Name = "Recurvo",
            RegistrationNumber = "PLATFORM-OWNER",
            Email = "support@recurvo.com",
            Phone = "+60300000000",
            Address = "Kuala Lumpur, Malaysia",
            IsActive = true,
            IsPlatformAccount = true
        };
        dbContext.Companies.Add(company);
        await dbContext.SaveChangesAsync(cancellationToken);
        return company;
    }

    private async Task<Guid> GetOwnedCompanyIdAsync(Guid? companyId, CancellationToken cancellationToken)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var resolvedCompanyId = companyId ?? currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var hasAccess = await dbContext.Companies.AnyAsync(
            x => x.Id == resolvedCompanyId && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);

        if (!hasAccess)
        {
            throw new UnauthorizedAccessException();
        }

        return resolvedCompanyId;
    }

    private static int NormalizeMinimumDigits(int value) =>
        value is >= 1 and <= 12 ? value : DefaultMinimumDigits;

    private static bool IsSubscriberPaymentGatewayReady(CompanyInvoiceSettings settings)
    {
        var provider = NormalizePaymentGatewayProvider(settings.PaymentGatewayProvider);
        return provider switch
        {
            "billplz" =>
                settings.PaymentGatewayTermsAccepted
                && !string.IsNullOrWhiteSpace(settings.SubscriberBillplzApiKey)
                && !string.IsNullOrWhiteSpace(settings.SubscriberBillplzCollectionId)
                && !string.IsNullOrWhiteSpace(settings.SubscriberBillplzBaseUrl)
                && ((settings.SubscriberBillplzRequireSignatureVerification ?? true) == false
                    || !string.IsNullOrWhiteSpace(settings.SubscriberBillplzXSignatureKey)),
            _ => false,
        };
    }

    private static void ValidateSubscriberBillplzSettings(
        string? apiKey,
        string? collectionId,
        string? signatureKey,
        string? baseUrl,
        bool requireSignatureVerification)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Billplz API key is required.");
        }

        if (string.IsNullOrWhiteSpace(collectionId))
        {
            throw new InvalidOperationException("Billplz collection ID is required.");
        }

        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new InvalidOperationException("Billplz base URL is required.");
        }

        if (requireSignatureVerification && string.IsNullOrWhiteSpace(signatureKey))
        {
            throw new InvalidOperationException("Billplz x signature key is required when signature verification is enabled.");
        }
    }

    private static AuthenticationHeaderValue CreateBasicAuthHeader(string apiKey)
    {
        var token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{apiKey}:"));
        return new AuthenticationHeaderValue("Basic", token);
    }

    private static string ExtractBillplzErrorMessage(string payload, string fallback)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return fallback;
        }

        var sanitized = SanitizeRemoteError(payload);
        if (!string.IsNullOrWhiteSpace(sanitized))
        {
            return sanitized;
        }

        try
        {
            using var document = JsonDocument.Parse(payload);
            if (document.RootElement.TryGetProperty("error", out var errorElement)
                && errorElement.TryGetProperty("message", out var messageElement))
            {
                if (messageElement.ValueKind == JsonValueKind.Array)
                {
                    var messages = messageElement.EnumerateArray()
                        .Where(x => x.ValueKind == JsonValueKind.String)
                        .Select(x => x.GetString())
                        .Where(x => !string.IsNullOrWhiteSpace(x));
                    var combined = string.Join(" ", messages!);
                    if (!string.IsNullOrWhiteSpace(combined))
                    {
                        return combined;
                    }
                }

                if (messageElement.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(messageElement.GetString()))
                {
                    return messageElement.GetString()!;
                }
            }
        }
        catch (JsonException)
        {
        }

        return fallback;
    }

    public async Task<CompanyPaymentGatewayTestResultDto> TestCompanyPaymentGatewayAsync(Guid? companyId, TestCompanyPaymentGatewayRequest request, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = await GetOwnedCompanyIdAsync(companyId, cancellationToken);
        var provider = NormalizePaymentGatewayProvider(request.PaymentGatewayProvider);
        if (provider == "none")
        {
            throw new InvalidOperationException("Choose a payment gateway provider first.");
        }

        await featureEntitlementService.EnsureCompanyHasFeatureAsync(resolvedCompanyId, PlatformFeatureKeys.PaymentGatewayConfiguration, cancellationToken);

        if (provider != "billplz")
        {
            throw new InvalidOperationException("Only Billplz is supported right now.");
        }

        ValidateSubscriberBillplzSettings(
            request.SubscriberBillplzApiKey,
            request.SubscriberBillplzCollectionId,
            request.SubscriberBillplzXSignatureKey,
            request.SubscriberBillplzBaseUrl,
            request.SubscriberBillplzRequireSignatureVerification);

        using var requestMessage = new HttpRequestMessage(
            HttpMethod.Get,
            $"{request.SubscriberBillplzBaseUrl!.Trim().TrimEnd('/')}/api/v4/collections/{request.SubscriberBillplzCollectionId!.Trim()}");
        requestMessage.Headers.Authorization = CreateBasicAuthHeader(request.SubscriberBillplzApiKey!.Trim());

        using var httpClient = new HttpClient();
        using var response = await httpClient.SendAsync(requestMessage, cancellationToken);
        var rawResponse = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(ExtractBillplzErrorMessage(rawResponse, "Unable to verify the Billplz collection with the provided settings."));
        }

        return new CompanyPaymentGatewayTestResultDto(true, "Billplz connection succeeded.");
    }
}
