using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Invoices;
using Recurvos.Application.Subscriptions;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/subscriptions")]
public sealed class SubscriptionsController(ISubscriptionService subscriptionService, IInvoiceService invoiceService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<SubscriptionDto>>> Get(CancellationToken cancellationToken) => Ok(await subscriptionService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SubscriptionDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var subscription = await subscriptionService.GetByIdAsync(id, cancellationToken);
        return subscription is null ? NotFound() : Ok(subscription);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> Create(SubscriptionRequest request, CancellationToken cancellationToken) => Ok(await subscriptionService.CreateAsync(request, cancellationToken));

    [HttpPatch("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> Update(Guid id, SubscriptionUpdateRequest request, CancellationToken cancellationToken)
    {
        var subscription = await subscriptionService.UpdateAsync(id, request, cancellationToken);
        return subscription is null ? NotFound() : Ok(subscription);
    }

    [HttpPatch("{id:guid}/pricing")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> UpdatePricing(Guid id, UpdateSubscriptionPricingRequest request, CancellationToken cancellationToken)
    {
        var subscription = await subscriptionService.UpdatePricingAsync(id, request, cancellationToken);
        return subscription is null ? NotFound() : Ok(subscription);
    }

    [HttpPost("{id:guid}/items/{itemId:guid}/migrate-plan")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> MigrateItem(Guid id, Guid itemId, MigrateSubscriptionItemRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var subscription = await subscriptionService.MigrateItemAsync(id, itemId, request, cancellationToken);
            return subscription is null ? NotFound() : Ok(subscription);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/pause")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> Pause(Guid id, CancellationToken cancellationToken)
    {
        var subscription = await subscriptionService.PauseAsync(id, cancellationToken);
        return subscription is null ? NotFound() : Ok(subscription);
    }

    [HttpPost("{id:guid}/resume")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> Resume(Guid id, CancellationToken cancellationToken)
    {
        var subscription = await subscriptionService.ResumeAsync(id, cancellationToken);
        return subscription is null ? NotFound() : Ok(subscription);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriptionDto>> Cancel(Guid id, CancelSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var subscription = await subscriptionService.CancelAsync(id, request, cancellationToken);
        return subscription is null ? NotFound() : Ok(subscription);
    }

    [HttpPost("{id:guid}/generate-invoice")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> GenerateInvoiceNow(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await invoiceService.GenerateSubscriptionInvoiceNowAsync(id, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("run-due-invoices")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<object>> RunDueInvoices(CancellationToken cancellationToken)
    {
        try
        {
            var created = await invoiceService.GenerateDueInvoicesForCurrentCompanyAsync(cancellationToken);
            return Ok(new { created });
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("due-invoices/count")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<object>> GetDueInvoiceCount(CancellationToken cancellationToken)
    {
        try
        {
            var count = await invoiceService.CountDueInvoicesForCurrentCompanyAsync(cancellationToken);
            return Ok(new { count });
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{id:guid}/preview-invoice")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> PreviewInvoice(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var file = await invoiceService.GenerateSubscriptionPreviewPdfAsync(id, cancellationToken);
            return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }
}
