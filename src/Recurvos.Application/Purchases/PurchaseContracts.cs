using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Purchases;

public sealed class PurchaseDocumentLineRequest
{
    public Guid? LineId { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? TaxCodeId { get; set; }

    [Required, MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Quantity { get; set; } = 1;

    [Range(typeof(decimal), "0.00", "9999999999999999")]
    public decimal UnitPrice { get; set; }

    [Range(typeof(decimal), "0.00", "100.00")]
    public decimal TaxRate { get; set; }
}

public sealed class PurchaseOrderListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public PurchaseOrderStatus? Status { get; set; }
}

public sealed class PurchaseOrderUpsertRequest
{
    [Required]
    public Guid? CompanyId { get; set; }

    [Required]
    public Guid ContactId { get; set; }

    [Required]
    public DateTime DocumentDateUtc { get; set; }

    [MaxLength(20)]
    public string Currency { get; set; } = "MYR";

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [MinLength(1)]
    public List<PurchaseDocumentLineRequest> Lines { get; set; } = new();
}

public sealed class PurchaseOrderStatusRequest
{
    public PurchaseOrderStatus Status { get; set; }
}

public sealed class GoodsReceivedNoteLineRequest
{
    public Guid? LineId { get; set; }
    public Guid? PurchaseOrderLineId { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? TaxCodeId { get; set; }
    [MaxLength(1000)] public string Description { get; set; } = string.Empty;
    [Range(typeof(decimal), "0.00", "9999999999999999")] public decimal UnitPrice { get; set; }
    [Range(typeof(decimal), "0.00", "100.00")] public decimal TaxRate { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Quantity { get; set; }
}

public sealed class GoodsReceivedNoteListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public GoodsReceivedNoteStatus? Status { get; set; }
}

public sealed class GoodsReceivedNoteUpsertRequest
{
    [Required]
    public Guid? CompanyId { get; set; }

    public Guid? PurchaseOrderId { get; set; }

    [Required]
    public Guid ContactId { get; set; }

    [MaxLength(20)]
    public string Currency { get; set; } = "MYR";

    [Required]
    public Guid? WarehouseId { get; set; }

    [Required]
    public DateTime DocumentDateUtc { get; set; }

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [MinLength(1)]
    public List<GoodsReceivedNoteLineRequest> Lines { get; set; } = new();
}

public sealed class GoodsReceivedNoteStatusRequest
{
    public GoodsReceivedNoteStatus Status { get; set; }
}

public sealed class PurchaseBillSourceLineRequest
{
    public Guid? PurchaseOrderLineId { get; set; }
    public Guid? GoodsReceivedNoteLineId { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Quantity { get; set; }
}

public sealed class CreatePurchaseBillRequest
{
    [Required]
    public DateTime DueDateUtc { get; set; }

    public Guid? PaymentTermId { get; set; }

