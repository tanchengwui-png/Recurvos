using Recurvos.Domain.Entities;

namespace Recurvos.Infrastructure.Services;

internal static class PlatformIssuerProfileResolver
{
    internal sealed record PlatformIssuerProfile(
        string CompanyName,
        string RegistrationNumber,
        string BillingEmail,
        string? Phone,
        string? Address);

    public static PlatformIssuerProfile Resolve(Company company, CompanyInvoiceSettings? settings)
    {
        if (!company.IsPlatformAccount || settings?.UseProductionPlatformSettings != true)
        {
            return new PlatformIssuerProfile(
                company.Name,
                company.RegistrationNumber,
                company.Email,
                string.IsNullOrWhiteSpace(company.Phone) ? null : company.Phone,
                string.IsNullOrWhiteSpace(company.Address) ? null : company.Address);
        }

        return new PlatformIssuerProfile(
            string.IsNullOrWhiteSpace(settings.ProductionIssuerCompanyName) ? company.Name : settings.ProductionIssuerCompanyName,
            string.IsNullOrWhiteSpace(settings.ProductionIssuerRegistrationNumber) ? company.RegistrationNumber : settings.ProductionIssuerRegistrationNumber,
            string.IsNullOrWhiteSpace(settings.ProductionIssuerBillingEmail) ? company.Email : settings.ProductionIssuerBillingEmail,
            string.IsNullOrWhiteSpace(settings.ProductionIssuerPhone) ? company.Phone : settings.ProductionIssuerPhone,
            string.IsNullOrWhiteSpace(settings.ProductionIssuerAddress) ? company.Address : settings.ProductionIssuerAddress);
    }
}
