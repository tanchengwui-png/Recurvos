using Recurvos.Application.ProductPlans;

namespace Recurvos.Application.Companies;

public sealed class CompanyUpsertRequest
{
    public string Name { get; set; } = string.Empty;
    public string RegistrationNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public string? NatureOfBusiness { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed record CompanyLookupDto(
    Guid Id,
    string Name,
    string RegistrationNumber,
    string Email,
    string Phone,
    string Address,
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
    Task<CompanyLookupDto?> UploadLogoAsync(Guid id, Stream content, string fileName, CancellationToken cancellationToken = default);
    Task<CompanyLogoFile?> GetLogoAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ProductPlanDto>> GetRecurringPlansAsync(Guid companyId, CancellationToken cancellationToken = default);
}
