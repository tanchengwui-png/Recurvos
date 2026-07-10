using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Customers;

public sealed class CustomerContactPersonInput
{
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Role { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(50)]
    public string PhoneNumber { get; set; } = string.Empty;
}

public sealed class CustomerAddressInput
{
    [MaxLength(150)]
    public string AddressName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string StreetAddress { get; set; } = string.Empty;

    [MaxLength(500)]
    public string AddressLine2 { get; set; } = string.Empty;

    [MaxLength(500)]
    public string AddressLine3 { get; set; } = string.Empty;

    [MaxLength(150)]
    public string City { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Postcode { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Country { get; set; } = string.Empty;

    [MaxLength(150)]
    public string State { get; set; } = string.Empty;

    public bool IsDefaultBilling { get; set; }
    public bool IsDefaultShipping { get; set; }
}

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

    [MaxLength(50)]
    public string EntityType { get; set; } = "Company";

    [MaxLength(200)]
    public string LegalName { get; set; } = string.Empty;

    [MaxLength(200)]
    public string OtherName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string RegistrationNumberType { get; set; } = string.Empty;

    [MaxLength(100)]
    public string RegistrationNumber { get; set; } = string.Empty;

    [MaxLength(100)]
    public string OldRegistrationNumber { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Tin { get; set; } = string.Empty;

    [MaxLength(100)]
    public string SstRegistrationNumber { get; set; } = string.Empty;

    [MaxLength(30)]
    public string ContactType { get; set; } = "Customer";

    [MaxLength(30)]
    public string Status { get; set; } = "Active";

    public IReadOnlyCollection<CustomerContactPersonInput> ContactPersons { get; set; } = Array.Empty<CustomerContactPersonInput>();
    public IReadOnlyCollection<string> PhoneNumbers { get; set; } = Array.Empty<string>();
    public IReadOnlyCollection<string> EmailAddresses { get; set; } = Array.Empty<string>();
    public IReadOnlyCollection<CustomerAddressInput> Addresses { get; set; } = Array.Empty<CustomerAddressInput>();

    [MaxLength(100)]
    public string ReceivableAccount { get; set; } = string.Empty;

    public decimal? CreditLimit { get; set; }

    [MaxLength(100)]
    public string PayableAccount { get; set; } = string.Empty;

    public IReadOnlyCollection<string> Groups { get; set; } = Array.Empty<string>();

    [MaxLength(100)]
    public string PriceLevel { get; set; } = string.Empty;

    [MaxLength(20)]
    public string Currency { get; set; } = string.Empty;

    [MaxLength(100)]
    public string PaymentTerm { get; set; } = string.Empty;

    [MaxLength(100)]
    public string IncomeAccount { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ExpenseAccount { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Location { get; set; } = string.Empty;

    public IReadOnlyCollection<string> Tags { get; set; } = Array.Empty<string>();

    [MaxLength(100)]
    public string MyInvoisControl { get; set; } = string.Empty;
}

public sealed class CustomerDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string ExternalReference { get; set; } = string.Empty;
    public string BillingAddress { get; set; } = string.Empty;
    public string EntityType { get; set; } = "Company";
    public string LegalName { get; set; } = string.Empty;
    public string OtherName { get; set; } = string.Empty;
    public string RegistrationNumberType { get; set; } = string.Empty;
    public string RegistrationNumber { get; set; } = string.Empty;
    public string OldRegistrationNumber { get; set; } = string.Empty;
    public string Tin { get; set; } = string.Empty;
    public string SstRegistrationNumber { get; set; } = string.Empty;
    public string ContactType { get; set; } = "Customer";
    public string Status { get; set; } = "Active";
    public IReadOnlyCollection<CustomerContactPersonInput> ContactPersons { get; set; } = Array.Empty<CustomerContactPersonInput>();
    public IReadOnlyCollection<string> PhoneNumbers { get; set; } = Array.Empty<string>();
    public IReadOnlyCollection<string> EmailAddresses { get; set; } = Array.Empty<string>();
    public IReadOnlyCollection<CustomerAddressInput> Addresses { get; set; } = Array.Empty<CustomerAddressInput>();
    public string ReceivableAccount { get; set; } = string.Empty;
    public decimal? CreditLimit { get; set; }
    public string PayableAccount { get; set; } = string.Empty;
    public IReadOnlyCollection<string> Groups { get; set; } = Array.Empty<string>();
    public string PriceLevel { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string PaymentTerm { get; set; } = string.Empty;
    public string IncomeAccount { get; set; } = string.Empty;
    public string ExpenseAccount { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public IReadOnlyCollection<string> Tags { get; set; } = Array.Empty<string>();
    public string MyInvoisControl { get; set; } = string.Empty;
}

public interface ICustomerService
{
    Task<IReadOnlyCollection<CustomerDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<CustomerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<CustomerDto> CreateAsync(CustomerRequest request, CancellationToken cancellationToken = default);
    Task<CustomerDto?> UpdateAsync(Guid id, CustomerRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
