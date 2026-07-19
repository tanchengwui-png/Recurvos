using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Accounting;

namespace Recurvos.Api.Controllers;

[ApiController, Authorize, Route("api/accounting/journal-entries")]
public sealed class JournalEntriesController(IJournalEntryService service) : ControllerBase
{
    [HttpGet] public async Task<ActionResult<IReadOnlyCollection<JournalEntryListItemDto>>> Get([FromQuery] JournalEntryListQuery query, CancellationToken ct) => Ok(await service.GetAsync(query, ct));
    [HttpGet("{id:guid}")] public async Task<ActionResult<JournalEntryDetailsDto>> GetById(Guid id, CancellationToken ct) { var item = await service.GetByIdAsync(id, ct); return item is null ? NotFound() : Ok(item); }
    [HttpPost, Authorize(Policy = "ManageBilling")] public async Task<ActionResult<JournalEntryDetailsDto>> Create(JournalEntryUpsertRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));
    [HttpPut("{id:guid}"), Authorize(Policy = "ManageBilling")] public async Task<ActionResult<JournalEntryDetailsDto>> Update(Guid id, JournalEntryUpsertRequest request, CancellationToken ct) { var item = await service.UpdateAsync(id, request, ct); return item is null ? NotFound() : Ok(item); }
    [HttpDelete("{id:guid}"), Authorize(Policy = "ManageBilling")] public async Task<IActionResult> Delete(Guid id, CancellationToken ct) => await service.DeleteAsync(id, ct) ? NoContent() : NotFound();
    [HttpPost("{id:guid}/post"), Authorize(Policy = "ManageBilling")] public async Task<ActionResult<JournalEntryDetailsDto>> Post(Guid id, CancellationToken ct) { var item = await service.PostAsync(id, ct); return item is null ? NotFound() : Ok(item); }
    [HttpPost("{id:guid}/reverse"), Authorize(Policy = "ManageBilling")] public async Task<ActionResult<JournalEntryDetailsDto>> Reverse(Guid id, CancellationToken ct) { var item = await service.ReverseAsync(id, ct); return item is null ? NotFound() : Ok(item); }
    [HttpPost("{id:guid}/cancel"), Authorize(Policy = "ManageBilling")] public async Task<ActionResult<JournalEntryDetailsDto>> Cancel(Guid id, CancellationToken ct) { var item = await service.CancelAsync(id, ct); return item is null ? NotFound() : Ok(item); }
}
