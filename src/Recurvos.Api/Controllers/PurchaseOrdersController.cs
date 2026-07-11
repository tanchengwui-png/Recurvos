using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Purchases;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/purchases/orders")]
public sealed class PurchaseOrdersController(IPurchaseOrderService purchaseOrderService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PurchaseOrderListItemDto>>> Get([FromQuery] PurchaseOrderListQuery query, CancellationToken cancellationToken) =>
        Ok(await purchaseOrderService.GetAsync(query, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseOrderDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseOrderService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseOrderDetailsDto>> Create(PurchaseOrderUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await purchaseOrderService.CreateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseOrderDetailsDto>> Update(Guid id, PurchaseOrderUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await purchaseOrderService.UpdateAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseOrderDetailsDto>> SetStatus(Guid id, PurchaseOrderStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await purchaseOrderService.SetStatusAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        await purchaseOrderService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
