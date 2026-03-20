using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Invoices;
using Recurvos.Application.Payments;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/payment-confirmations")]
public sealed class PaymentConfirmationsController(IPaymentConfirmationService paymentConfirmationService) : ControllerBase
{
    public sealed class PublicPaymentConfirmationForm
    {
        public string Token { get; set; } = string.Empty;
        public string PayerName { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public DateTime PaidAtUtc { get; set; }
        public string? TransactionReference { get; set; }
        public string? Notes { get; set; }
        public IFormFile? ProofFile { get; set; }
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PendingPaymentConfirmationDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await paymentConfirmationService.GetPendingAsync(cancellationToken));

    [HttpPost("invoices/{invoiceId:guid}/link")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PaymentConfirmationLinkDto>> CreateLink(Guid invoiceId, CancellationToken cancellationToken)
    {
        var link = await paymentConfirmationService.GetOrCreateLinkAsync(invoiceId, cancellationToken);
        return link is null ? NotFound() : Ok(link);
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PendingPaymentConfirmationDto>> Approve(Guid id, ReviewPaymentConfirmationRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var item = await paymentConfirmationService.ApproveAsync(id, request, cancellationToken);
            return item is null ? NotFound() : Ok(item);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PendingPaymentConfirmationDto>> Reject(Guid id, ReviewPaymentConfirmationRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var item = await paymentConfirmationService.RejectAsync(id, request, cancellationToken);
            return item is null ? NotFound() : Ok(item);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{id:guid}/proof")]
    public async Task<IActionResult> DownloadProof(Guid id, CancellationToken cancellationToken)
    {
        var file = await paymentConfirmationService.DownloadProofAsync(id, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }
}
