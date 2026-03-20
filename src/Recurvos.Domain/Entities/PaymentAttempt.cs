using Recurvos.Domain.Common;
using Recurvos.Domain.Enums;

namespace Recurvos.Domain.Entities;

public sealed class PaymentAttempt : CompanyOwnedEntity
{
    public Guid PaymentId { get; set; }
    public PaymentStatus Status { get; set; }
    public int AttemptNumber { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }
    public string? RawResponse { get; set; }
    public Payment? Payment { get; set; }
}
