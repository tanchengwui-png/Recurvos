using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Features;
using Recurvos.Application.Finance;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/finance")]
public sealed class FinanceController(
    IAccountingExportService accountingExportService,
    IReconciliationService reconciliationService,
    IFeatureEntitlementService featureEntitlementService) : ControllerBase
{
    [HttpGet("exports/invoices/csv")]
    public Task<IActionResult> ExportInvoices([FromQuery] DateTime? startDateUtc, [FromQuery] DateTime? endDateUtc, CancellationToken cancellationToken) =>
        ExportAsync(FinanceExportDocumentType.Invoices, startDateUtc, endDateUtc, cancellationToken);

    [HttpGet("exports/payments/csv")]
    public Task<IActionResult> ExportPayments([FromQuery] DateTime? startDateUtc, [FromQuery] DateTime? endDateUtc, CancellationToken cancellationToken) =>
        ExportAsync(FinanceExportDocumentType.Payments, startDateUtc, endDateUtc, cancellationToken);

    [HttpGet("exports/refunds/csv")]
    public Task<IActionResult> ExportRefunds([FromQuery] DateTime? startDateUtc, [FromQuery] DateTime? endDateUtc, CancellationToken cancellationToken) =>
        ExportAsync(FinanceExportDocumentType.Refunds, startDateUtc, endDateUtc, cancellationToken);

    [HttpGet("exports/credit-notes/csv")]
    public Task<IActionResult> ExportCreditNotes([FromQuery] DateTime? startDateUtc, [FromQuery] DateTime? endDateUtc, CancellationToken cancellationToken) =>
        ExportAsync(FinanceExportDocumentType.CreditNotes, startDateUtc, endDateUtc, cancellationToken);

    [HttpGet("reconciliation/status")]
    public async Task<ActionResult<ReconciliationStatusDto>> GetReconciliationStatus(CancellationToken cancellationToken) =>
        Ok(await GetReconciliationStatusInternalAsync(cancellationToken));

    private async Task<IActionResult> ExportAsync(FinanceExportDocumentType type, DateTime? startDateUtc, DateTime? endDateUtc, CancellationToken cancellationToken)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.FinanceExports, cancellationToken);
        var file = await accountingExportService.ExportAsync(new FinanceExportRequest(type, startDateUtc, endDateUtc), cancellationToken);
        return File(file.Content, file.ContentType, file.FileName);
    }

    private async Task<ReconciliationStatusDto> GetReconciliationStatusInternalAsync(CancellationToken cancellationToken)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.FinanceExports, cancellationToken);
        return await reconciliationService.GetStatusAsync(cancellationToken);
    }
}
