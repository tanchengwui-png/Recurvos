using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Purchases;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/purchases/credit-notes")]
public sealed class PurchaseCreditNotesController(IPurchaseCreditNoteService purchaseCreditNoteService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PurchaseCreditNoteListItemDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await purchaseCreditNoteService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PurchaseCreditNoteDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseCreditNoteService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseCreditNoteDetailsDto>> Create(CreatePurchaseCreditNoteRequest request, CancellationToken cancellationToken) =>
        Ok(await purchaseCreditNoteService.CreateAsync(request, cancellationToken));

    [HttpPatch("{id:guid}/cancel")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PurchaseCreditNoteDetailsDto>> Cancel(Guid id, CancellationToken cancellationToken)
    {
        var result = await purchaseCreditNoteService.CancelAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }
}
