using System.ComponentModel.DataAnnotations;
using Recurvos.Domain.Enums;

namespace Recurvos.Application.Sales;

public sealed class SalesDocumentLineRequest
{
    // The persisted line being amended.  Keeping this identity is essential when
    // checking quantities already consumed by child documents.
    public Guid? LineId { get; set; }
    // Set only when updating an order that was converted from a quotation.
    // This preserves the direct document-chain relationship used for capacity checks.
    public Guid? SourceQuotationLineId { get; set; }
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

public sealed class DeliveryOrderLineRequest
{
    public Guid? LineId { get; set; }
    public Guid? SalesOrderLineId { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? TaxCodeId { get; set; }
    [MaxLength(1000)] public string Description { get; set; } = string.Empty;
    [Range(typeof(decimal), "0.00", "9999999999999999")] public decimal UnitPrice { get; set; }
    [Range(typeof(decimal), "0.00", "100.00")] public decimal TaxRate { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Quantity { get; set; }
}

public sealed class SalesQuotationListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public SalesQuotationStatus? Status { get; set; }
}

public sealed class SalesQuotationUpsertRequest
{
    [Required]
    public Guid? CompanyId { get; set; }

    [Required]
    public Guid ContactId { get; set; }

    [Required]
    public DateTime DocumentDateUtc { get; set; }

    public DateTime? ExpiryDateUtc { get; set; }

    [MaxLength(20)]
    public string Currency { get; set; } = "MYR";

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [MinLength(1)]
    public List<SalesDocumentLineRequest> Lines { get; set; } = new();
}

public sealed class SalesQuotationStatusRequest
{
    public SalesQuotationStatus Status { get; set; }
}

public sealed class ConvertQuotationToSalesOrderRequest
{
    [Required]
    public DateTime DocumentDateUtc { get; set; }

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [MinLength(1)]
    public List<ConvertQuotationLineRequest> Lines { get; set; } = new();
}

public sealed class ConvertQuotationLineRequest
{
    [Required]
    public Guid SalesQuotationLineId { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999")]
    public decimal Quantity { get; set; }
}

public sealed class ConvertQuotationToDeliveryOrderRequest
{
    [Required]
    public Guid WarehouseId { get; set; }

    [Required]
    public DateTime DocumentDateUtc { get; set; }

    [MaxLength(100)]
    public string ReferenceNo { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string Notes { get; set; } = string.Empty;

    [MinLength(1)]
    public List<ConvertQuotationLineRequest> Lines { get; set; } = new();
}

public sealed record SalesDocumentLineDto(Guid Id, Guid? ProductId, Guid? TaxCodeId, string ProductNameSnapshot, string Description, decimal Quantity, decimal UnitPrice, decimal TaxRate, decimal TaxAmount, decimal LineTotal, Guid? SourceQuotationLineId, Guid? SalesOrderLineId, decimal DeliveredQuantity, decimal InvoicedQuantity, decimal ConvertedQuantity = 0, decimal RemainingQuantity = 0);

public sealed record SalesOrderLinkDto(Guid Id, string SalesOrderNumber, DateTime DocumentDateUtc, SalesOrderStatus Status, decimal TotalAmount, string Currency);

public sealed record SalesQuotationListItemDto(Guid Id, Guid CompanyId, string CompanyName, string QuotationNumber, Guid ContactId, string ContactName, DateTime DocumentDateUtc, DateTime? ExpiryDateUtc, string Currency, decimal TotalAmount, SalesQuotationStatus Status, SalesQuotationConversionStatus ConversionStatus, bool IsTransactionallyLocked, Guid? ConvertedSalesOrderId);

public sealed record SalesQuotationDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string QuotationNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime DocumentDateUtc, DateTime? ExpiryDateUtc, string Currency, string ReferenceNo, string Notes, decimal Subtotal, decimal TaxAmount, decimal TotalAmount, SalesQuotationStatus Status, SalesQuotationConversionStatus ConversionStatus, bool IsTransactionallyLocked, Guid? ConvertedSalesOrderId, IReadOnlyCollection<SalesDocumentLineDto> Lines, IReadOnlyCollection<SalesOrderLinkDto> SalesOrders);

public sealed class SalesOrderListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public SalesOrderStatus? Status { get; set; }
}

public sealed class SalesOrderUpsertRequest
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

    public Guid? SalesQuotationId { get; set; }

    [MinLength(1)]
    public List<SalesDocumentLineRequest> Lines { get; set; } = new();
}

public sealed class SalesOrderStatusRequest
{
    public SalesOrderStatus Status { get; set; }
}

public sealed class DeliveryOrderListQuery
{
    public string? Search { get; set; }
    public Guid? CompanyId { get; set; }
    public DeliveryOrderStatus? Status { get; set; }
}

public sealed class DeliveryOrderUpsertRequest
{
    [Required]
    public Guid? CompanyId { get; set; }

