using Recurvos.Application.ProductPlans;
using System.Text.Json.Serialization;

namespace Recurvos.Application.Companies;

public sealed class CompanyUpsertRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    [JsonPropertyName("legalName")]
    public string? LegalName { get; set; }
    [JsonPropertyName("registrationNumberType")]
    public string? RegistrationNumberType { get; set; }
    [JsonPropertyName("registrationNumber")]
    public string RegistrationNumber { get; set; } = string.Empty;
    [JsonPropertyName("oldRegistrationNumber")]
    public string? OldRegistrationNumber { get; set; }
    [JsonPropertyName("tin")]
    public string? Tin { get; set; }
    [JsonPropertyName("msicCode")]
    public string? MsicCode { get; set; }
    [JsonPropertyName("tourismTaxRegistrationNumber")]
    public string? TourismTaxRegistrationNumber { get; set; }
    [JsonPropertyName("homeCountry")]
    public string? HomeCountry { get; set; }
    [JsonPropertyName("homeCurrency")]
    public string HomeCurrency { get; set; } = "MYR";
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;
    [JsonPropertyName("phone")]
    public string Phone { get; set; } = string.Empty;
    [JsonPropertyName("address")]
    public string Address { get; set; } = string.Empty;
    [JsonPropertyName("industry")]
    public string? Industry { get; set; }
    [JsonPropertyName("natureOfBusiness")]
    public string? NatureOfBusiness { get; set; }
    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;
    [JsonPropertyName("addresses")]
    public List<CompanyAddressUpsertRequest> Addresses { get; set; } = new();
}

public sealed class CompanyFactoryResetRequest
{
    public string ConfirmationText { get; set; } = string.Empty;
}

public sealed class CompanyAddressUpsertRequest
{
    [JsonPropertyName("id")]
    public Guid? Id { get; set; }
    [JsonPropertyName("addressName")]
    public string AddressName { get; set; } = string.Empty;
    [JsonPropertyName("addressLine1")]
    public string AddressLine1 { get; set; } = string.Empty;
    [JsonPropertyName("addressLine2")]
    public string? AddressLine2 { get; set; }
    [JsonPropertyName("addressLine3")]
    public string? AddressLine3 { get; set; }
    [JsonPropertyName("postcode")]
    public string? Postcode { get; set; }
    [JsonPropertyName("city")]
    public string? City { get; set; }
    [JsonPropertyName("state")]
    public string? State { get; set; }
    [JsonPropertyName("country")]
    public string Country { get; set; } = string.Empty;
    [JsonPropertyName("isDefault")]
    public bool IsDefault { get; set; }
    [JsonPropertyName("isDefaultBilling")]
    public bool IsDefaultBilling { get; set; }
    [JsonPropertyName("isDefaultShipping")]
    public bool IsDefaultShipping { get; set; }
}

public sealed record CompanyAddressDto(
    Guid Id,
    string AddressName,
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
