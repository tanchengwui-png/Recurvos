using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Recurvos.Application.Payments;

namespace Recurvos.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/payments")]
[EnableRateLimiting("public-read")]
public sealed class PublicPaymentsController(IPaymentService paymentService) : ControllerBase
{
    [HttpGet("status")]
    public async Task<ActionResult<PublicPaymentStatusDto>> GetStatus([FromQuery] string? externalPaymentId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(externalPaymentId))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Payment lookup requires a payment id.");
        }

        var status = await paymentService.GetPublicStatusAsync(externalPaymentId, cancellationToken);
        return status is null ? NotFound() : Ok(status);
    }
}
