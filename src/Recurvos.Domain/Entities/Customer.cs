using Recurvos.Domain.Common;

namespace Recurvos.Domain.Entities;

public sealed class Customer : BaseEntity
{
    public Guid SubscriberId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string ExternalReference { get; set; } = string.Empty;
    public string BillingAddress { get; set; } = string.Empty;
    public ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
    public ICollection<CreditNote> CreditNotes { get; set; } = new List<CreditNote>();
    public ICollection<CustomerBalanceTransaction> BalanceTransactions { get; set; } = new List<CustomerBalanceTransaction>();
}
