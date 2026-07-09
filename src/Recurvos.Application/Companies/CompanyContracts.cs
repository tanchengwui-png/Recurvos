using Recurvos.Application.ProductPlans;

namespace Recurvos.Application.Companies;

public sealed class CompanyUpsertRequest
{
    public string Name { get; set; } = string.Empty;
    public string? LegalName { get; set; }
    public string? RegistrationNumberType { get; set; }
    public string RegistrationNumber { get; set; } = string.Empty;
    public string? OldRegistrationNumber { get; set; }
    public string? Tin { get; set; }
    public string? MsicCode { get; set; }
    public string? TourismTaxRegistrationNumber { get; set; }
    public string? HomeCountry { get; set; }
    public string HomeCurrency { get; set; } = "MYR";
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public string? NatureOfBusiness { get; set; }
    public bool IsActive { get; set; } = true;
    public List<CompanyAddressUpsertRequest> Addresses { get; set; } = new();
}

public sealed class CompanyFactoryResetRequest
{
    public string ConfirmationText { get; set; } = string.Empty;
}

public sealed class CompanyAddressUpsertRequest
{
    public Guid? Id { get; set; }
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string? AddressLine3 { get; set; }
    public string? Postcode { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string Country { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
    public bool IsDefaultBilling { get; set; }
    public bool IsDefaultShipping { get; set; }
}

public sealed record CompanyAddressDto(
    Guid Id,
    string AddressLine1,
    string? AddressLine2,
    string? AddressLine3,
    string? Postcode,
    string? City,
    string? State,
    string Country,
    bool IsDefault,
    bool IsDefaultBilling,
    bool IsDefaultShipping);

public sealed record CompanyLookupDto(
    Guid Id,
    string Name,
    string? LegalName,
    string? RegistrationNumberType,
    string RegistrationNumber,
    string? OldRegistrationNumber,
    string? Tin,
    string? MsicCode,
    string? TourismTaxRegistrationNumber,
    string? HomeCountry,
    string HomeCurrency,
    string Email,
    string Phone,
    string Address,
    IReadOnlyCollection<CompanyAddressDto> Addresses,
    string? Industry,
    string? NatureOfBusiness,
    bool IsActive,
    bool HasLogo);

public sealed record CompanyLogoFile(string FileName, byte[] Content, string ContentType);

public interface ICompanyService
{
    Task<IReadOnlyCollection<CompanyLookupDto>> GetOwnedAsync(CancellationToken cancellationToken = default);
    Task<CompanyLookupDto> CreateAsync(CompanyUpsertRequest request, CancellationToken cancellationToken = default);
    Task<CompanyLookupDto?> UpdateAsync(Guid id, CompanyUpsertRequest request, CancellationToken cancellationToken = default);
    Task FactoryResetAsync(Guid id, CompanyFactoryResetRequest request, CancellationToken cancellationToken = default);
    Task<CompanyLookupDto?> UploadLogoAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default);
    Task<CompanyLookupDto?> RemoveLogoAsync(Guid id, CancellationToken cancellationToken = default);
    Task<CompanyLogoFile?> GetLogoAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ProductPlanDto>> GetRecurringPlansAsync(Guid companyId, CancellationToken cancellationToken = default);
}
