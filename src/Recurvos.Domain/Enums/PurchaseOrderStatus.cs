namespace Recurvos.Domain.Enums;

public enum PurchaseOrderStatus
{
    Draft = 1,
    Sent = 2,
    Approved = 3,
    PartiallyReceived = 4,
    FullyReceived = 5,
    Closed = 6,
    Cancelled = 7
}
