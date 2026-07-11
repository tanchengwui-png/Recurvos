using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Purchases;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/purchases/bills")]
public sealed class PurchaseBillsController(IPurchaseBillService purchaseBillService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PurchaseBillListItemDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await purchaseBillService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseBillDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseBillService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("/api/purchases/orders/{purchaseOrderId:guid}/convert-to-bill")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseBillDetailsDto>> CreateFromPurchaseOrder(Guid purchaseOrderId, CreatePurchaseBillRequest request, CancellationToken cancellationToken)
    {
        var result = await purchaseBillService.CreateFromPurchaseOrderAsync(purchaseOrderId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("/api/purchases/grns/{goodsReceivedNoteId:guid}/convert-to-bill")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseBillDetailsDto>> CreateFromGoodsReceivedNote(Guid goodsReceivedNoteId, CreatePurchaseBillRequest request, CancellationToken cancellationToken)
    {
        var result = await purchaseBillService.CreateFromGoodsReceivedNoteAsync(goodsReceivedNoteId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("{id:guid}/cancel")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseBillDetailsDto>> Cancel(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseBillService.CancelAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
