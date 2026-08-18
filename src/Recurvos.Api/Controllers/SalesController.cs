using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Invoices;
using Recurvos.Application.Sales;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/sales")]
public sealed class SalesController(ISalesQuotationService salesQuotationService, ISalesOrderService salesOrderService, IDeliveryOrderService deliveryOrderService, IInvoiceService invoiceService) : ControllerBase
{
    [HttpGet("quotations")]
    public async Task<ActionResult<IReadOnlyCollection<SalesQuotationListItemDto>>> GetQuotations([FromQuery] SalesQuotationListQuery query, CancellationToken cancellationToken) =>
        Ok(await salesQuotationService.GetAsync(query, cancellationToken));

    [HttpGet("quotations/{id:guid}")]
    public async Task<ActionResult<SalesQuotationDetailsDto>> GetQuotation(Guid id, CancellationToken cancellationToken)
    {
        var result = await salesQuotationService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("quotations")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesQuotationDetailsDto>> CreateQuotation(SalesQuotationUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await salesQuotationService.CreateAsync(request, cancellationToken));

    [HttpPut("quotations/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesQuotationDetailsDto>> UpdateQuotation(Guid id, SalesQuotationUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await salesQuotationService.UpdateAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("quotations/{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesQuotationDetailsDto>> SetQuotationStatus(Guid id, SalesQuotationStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await salesQuotationService.SetStatusAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("quotations/{id:guid}/convert-to-sales-order")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesOrderDetailsDto>> ConvertQuotationToSalesOrder(Guid id, ConvertQuotationToSalesOrderRequest request, CancellationToken cancellationToken)
    {
        var result = await salesQuotationService.ConvertToSalesOrderAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("quotations/{id:guid}/convert-to-delivery-order")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<DeliveryOrderDetailsDto>> ConvertQuotationToDeliveryOrder(Guid id, ConvertQuotationToDeliveryOrderRequest request, CancellationToken cancellationToken)
    {
        var result = await salesQuotationService.ConvertToDeliveryOrderAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("quotations/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteQuotation(Guid id, CancellationToken cancellationToken) =>
        await salesQuotationService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("orders")]
    public async Task<ActionResult<IReadOnlyCollection<SalesOrderListItemDto>>> GetOrders([FromQuery] SalesOrderListQuery query, CancellationToken cancellationToken) =>
        Ok(await salesOrderService.GetAsync(query, cancellationToken));

    [HttpGet("orders/{id:guid}")]
    public async Task<ActionResult<SalesOrderDetailsDto>> GetOrder(Guid id, CancellationToken cancellationToken)
    {
        var result = await salesOrderService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("orders")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesOrderDetailsDto>> CreateOrder(SalesOrderUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await salesOrderService.CreateAsync(request, cancellationToken));

    [HttpPut("orders/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesOrderDetailsDto>> UpdateOrder(Guid id, SalesOrderUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await salesOrderService.UpdateAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("orders/{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SalesOrderDetailsDto>> SetOrderStatus(Guid id, SalesOrderStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await salesOrderService.SetStatusAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("orders/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteOrder(Guid id, CancellationToken cancellationToken) =>
        await salesOrderService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("orders/{id:guid}/convert-to-invoice")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> ConvertOrderToInvoice(Guid id, CreateSalesInvoiceRequest request, CancellationToken cancellationToken)
    {
        var result = await invoiceService.CreateFromSalesOrderAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("delivery-orders")]
    public async Task<ActionResult<IReadOnlyCollection<DeliveryOrderListItemDto>>> GetDeliveryOrders([FromQuery] DeliveryOrderListQuery query, CancellationToken cancellationToken) =>
        Ok(await deliveryOrderService.GetAsync(query, cancellationToken));

    [HttpGet("delivery-orders/{id:guid}")]
    public async Task<ActionResult<DeliveryOrderDetailsDto>> GetDeliveryOrder(Guid id, CancellationToken cancellationToken)
    {
        var result = await deliveryOrderService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("delivery-orders")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<DeliveryOrderDetailsDto>> CreateDeliveryOrder(DeliveryOrderUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await deliveryOrderService.CreateAsync(request, cancellationToken));

    [HttpPut("delivery-orders/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<DeliveryOrderDetailsDto>> UpdateDeliveryOrder(Guid id, DeliveryOrderUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await deliveryOrderService.UpdateAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("delivery-orders/{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<DeliveryOrderDetailsDto>> SetDeliveryOrderStatus(Guid id, DeliveryOrderStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await deliveryOrderService.SetStatusAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("delivery-orders/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteDeliveryOrder(Guid id, CancellationToken cancellationToken) =>
        await deliveryOrderService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("delivery-orders/{id:guid}/convert-to-invoice")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> ConvertDeliveryOrderToInvoice(Guid id, CreateSalesInvoiceRequest request, CancellationToken cancellationToken)
    {
        var result = await invoiceService.CreateFromDeliveryOrderAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
