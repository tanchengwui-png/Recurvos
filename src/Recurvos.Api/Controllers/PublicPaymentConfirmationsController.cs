using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Recurvos.Application.Invoices;
using Recurvos.Application.Payments;

namespace Recurvos.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/payment-confirmations")]
[EnableRateLimiting("public-payment-confirmation")]
public sealed class PublicPaymentConfirmationsController(IPaymentConfirmationService paymentConfirmationService) : ControllerBase
{
    public sealed class SubmitPaymentConfirmationForm
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
    public async Task<ActionResult<PublicPaymentConfirmationInvoiceDto>> Get([FromQuery] string token, CancellationToken cancellationToken)
    {
        var invoice = await paymentConfirmationService.GetPublicInvoiceAsync(token, cancellationToken);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    [HttpPost]
    [RequestFormLimits(MultipartBodyLengthLimit = 5 * 1024 * 1024)]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> Submit([FromForm] SubmitPaymentConfirmationForm form, CancellationToken cancellationToken)
    {
        try
        {
            PaymentProofUpload? proof = null;
            if (form.ProofFile is { Length: > 0 })
            {
                if (form.ProofFile.Length > 5 * 1024 * 1024)
                {
                    throw new InvalidDataException("Proof upload exceeds the platform maximum upload size.");
                }

                await using var stream = form.ProofFile.OpenReadStream();
                using var memory = new MemoryStream();
                await stream.CopyToAsync(memory, cancellationToken);
                proof = new PaymentProofUpload(form.ProofFile.FileName, form.ProofFile.ContentType, memory.ToArray());
            }

            await paymentConfirmationService.SubmitPublicAsync(
                new SubmitPublicPaymentConfirmationRequest
                {
                    Token = form.Token,
                    PayerName = form.PayerName,
                    Amount = form.Amount,
                    PaidAtUtc = form.PaidAtUtc,
                    TransactionReference = form.TransactionReference,
                    Notes = form.Notes,
                },
                proof,
                cancellationToken);

            return Accepted();
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
        catch (InvalidDataException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }
}
