using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class CompanyAddress : BaseEntity
{
    public Guid CompanyId { get; set; }
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string? AddressLine3 { get; set; }
    public string? Postcode { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string Country { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
    public Company? Company { get; set; }
}
