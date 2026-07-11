using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Purchases;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/purchases/grns")]
public sealed class GoodsReceivedNotesController(IGoodsReceivedNoteService goodsReceivedNoteService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<GoodsReceivedNoteListItemDto>>> Get([FromQuery] GoodsReceivedNoteListQuery query, CancellationToken cancellationToken) =>
        Ok(await goodsReceivedNoteService.GetAsync(query, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GoodsReceivedNoteDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var result = await goodsReceivedNoteService.GetByIdAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<GoodsReceivedNoteDetailsDto>> Create(GoodsReceivedNoteUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await goodsReceivedNoteService.CreateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<GoodsReceivedNoteDetailsDto>> Update(Guid id, GoodsReceivedNoteUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await goodsReceivedNoteService.UpdateAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<GoodsReceivedNoteDetailsDto>> SetStatus(Guid id, GoodsReceivedNoteStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await goodsReceivedNoteService.SetStatusAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        await goodsReceivedNoteService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
