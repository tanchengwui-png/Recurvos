using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Finance;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/statements")]
public sealed class StatementsController(IStatementService statementService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<StatementOfAccountDto>> Get([FromQuery] StatementOfAccountQuery query, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await statementService.GetAsync(query, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }
}
