using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Customers;

public sealed class CustomerRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [MaxLength(50)]
    public string PhoneNumber { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ExternalReference { get; set; } = string.Empty;

    [MaxLength(500)]
    public string BillingAddress { get; set; } = string.Empty;
}

public sealed record CustomerDto(Guid Id, string Name, string Email, string PhoneNumber, string ExternalReference, string BillingAddress);

public interface ICustomerService
{
    Task<IReadOnlyCollection<CustomerDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<CustomerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<CustomerDto> CreateAsync(CustomerRequest request, CancellationToken cancellationToken = default);
    Task<CustomerDto?> UpdateAsync(Guid id, CustomerRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
