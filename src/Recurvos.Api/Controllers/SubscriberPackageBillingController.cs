using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Platform;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/package-billing")]
public sealed class SubscriberPackageBillingController(ISubscriberPackageBillingService billingService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<SubscriberPackageBillingSummaryDto>> GetCurrent(CancellationToken cancellationToken) =>
        Ok(await billingService.GetCurrentAsync(cancellationToken));

    [HttpPost("upgrade-preview")]
    public async Task<ActionResult<SubscriberPackageUpgradePreviewDto>> PreviewUpgrade([FromBody] SubscriberPackageUpgradeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await billingService.PreviewUpgradeAsync(request.PackageCode, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: exception.Message);
        }
    }

    [HttpPost("upgrade")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriberPackageBillingInvoiceDto>> CreateUpgradeInvoice([FromBody] SubscriberPackageUpgradeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await billingService.CreateUpgradeInvoiceAsync(request.PackageCode, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: exception.Message);
        }
    }

    [HttpPost("upgrade/cancel")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriberPackageBillingSummaryDto>> CancelUpgrade(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await billingService.CancelPendingUpgradeAsync(cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: exception.Message);
        }
    }

    [HttpPost("reactivation-preview")]
    public async Task<ActionResult<SubscriberPackageReactivationPreviewDto>> PreviewReactivation([FromBody] SubscriberPackageUpgradeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await billingService.PreviewReactivationAsync(request.PackageCode, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: exception.Message);
        }
    }

    [HttpPost("reactivate")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriberPackageBillingInvoiceDto>> Reactivate([FromBody] SubscriberPackageUpgradeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await billingService.CreateReactivationInvoiceAsync(request.PackageCode, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: exception.Message);
        }
    }

    [HttpPost("invoices/{invoiceId:guid}/payment-link")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<SubscriberPackageBillingInvoiceDto>> CreatePaymentLink(Guid invoiceId, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await billingService.CreatePaymentLinkAsync(invoiceId, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: exception.Message);
        }
    }

    [HttpGet("invoices/{invoiceId:guid}/download")]
    public async Task<IActionResult> DownloadInvoice(Guid invoiceId, CancellationToken cancellationToken)
    {
        var file = await billingService.DownloadInvoiceAsync(invoiceId, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }

    [HttpGet("invoices/{invoiceId:guid}/receipt")]
    public async Task<IActionResult> DownloadReceipt(Guid invoiceId, CancellationToken cancellationToken)
    {
        var file = await billingService.DownloadReceiptAsync(invoiceId, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }
}