    public bool UsePaymentTermDueDate { get; set; } = true;

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [Required, MinLength(1)]
    public List<PurchaseBillSourceLineRequest> Lines { get; set; } = new();
}

public sealed class CreateDirectPurchaseBillRequest
{
    [Required] public Guid? CompanyId { get; set; }
    [Required] public Guid ContactId { get; set; }
    [MaxLength(20)] public string Currency { get; set; } = "MYR";
    [Required] public DateTime DueDateUtc { get; set; }
    public Guid? PaymentTermId { get; set; }
    public bool UsePaymentTermDueDate { get; set; } = true;
    [MaxLength(100)] public string ReferenceNo { get; set; } = string.Empty;
    [MaxLength(4000)] public string Notes { get; set; } = string.Empty;
    [Required, MinLength(1)] public List<PurchaseDocumentLineRequest> DirectLines { get; set; } = new();
}

public sealed record PurchaseSourceDocumentDto(Guid Id, string DocumentNumber, string DocumentType);
public sealed record PurchaseRelatedDocumentDto(Guid Id, string DocumentNumber, string DocumentType, string Status, DateTime DocumentDateUtc, decimal Amount);
public sealed record PurchaseOrderRelatedDocumentsDto(IReadOnlyCollection<PurchaseRelatedDocumentDto> GoodsReceivedNotes, IReadOnlyCollection<PurchaseRelatedDocumentDto> Bills);
public sealed record GoodsReceivedNoteRelatedDocumentsDto(IReadOnlyCollection<PurchaseRelatedDocumentDto> Bills);
public sealed record PurchaseBillRelatedDocumentsDto(IReadOnlyCollection<PurchaseRelatedDocumentDto> Payments);
public sealed record PurchaseBillPaymentSummaryDto(decimal PaymentsMade, decimal RefundsReceived, decimal PurchaseCreditNotes, decimal NetPaid, decimal Outstanding);

public sealed record PurchaseDocumentLineDto(Guid Id, Guid? ProductId, Guid? TaxCodeId, string ProductNameSnapshot, string Description, decimal Quantity, decimal UnitPrice, decimal TaxRate, decimal TaxAmount, decimal LineTotal, Guid? PurchaseOrderLineId, decimal ReceivedQuantity, decimal BilledQuantity);

public sealed record PurchaseOrderListItemDto(Guid Id, Guid CompanyId, string CompanyName, string PurchaseOrderNumber, Guid ContactId, string ContactName, DateTime DocumentDateUtc, string Currency, decimal TotalAmount, PurchaseOrderStatus Status);

public sealed record PurchaseOrderDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string PurchaseOrderNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime DocumentDateUtc, string Currency, string ReferenceNo, string Notes, decimal Subtotal, decimal TaxAmount, decimal TotalAmount, PurchaseOrderStatus Status, IReadOnlyCollection<PurchaseDocumentLineDto> Lines, PurchaseOrderRelatedDocumentsDto RelatedDocuments);

public sealed record GoodsReceivedNoteListItemDto(Guid Id, Guid CompanyId, string CompanyName, string GoodsReceivedNoteNumber, Guid? PurchaseOrderId, string PurchaseOrderNumber, Guid ContactId, string ContactName, DateTime DocumentDateUtc, string Currency, decimal TotalAmount, GoodsReceivedNoteStatus Status, bool HasPurchaseBills, bool CanCreateBill);

public sealed record GoodsReceivedNoteDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string GoodsReceivedNoteNumber, Guid? PurchaseOrderId, string PurchaseOrderNumber, Guid? WarehouseId, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, Guid? CreatedFromDocumentId, string CreatedFromDocumentNumber, string CreatedFromDocumentType, DateTime DocumentDateUtc, string Currency, string ReferenceNo, string Notes, decimal Subtotal, decimal TaxAmount, decimal TotalAmount, GoodsReceivedNoteStatus Status, IReadOnlyCollection<PurchaseDocumentLineDto> Lines, GoodsReceivedNoteRelatedDocumentsDto RelatedDocuments);

public sealed record PurchaseBillLineDto(Guid Id, Guid? PurchaseOrderLineId, Guid? GoodsReceivedNoteLineId, Guid? ProductId, Guid? TaxCodeId, string ProductNameSnapshot, string Description, decimal Quantity, decimal UnitPrice, decimal TaxRate, decimal TaxAmount, decimal LineTotal);

public sealed record PurchaseBillListItemDto(Guid Id, Guid CompanyId, string CompanyName, string PurchaseBillNumber, Guid ContactId, string ContactName, DateTime IssueDateUtc, DateTime DueDateUtc, string Currency, decimal TotalAmount, decimal AmountDue, PurchaseBillStatus Status);

public sealed record PurchaseBillDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string PurchaseBillNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, Guid? PurchaseOrderId, Guid? GoodsReceivedNoteId, Guid? CreatedFromDocumentId, string CreatedFromDocumentNumber, string CreatedFromDocumentType, DateTime IssueDateUtc, DateTime DueDateUtc, string Currency, string ReferenceNo, string Notes, decimal Subtotal, decimal TaxAmount, decimal TotalAmount, decimal AmountDue, decimal AmountPaid, PurchaseBillStatus Status, IReadOnlyCollection<PurchaseBillLineDto> Lines, PurchaseBillRelatedDocumentsDto RelatedDocuments, PurchaseBillPaymentSummaryDto PaymentSummary);

