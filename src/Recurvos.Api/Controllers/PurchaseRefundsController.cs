using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Purchases;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/purchases/refunds")]
public sealed class PurchaseRefundsController(IPurchaseRefundService purchaseRefundService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PurchaseRefundListItemDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await purchaseRefundService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseRefundDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseRefundService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("payments/{purchasePaymentId:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseRefundDetailsDto>> Create(Guid purchasePaymentId, CreatePurchaseRefundRequest request, CancellationToken cancellationToken)
    {
        var result = await purchaseRefundService.CreateAsync(purchasePaymentId, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("{id:guid}/cancel")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseRefundDetailsDto>> Cancel(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseRefundService.CancelAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
