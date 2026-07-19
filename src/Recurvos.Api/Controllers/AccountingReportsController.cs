using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Accounting;

namespace Recurvos.Api.Controllers;

[ApiController, Authorize, Route("api/accounting/reports")]
public sealed class AccountingReportsController(IAccountingReportService service) : ControllerBase
{
    [HttpGet("general-ledger")] public async Task<ActionResult<GeneralLedgerReportDto>> GeneralLedger([FromQuery] GeneralLedgerQuery query, CancellationToken ct) => Ok(await service.GetGeneralLedgerAsync(query, ct));
    [HttpGet("trial-balance")] public async Task<ActionResult<TrialBalanceReportDto>> TrialBalance([FromQuery] AccountingReportQuery query, CancellationToken ct) => Ok(await service.GetTrialBalanceAsync(query, ct));
    [HttpGet("general-ledger/csv")] public async Task<IActionResult> ExportGeneralLedger([FromQuery] GeneralLedgerQuery query, CancellationToken ct) { var file = await service.ExportGeneralLedgerAsync(query, ct); return File(file.Content, file.ContentType, file.FileName); }
    [HttpGet("trial-balance/csv")] public async Task<IActionResult> ExportTrialBalance([FromQuery] AccountingReportQuery query, CancellationToken ct) { var file = await service.ExportTrialBalanceAsync(query, ct); return File(file.Content, file.ContentType, file.FileName); }
}
