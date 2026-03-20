using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Refunds;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/refunds")]
public sealed class RefundsController(IRefundService refundService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<RefundDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await refundService.GetAsync(cancellationToken));

    [HttpPost("payments/{paymentId:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<RefundDto>> Record(Guid paymentId, RecordRefundRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var refund = await refundService.RecordAsync(paymentId, request, cancellationToken);
            return refund is null ? NotFound() : Ok(refund);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }
}
