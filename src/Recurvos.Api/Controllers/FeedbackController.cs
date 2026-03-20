using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Feedback;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/feedback")]
public sealed class FeedbackController(IFeedbackService feedbackService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<FeedbackItemDto>>> GetOwned([FromQuery] Guid? companyId, CancellationToken cancellationToken) =>
        Ok(await feedbackService.GetOwnedAsync(companyId, cancellationToken));

    [HttpGet("notifications")]
    public async Task<ActionResult<FeedbackNotificationSummaryDto>> GetNotificationSummary(CancellationToken cancellationToken) =>
        Ok(await feedbackService.GetOwnedNotificationSummaryAsync(cancellationToken));

    [HttpPost("mark-read")]
    public async Task<IActionResult> MarkRepliesRead([FromQuery] Guid? companyId, CancellationToken cancellationToken)
    {
        await feedbackService.MarkOwnedRepliesReadAsync(companyId, cancellationToken);
        return NoContent();
    }

    [HttpPost]
    public async Task<ActionResult<FeedbackItemDto>> Create(CreateFeedbackRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await feedbackService.CreateAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (DbUpdateException)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Feedback is not ready yet. Restart the API so the latest database changes can be applied.");
        }
    }

    [HttpGet("platform")]
    [Authorize(Policy = "PlatformOwnerOnly")]
    public async Task<ActionResult<IReadOnlyCollection<FeedbackItemDto>>> GetPlatform(CancellationToken cancellationToken) =>
        Ok(await feedbackService.GetPlatformAsync(cancellationToken));

    [HttpPut("platform/{id:guid}")]
    [Authorize(Policy = "PlatformOwnerOnly")]
    public async Task<ActionResult<FeedbackItemDto>> UpdatePlatform(Guid id, UpdateFeedbackReviewRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var item = await feedbackService.UpdatePlatformAsync(id, request, cancellationToken);
            return item is null ? NotFound() : Ok(item);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (DbUpdateException)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Feedback is not ready yet. Restart the API so the latest database changes can be applied.");
        }
    }
}
