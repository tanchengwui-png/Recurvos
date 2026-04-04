using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Recurvos.Application.Webhooks;

namespace Recurvos.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/webhooks")]
[EnableRateLimiting("public-webhook")]
public sealed class WebhooksController(IWebhookService webhookService) : ControllerBase
{
    [HttpPost("{gatewayName}")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<IActionResult> Receive(string gatewayName, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        var headers = Request.Headers.ToDictionary(x => x.Key, x => x.Value.ToString());
        await webhookService.ProcessAsync(gatewayName, payload, headers, cancellationToken);
        return Ok();
    }

    [HttpPost("billplz/complete")]
    [RequestSizeLimit(16 * 1024)]
    public async Task<IActionResult> CompleteBillplzReturn(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(payload) && Request.QueryString.HasValue)
        {
            payload = Request.QueryString.Value?.TrimStart('?') ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(payload))
        {
            return BadRequest("Missing Billplz return payload.");
        }

        var parsed = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(payload);
        var paymentId = parsed.TryGetValue("billplz[id]", out var wrappedId)
            ? wrappedId.ToString()
            : parsed.TryGetValue("id", out var plainId)
                ? plainId.ToString()
                : string.Empty;

        if (string.IsNullOrWhiteSpace(paymentId))
        {
            return BadRequest("Billplz return is missing the payment id.");
        }

        await webhookService.ConfirmAsync("billplz", paymentId, payload, cancellationToken);
        return Ok();
    }

    [HttpPost("stripe/complete")]
    [RequestSizeLimit(16 * 1024)]
    public async Task<IActionResult> CompleteStripeReturn(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(payload) && Request.QueryString.HasValue)
        {
            payload = Request.QueryString.Value?.TrimStart('?') ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(payload))
        {
            return BadRequest("Missing Stripe return payload.");
        }

        var parsed = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(payload);
        var sessionId = parsed.TryGetValue("session_id", out var wrappedSessionId)
            ? wrappedSessionId.ToString()
            : parsed.TryGetValue("sessionId", out var plainSessionId)
                ? plainSessionId.ToString()
                : string.Empty;

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return BadRequest("Stripe return is missing the session id.");
        }

        await webhookService.ConfirmAsync("stripe", sessionId, payload, cancellationToken);
        return Ok();
    }
}
