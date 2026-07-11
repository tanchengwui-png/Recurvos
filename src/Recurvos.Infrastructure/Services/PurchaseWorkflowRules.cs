using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;

namespace Recurvos.Infrastructure.Services;

internal static class PurchaseWorkflowRules
{
    internal static void EnsurePurchaseOrderAllowsReceiving(PurchaseOrder purchaseOrder)
    {
        if (purchaseOrder.Status is PurchaseOrderStatus.Closed or PurchaseOrderStatus.Cancelled)
        {
            throw new InvalidOperationException("Closed or cancelled purchase orders cannot be received.");
        }

        if (purchaseOrder.Status is not PurchaseOrderStatus.Approved and not PurchaseOrderStatus.PartiallyReceived)
        {
            throw new InvalidOperationException("Only approved or partially received purchase orders can be received.");
        }
    }

    internal static void EnsurePurchaseOrderAllowsBilling(PurchaseOrder purchaseOrder)
    {
        if (purchaseOrder.Status is PurchaseOrderStatus.Closed or PurchaseOrderStatus.Cancelled)
        {
            throw new InvalidOperationException("Closed or cancelled purchase orders cannot be billed.");
        }

        if (purchaseOrder.Status is not PurchaseOrderStatus.Approved
            and not PurchaseOrderStatus.PartiallyReceived
            and not PurchaseOrderStatus.FullyReceived)
        {
            throw new InvalidOperationException("Only approved or received purchase orders can be billed.");
        }
    }

    internal static void EnsureGoodsReceivedNoteAllowsBilling(GoodsReceivedNote goodsReceivedNote)
    {
        if (goodsReceivedNote.Status == GoodsReceivedNoteStatus.Cancelled)
        {
            throw new InvalidOperationException("Cancelled GRNs cannot be billed.");
        }

        if (goodsReceivedNote.Status is not GoodsReceivedNoteStatus.Received and not GoodsReceivedNoteStatus.PartiallyBilled)
        {
            throw new InvalidOperationException("Only received or partially billed GRNs can be billed.");
        }
    }

    internal static void EnsurePurchaseOrderManualStatusTransition(PurchaseOrderStatus current, PurchaseOrderStatus next)
    {
        if (current == next)
        {
            return;
        }

        if (current is PurchaseOrderStatus.Closed or PurchaseOrderStatus.Cancelled)
        {
            throw new InvalidOperationException("This purchase order status cannot be changed.");
        }

        var valid = current switch
        {
            PurchaseOrderStatus.Draft => next is PurchaseOrderStatus.Sent or PurchaseOrderStatus.Cancelled,
            PurchaseOrderStatus.Sent => next is PurchaseOrderStatus.Approved or PurchaseOrderStatus.Cancelled,
            PurchaseOrderStatus.Approved => next is PurchaseOrderStatus.Closed or PurchaseOrderStatus.Cancelled,
            PurchaseOrderStatus.PartiallyReceived => next == PurchaseOrderStatus.Closed,
            PurchaseOrderStatus.FullyReceived => next == PurchaseOrderStatus.Closed,
            _ => false,
        };

        if (!valid)
        {
            throw new InvalidOperationException("This purchase order status transition is not allowed.");
        }
    }

    internal static void EnsureGoodsReceivedNoteManualStatusTransition(GoodsReceivedNoteStatus current, GoodsReceivedNoteStatus next)
    {
        if (current == next)
        {
            return;
        }

        if (current == GoodsReceivedNoteStatus.Cancelled)
        {
            throw new InvalidOperationException("Cancelled GRNs cannot change status.");
        }

        var valid = current switch
        {
            GoodsReceivedNoteStatus.Draft => next is GoodsReceivedNoteStatus.Received or GoodsReceivedNoteStatus.Cancelled,
            GoodsReceivedNoteStatus.Received => next == GoodsReceivedNoteStatus.Cancelled,
            _ => false,
        };

        if (!valid)
        {
            throw new InvalidOperationException("This GRN status transition is not allowed.");
        }
    }

    internal static PurchaseOrderStatus ResolvePurchaseOrderStatus(PurchaseOrder purchaseOrder, PurchaseOrderStatus fallbackStatus)
    {
        if (purchaseOrder.Status is PurchaseOrderStatus.Closed or PurchaseOrderStatus.Cancelled)
        {
            return purchaseOrder.Status;
        }

        var anyReceived = purchaseOrder.Lines.Any(x => x.ReceivedQuantity > 0m);
        var fullyReceived = purchaseOrder.Lines.Count > 0 && purchaseOrder.Lines.All(x => x.ReceivedQuantity >= x.Quantity);
        var fullyBilled = purchaseOrder.Lines.Count > 0 && purchaseOrder.Lines.All(x => x.BilledQuantity >= x.ReceivedQuantity);

        if (fullyReceived && fullyBilled)
        {
            return PurchaseOrderStatus.Closed;
        }

        if (fullyReceived)
        {
            return PurchaseOrderStatus.FullyReceived;
        }

        if (anyReceived)
        {
            return PurchaseOrderStatus.PartiallyReceived;
        }

        return fallbackStatus;
    }

    internal static GoodsReceivedNoteStatus ResolveGoodsReceivedNoteBillingStatus(GoodsReceivedNote goodsReceivedNote)
    {
        if (goodsReceivedNote.Status == GoodsReceivedNoteStatus.Draft)
        {
            return GoodsReceivedNoteStatus.Draft;
        }

        if (goodsReceivedNote.Status == GoodsReceivedNoteStatus.Cancelled)
        {
            return GoodsReceivedNoteStatus.Cancelled;
        }

        var anyBilled = goodsReceivedNote.Lines.Any(x => x.BilledQuantity > 0m);
        var fullyBilled = goodsReceivedNote.Lines.Count > 0 && goodsReceivedNote.Lines.All(x => x.BilledQuantity >= x.Quantity);

        if (fullyBilled)
        {
            return GoodsReceivedNoteStatus.FullyBilled;
        }

        if (anyBilled)
        {
            return GoodsReceivedNoteStatus.PartiallyBilled;
        }

        return GoodsReceivedNoteStatus.Received;
    }

    internal static PurchaseBillStatus ResolvePurchaseBillStatus(PurchaseBill bill)
    {
        if (bill.Status == PurchaseBillStatus.Cancelled)
        {
            return PurchaseBillStatus.Cancelled;
        }

        if (bill.AmountDue <= 0m)
        {
            return PurchaseBillStatus.Paid;
        }

        if (bill.AmountPaid > 0m)
        {
            return PurchaseBillStatus.PartiallyPaid;
        }

        return bill.DueDateUtc.Date < DateTime.UtcNow.Date ? PurchaseBillStatus.Overdue : PurchaseBillStatus.Issued;
    }
}
