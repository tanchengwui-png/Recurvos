using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Invoices;
using Recurvos.Application.Refunds;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/invoices")]
public sealed class InvoicesController(IInvoiceService invoiceService) : ControllerBase
{
    public sealed class RecordInvoicePaymentWithProofForm
    {
        public decimal Amount { get; set; }
        public string Method { get; set; } = "Other";
        public string? Reference { get; set; }
        public DateTime? PaidAtUtc { get; set; }
        public IFormFile? ProofFile { get; set; }
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<InvoiceDto>>> Get(CancellationToken cancellationToken) => Ok(await invoiceService.GetAsync(cancellationToken));

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> Create(CreateInvoiceRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await invoiceService.CreateAsync(request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<InvoiceDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var invoice = await invoiceService.GetByIdAsync(id, cancellationToken);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    [HttpGet("{id:guid}/whatsapp-links")]
    public async Task<ActionResult<InvoiceWhatsAppLinkOptionsDto>> GetWhatsAppLinkOptions(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var links = await invoiceService.GetWhatsAppLinkOptionsAsync(id, cancellationToken);
            return links is null ? NotFound() : Ok(links);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/send")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Send(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return await invoiceService.SendInvoiceAsync(id, cancellationToken) ? Accepted() : NotFound();
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/mark-paid")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> MarkPaid(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await invoiceService.MarkPaidAsync(id, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/record-payment")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> RecordPayment(Guid id, RecordInvoicePaymentRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await invoiceService.RecordPaymentAsync(id, request, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/record-payment-with-proof")]
    [Authorize(Policy = "ManageBilling")]
    [RequestFormLimits(MultipartBodyLengthLimit = 5 * 1024 * 1024)]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<ActionResult<InvoiceDto>> RecordPaymentWithProof(Guid id, [FromForm] RecordInvoicePaymentWithProofForm form, CancellationToken cancellationToken)
    {
        try
        {
            PaymentProofUpload? proof = null;
            if (form.ProofFile is { Length: > 0 })
            {
                if (form.ProofFile.Length > 5 * 1024 * 1024)
                {
                    throw new InvalidOperationException("Proof upload exceeds the platform maximum upload size.");
                }

                await using var stream = form.ProofFile.OpenReadStream();
                using var memory = new MemoryStream();
                await stream.CopyToAsync(memory, cancellationToken);
                proof = new PaymentProofUpload(form.ProofFile.FileName, form.ProofFile.ContentType, memory.ToArray());
            }

            var invoice = await invoiceService.RecordPaymentWithProofAsync(
                id,
                new RecordInvoicePaymentRequest
                {
                    Amount = form.Amount,
                    Method = form.Method,
                    Reference = form.Reference,
                    PaidAtUtc = form.PaidAtUtc,
                },
                proof,
                cancellationToken);

            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/reverse-payment")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> ReversePayment(Guid id, ReverseInvoicePaymentRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await invoiceService.ReverseLatestManualPaymentAsync(id, request, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/refund-payment")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> RefundPayment(Guid id, RecordRefundRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await invoiceService.RefundLatestManualPaymentAsync(id, request, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<InvoiceDto>> Cancel(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var invoice = await invoiceService.CancelAsync(id, cancellationToken);
            return invoice is null ? NotFound() : Ok(invoice);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var file = await invoiceService.DownloadPdfAsync(id, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }

    [HttpGet("{id:guid}/receipt")]
    public async Task<IActionResult> DownloadReceipt(Guid id, CancellationToken cancellationToken)
    {
        var file = await invoiceService.DownloadReceiptAsync(id, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }
}