public sealed class PurchasePaymentAllocationRequest
{
    [Required]
    public Guid PurchaseBillId { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Amount { get; set; }
}

public sealed class CreatePurchasePaymentRequest
{
    [Required]
    public DateTime PaymentDateUtc { get; set; }

    [MaxLength(20)]
    public string Currency { get; set; } = "MYR";

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [Required, MinLength(1)]
    public List<PurchasePaymentAllocationRequest> Allocations { get; set; } = new();
}

public sealed record PurchasePaymentAllocationDto(Guid Id, Guid PurchaseBillId, string PurchaseBillNumber, decimal Amount, decimal RefundedAmount);

public sealed record PurchasePaymentRefundSummaryDto(Guid Id, string PurchaseRefundNumber, DateTime RefundDateUtc, decimal TotalAmount, PurchaseRefundStatus Status);

public sealed record PurchasePaymentListItemDto(Guid Id, Guid CompanyId, string CompanyName, string PurchasePaymentNumber, Guid ContactId, string ContactName, DateTime PaymentDateUtc, string Currency, decimal TotalAmount, decimal RefundedAmount, PurchasePaymentStatus Status);

public sealed record PurchasePaymentDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string PurchasePaymentNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime PaymentDateUtc, string Currency, string ReferenceNo, string Notes, decimal TotalAmount, decimal RefundedAmount, PurchasePaymentStatus Status, IReadOnlyCollection<PurchasePaymentAllocationDto> Allocations, IReadOnlyCollection<PurchasePaymentRefundSummaryDto> Refunds);

public sealed class CreatePurchaseCreditNoteLineRequest
{
    public Guid? PurchaseBillLineId { get; set; }

    [Required, MaxLength(250)]
    public string Description { get; set; } = string.Empty;

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Quantity { get; set; } = 1;

    [Range(typeof(decimal), "0.00", "9999999999999999")]
    public decimal UnitAmount { get; set; }

    [Range(typeof(decimal), "0.00", "9999999999999999")]
    public decimal TaxAmount { get; set; }
}

public sealed class CreatePurchaseCreditNoteRequest
{
    [Required]
    public Guid PurchaseBillId { get; set; }

