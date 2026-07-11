using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Purchases;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/purchases/payments")]
public sealed class PurchasePaymentsController(IPurchasePaymentService purchasePaymentService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PurchasePaymentListItemDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await purchasePaymentService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchasePaymentDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchasePaymentService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchasePaymentDetailsDto>> Create(CreatePurchasePaymentRequest request, CancellationToken cancellationToken) =>
        Ok(await purchasePaymentService.CreateAsync(request, cancellationToken));

    [HttpPatch("{id:guid}/reverse")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchasePaymentDetailsDto>> Reverse(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchasePaymentService.ReverseAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
