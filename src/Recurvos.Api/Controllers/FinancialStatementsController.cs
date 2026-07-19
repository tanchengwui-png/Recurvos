using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Accounting;

namespace Recurvos.Api.Controllers;

[ApiController, Authorize, Route("api/accounting/statements")]
public sealed class FinancialStatementsController(IFinancialStatementService service) : ControllerBase
{
    [HttpGet("profit-and-loss")] public async Task<ActionResult<ProfitAndLossReportDto>> ProfitAndLoss([FromQuery] ProfitAndLossQuery query, CancellationToken ct) => Ok(await service.GetProfitAndLossAsync(query, ct));
    [HttpGet("balance-sheet")] public async Task<ActionResult<BalanceSheetReportDto>> BalanceSheet([FromQuery] AccountingReportQuery query, CancellationToken ct) => Ok(await service.GetBalanceSheetAsync(query, ct));
    [HttpGet("cash-flow")] public async Task<ActionResult<CashFlowReportDto>> CashFlow([FromQuery] AccountingReportQuery query, CancellationToken ct) => Ok(await service.GetCashFlowAsync(query, ct));
    [HttpGet("profit-and-loss/csv")] public async Task<IActionResult> ExportProfitAndLoss([FromQuery] ProfitAndLossQuery query, CancellationToken ct) => await FileAsync(service.ExportProfitAndLossAsync(query, ct));
    [HttpGet("balance-sheet/csv")] public async Task<IActionResult> ExportBalanceSheet([FromQuery] AccountingReportQuery query, CancellationToken ct) => await FileAsync(service.ExportBalanceSheetAsync(query, ct));
    [HttpGet("cash-flow/csv")] public async Task<IActionResult> ExportCashFlow([FromQuery] AccountingReportQuery query, CancellationToken ct) => await FileAsync(service.ExportCashFlowAsync(query, ct));
    private async Task<IActionResult> FileAsync(Task<Recurvos.Application.Finance.FinanceExportFile> fileTask) { var file = await fileTask; return File(file.Content, file.ContentType, file.FileName); }
}
