using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Settings;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class BillingReadinessService(AppDbContext dbContext, ICurrentUserService currentUserService) : IBillingReadinessService
{
    public async Task<BillingReadinessDto> GetAsync(Guid? companyId = null, CancellationToken cancellationToken = default)
    {
        var resolvedCompanyId = companyId ?? currentUserService.CompanyId;
        if (!resolvedCompanyId.HasValue)
        {
            return BuildMissingCompanyResult();
        }

        return await GetOwnedCompanyReadinessAsync(resolvedCompanyId.Value, cancellationToken);
    }

    public Task<BillingReadinessDto> GetForCompanyAsync(Guid companyId, CancellationToken cancellationToken = default) =>
        BuildReadinessAsync(companyId, cancellationToken);

    public async Task EnsureReadyAsync(Guid companyId, string operationName, CancellationToken cancellationToken = default)
    {
        var readiness = await BuildReadinessAsync(companyId, cancellationToken);
        if (readiness.IsReady)
        {
            return;
        }

        var missing = string.Join(", ", readiness.MissingRequiredItems.Select(x => x.Title));
        throw new InvalidOperationException($"Billing setup is incomplete for {operationName}. Complete: {missing}.");
    }

    private async Task<BillingReadinessDto> GetOwnedCompanyReadinessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var subscriberId = currentUserService.UserId ?? throw new UnauthorizedAccessException();
        var hasAccess = await dbContext.Companies.AnyAsync(
            x => x.Id == companyId && x.SubscriberId == subscriberId && !x.IsPlatformAccount,
            cancellationToken);

        if (!hasAccess)
        {
            throw new UnauthorizedAccessException();
        }

        return await BuildReadinessAsync(companyId, cancellationToken);
    }

    private async Task<BillingReadinessDto> BuildReadinessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies
            .Include(x => x.InvoiceSettings)
            .FirstOrDefaultAsync(x => x.Id == companyId, cancellationToken);

        if (company is null)
        {
            return BuildMissingCompanyResult();
        }

        var settings = company.InvoiceSettings;
        var items = new List<BillingReadinessItemDto>
        {
            new("company_name", "Company name", "Add the company name shown on invoices.", true, !string.IsNullOrWhiteSpace(company.Name), "/companies"),
            new("registration_no", "Registration number", "Add the legal registration number for the billing entity.", true, !string.IsNullOrWhiteSpace(company.RegistrationNumber), "/companies"),
            new("issuer_email", "Company email", "Add a billing contact email for invoice delivery.", true, !string.IsNullOrWhiteSpace(company.Email), "/companies"),
            new("issuer_phone", "Company phone", "Add a billing contact phone number.", true, !string.IsNullOrWhiteSpace(company.Phone), "/companies"),
            new("issuer_address", "Company address", "Add the billing address shown on invoices.", true, !string.IsNullOrWhiteSpace(company.Address), "/companies"),
            new("invoice_numbering", "Invoice numbering", "Configure invoice numbering before issuing documents.", true, settings is { NextNumber: > 0, Padding: >= 1 } && !string.IsNullOrWhiteSpace(settings.Prefix), "/settings"),
            new("logo", "Logo", "Optional: upload a logo for branded invoices.", false, !string.IsNullOrWhiteSpace(company.LogoPath), "/companies")
        };

        return new BillingReadinessDto(company.Id, items.Where(x => x.Required).All(x => x.Done), items);
    }

    private static BillingReadinessDto BuildMissingCompanyResult() =>
        new(
            null,
            false,
            new[]
            {
                new BillingReadinessItemDto("company", "Create company", "Create your billing entity before issuing invoices or starting subscriptions.", true, false, "/companies")
            });
}