    [Required, MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;

    [Required]
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;

    [Required, MinLength(1)]
    public List<CreatePurchaseCreditNoteLineRequest> Lines { get; set; } = new();
}

public sealed record PurchaseCreditNoteLineDto(Guid Id, Guid? PurchaseBillLineId, string Description, decimal Quantity, decimal UnitAmount, decimal TaxAmount, decimal LineTotal);

public sealed record PurchaseCreditNoteListItemDto(Guid Id, Guid CompanyId, string CompanyName, Guid PurchaseBillId, string PurchaseBillNumber, string PurchaseCreditNoteNumber, Guid ContactId, string ContactName, DateTime IssuedAtUtc, string Currency, decimal TotalReduction, PurchaseCreditNoteStatus Status);

public sealed record PurchaseCreditNoteDetailsDto(Guid Id, Guid CompanyId, string CompanyName, Guid PurchaseBillId, string PurchaseBillNumber, string PurchaseCreditNoteNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime IssuedAtUtc, string Currency, decimal SubtotalReduction, decimal TaxReduction, decimal TotalReduction, string Reason, PurchaseCreditNoteStatus Status, IReadOnlyCollection<PurchaseCreditNoteLineDto> Lines);

public sealed class CreatePurchaseRefundAllocationRequest
{
    [Required]
    public Guid PurchasePaymentAllocationId { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Amount { get; set; }
}

public sealed class CreatePurchaseRefundRequest
{
    [Required]
    public DateTime RefundDateUtc { get; set; } = DateTime.UtcNow;

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [Required, MinLength(1)]
    public List<CreatePurchaseRefundAllocationRequest> Allocations { get; set; } = new();
}

public sealed record PurchaseRefundAllocationDto(Guid Id, Guid PurchasePaymentAllocationId, Guid PurchaseBillId, string PurchaseBillNumber, decimal Amount);

public sealed record PurchaseRefundListItemDto(Guid Id, Guid CompanyId, string CompanyName, Guid PurchasePaymentId, string PurchasePaymentNumber, string PurchaseRefundNumber, Guid ContactId, string ContactName, DateTime RefundDateUtc, string Currency, decimal TotalAmount, PurchaseRefundStatus Status);

public sealed record PurchaseRefundDetailsDto(Guid Id, Guid CompanyId, string CompanyName, Guid PurchasePaymentId, string PurchasePaymentNumber, string PurchaseRefundNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime RefundDateUtc, string Currency, string ReferenceNo, string Notes, decimal TotalAmount, PurchaseRefundStatus Status, IReadOnlyCollection<PurchaseRefundAllocationDto> Allocations);

public interface IPurchaseOrderService
{
    Task<IReadOnlyCollection<PurchaseOrderListItemDto>> GetAsync(PurchaseOrderListQuery query, CancellationToken cancellationToken = default);
    Task<PurchaseOrderDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PurchaseOrderDetailsDto> CreateAsync(PurchaseOrderUpsertRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseOrderDetailsDto?> UpdateAsync(Guid id, PurchaseOrderUpsertRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseOrderDetailsDto?> SetStatusAsync(Guid id, PurchaseOrderStatusRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IGoodsReceivedNoteService
{
    Task<IReadOnlyCollection<GoodsReceivedNoteListItemDto>> GetAsync(GoodsReceivedNoteListQuery query, CancellationToken cancellationToken = default);
    Task<GoodsReceivedNoteDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<GoodsReceivedNoteDetailsDto> CreateAsync(GoodsReceivedNoteUpsertRequest request, CancellationToken cancellationToken = default);
    Task<GoodsReceivedNoteDetailsDto?> UpdateAsync(Guid id, GoodsReceivedNoteUpsertRequest request, CancellationToken cancellationToken = default);
    Task<GoodsReceivedNoteDetailsDto?> SetStatusAsync(Guid id, GoodsReceivedNoteStatusRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IPurchaseBillService
{
    Task<IReadOnlyCollection<PurchaseBillListItemDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<PurchaseBillDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PurchaseBillDetailsDto> CreateDirectAsync(CreateDirectPurchaseBillRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseBillDetailsDto?> CreateFromPurchaseOrderAsync(Guid purchaseOrderId, CreatePurchaseBillRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseBillDetailsDto?> CreateFromGoodsReceivedNoteAsync(Guid goodsReceivedNoteId, CreatePurchaseBillRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseBillDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IPurchasePaymentService
{
    Task<IReadOnlyCollection<PurchasePaymentListItemDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<PurchasePaymentDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PurchasePaymentDetailsDto> CreateAsync(CreatePurchasePaymentRequest request, CancellationToken cancellationToken = default);
    Task<PurchasePaymentDetailsDto?> ReverseAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IPurchaseCreditNoteService
{
    Task<IReadOnlyCollection<PurchaseCreditNoteListItemDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<PurchaseCreditNoteDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PurchaseCreditNoteDetailsDto> CreateAsync(CreatePurchaseCreditNoteRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseCreditNoteDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IPurchaseRefundService
{
    Task<IReadOnlyCollection<PurchaseRefundListItemDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<PurchaseRefundDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PurchaseRefundDetailsDto?> CreateAsync(Guid purchasePaymentId, CreatePurchaseRefundRequest request, CancellationToken cancellationToken = default);
    Task<PurchaseRefundDetailsDto?> CancelAsync(Guid id, CancellationToken cancellationToken = default);
}