    [Required]
    public Guid? SalesOrderId { get; set; }

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
    public List<DeliveryOrderLineRequest> Lines { get; set; } = new();
}

public sealed class DeliveryOrderStatusRequest
{
    public DeliveryOrderStatus Status { get; set; }
}

public sealed record SalesOrderListItemDto(Guid Id, Guid CompanyId, string CompanyName, string SalesOrderNumber, Guid ContactId, string ContactName, DateTime DocumentDateUtc, string Currency, decimal TotalAmount, SalesOrderStatus Status, bool HasDirectInvoiceableQuantity, bool HasOutstandingQuantity, Guid? SalesQuotationId);

public sealed record SalesInvoiceLinkDto(Guid Id, string InvoiceNumber, DateTime IssueDateUtc, InvoiceStatus Status, decimal TotalAmount, string Currency, Guid? DeliveryOrderId);

public sealed record SalesOrderDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string SalesOrderNumber, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime DocumentDateUtc, string Currency, string ReferenceNo, string Notes, decimal Subtotal, decimal TaxAmount, decimal TotalAmount, SalesOrderStatus Status, Guid? SalesQuotationId, IReadOnlyCollection<SalesDocumentLineDto> Lines, IReadOnlyCollection<SalesInvoiceLinkDto>? Invoices = null);

public sealed record DeliveryOrderListItemDto(Guid Id, Guid CompanyId, string CompanyName, string DeliveryOrderNumber, Guid? SalesOrderId, Guid? SalesQuotationId, string SalesOrderNumber, Guid ContactId, string ContactName, DateTime DocumentDateUtc, string Currency, decimal TotalAmount, DeliveryOrderStatus Status, bool HasInvoiceableQuantity);

public sealed record DeliveryOrderDetailsDto(Guid Id, Guid CompanyId, string CompanyName, string DeliveryOrderNumber, Guid? SalesOrderId, Guid? SalesQuotationId, string SalesOrderNumber, Guid? WarehouseId, Guid ContactId, string ContactName, string ContactEmail, string ContactPhoneNumber, DateTime DocumentDateUtc, string Currency, string ReferenceNo, string Notes, decimal Subtotal, decimal TaxAmount, decimal TotalAmount, DeliveryOrderStatus Status, IReadOnlyCollection<SalesDocumentLineDto> Lines, IReadOnlyCollection<SalesInvoiceLinkDto>? Invoices = null);

public interface ISalesQuotationService
{
    Task<IReadOnlyCollection<SalesQuotationListItemDto>> GetAsync(SalesQuotationListQuery query, CancellationToken cancellationToken = default);
    Task<SalesQuotationDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<SalesQuotationDetailsDto> CreateAsync(SalesQuotationUpsertRequest request, CancellationToken cancellationToken = default);
    Task<SalesQuotationDetailsDto?> UpdateAsync(Guid id, SalesQuotationUpsertRequest request, CancellationToken cancellationToken = default);
    Task<SalesQuotationDetailsDto?> SetStatusAsync(Guid id, SalesQuotationStatusRequest request, CancellationToken cancellationToken = default);
    Task<SalesOrderDetailsDto?> ConvertToSalesOrderAsync(Guid id, ConvertQuotationToSalesOrderRequest request, CancellationToken cancellationToken = default);
    Task<DeliveryOrderDetailsDto?> ConvertToDeliveryOrderAsync(Guid id, ConvertQuotationToDeliveryOrderRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface ISalesOrderService
{
    Task<IReadOnlyCollection<SalesOrderListItemDto>> GetAsync(SalesOrderListQuery query, CancellationToken cancellationToken = default);
    Task<SalesOrderDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<SalesOrderDetailsDto> CreateAsync(SalesOrderUpsertRequest request, CancellationToken cancellationToken = default);
    Task<SalesOrderDetailsDto?> UpdateAsync(Guid id, SalesOrderUpsertRequest request, CancellationToken cancellationToken = default);
    Task<SalesOrderDetailsDto?> SetStatusAsync(Guid id, SalesOrderStatusRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IDeliveryOrderService
{
    Task<IReadOnlyCollection<DeliveryOrderListItemDto>> GetAsync(DeliveryOrderListQuery query, CancellationToken cancellationToken = default);
    Task<DeliveryOrderDetailsDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<DeliveryOrderDetailsDto> CreateAsync(DeliveryOrderUpsertRequest request, CancellationToken cancellationToken = default);
    Task<DeliveryOrderDetailsDto?> UpdateAsync(Guid id, DeliveryOrderUpsertRequest request, CancellationToken cancellationToken = default);
    Task<DeliveryOrderDetailsDto?> SetStatusAsync(Guid id, DeliveryOrderStatusRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
