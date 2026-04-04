using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.CreditNotes;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/credit-notes")]
public sealed class CreditNotesController(ICreditNoteService creditNoteService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<CreditNoteDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await creditNoteService.GetAsync(cancellationToken));

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CreditNoteDto>> Create(CreateCreditNoteRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await creditNoteService.CreateAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var file = await creditNoteService.DownloadAsync(id, cancellationToken);
        return file is null ? NotFound() : File(file.Content, file.ContentType, file.FileName);
    }
}
