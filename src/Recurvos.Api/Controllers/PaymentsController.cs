using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Payments;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/payments")]
public sealed class PaymentsController(IPaymentService paymentService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<PaymentDto>>> Get(CancellationToken cancellationToken) => Ok(await paymentService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PaymentDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var payment = await paymentService.GetByIdAsync(id, cancellationToken);
        return payment is null ? NotFound() : Ok(payment);
    }

    [HttpPost("invoice/{invoiceId:guid}/link")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PaymentDto>> CreateLink(Guid invoiceId, CancellationToken cancellationToken)
    {
        try
        {
            var payment = await paymentService.CreatePaymentLinkAsync(invoiceId, cancellationToken);
            return payment is null ? NotFound() : Ok(payment);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{id:guid}/proof")]
    public async Task<IActionResult> DownloadProof(Guid id, CancellationToken cancellationToken)
    {
        var file = await paymentService.DownloadProofAsync(id, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }

    [HttpGet("{id:guid}/receipt")]
    public async Task<IActionResult> DownloadReceipt(Guid id, CancellationToken cancellationToken)
    {
        var file = await paymentService.DownloadReceiptAsync(id, cancellationToken);
        return file is null ? NotFound() : File(file.Value.Content, file.Value.ContentType, file.Value.FileName);
    }
}
