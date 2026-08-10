using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class Customer : BaseEntity
{
    public Guid SubscriberId { get; set; }
    public string CompanyIdsJson { get; set; } = "[]";
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
    public string ContactPersonsJson { get; set; } = "[]";
    public string PhoneNumbersJson { get; set; } = "[]";
    public string EmailAddressesJson { get; set; } = "[]";
    public string AddressesJson { get; set; } = "[]";
    public Guid? ReceivableAccountId { get; set; }
    public string ReceivableAccount { get; set; } = string.Empty;
    public decimal? CreditLimit { get; set; }
    public Guid? PayableAccountId { get; set; }
    public string PayableAccount { get; set; } = string.Empty;
    public string GroupsJson { get; set; } = "[]";
    public string PriceLevel { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string PaymentTerm { get; set; } = string.Empty;
    public Guid? IncomeAccountId { get; set; }
    public string IncomeAccount { get; set; } = string.Empty;
    public Guid? ExpenseAccountId { get; set; }
    public string ExpenseAccount { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string TagsJson { get; set; } = "[]";
    public string MyInvoisControl { get; set; } = string.Empty;
    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
    public ICollection<CreditNote> CreditNotes { get; set; } = new List<CreditNote>();
    public ICollection<CustomerBalanceTransaction> BalanceTransactions { get; set; } = new List<CustomerBalanceTransaction>();
}
