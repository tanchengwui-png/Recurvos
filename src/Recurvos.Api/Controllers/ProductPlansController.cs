using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Common;
using Recurvos.Application.ProductPlans;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/product-plans")]
public sealed class ProductPlansController(IProductPlanService productPlanService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProductPlanDto>>> Get([FromQuery] ProductPlanListQuery query, CancellationToken cancellationToken) =>
        Ok(await productPlanService.GetAsync(query, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductPlanDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var plan = await productPlanService.GetByIdAsync(id, cancellationToken);
        return plan is null ? NotFound() : Ok(plan);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductPlanDto>> Update(Guid id, ProductPlanUpsertRequest request, CancellationToken cancellationToken)
    {
        var plan = await productPlanService.UpdateAsync(id, request, cancellationToken);
        return plan is null ? NotFound() : Ok(plan);
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductPlanDto>> SetStatus(Guid id, ProductPlanStatusRequest request, CancellationToken cancellationToken)
    {
        var plan = await productPlanService.SetStatusAsync(id, request, cancellationToken);
        return plan is null ? NotFound() : Ok(plan);
    }

    [HttpPatch("{id:guid}/default")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductPlanDto>> SetDefault(Guid id, ProductPlanDefaultRequest request, CancellationToken cancellationToken)
    {
        var plan = await productPlanService.SetDefaultAsync(id, request, cancellationToken);
        return plan is null ? NotFound() : Ok(plan);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        await productPlanService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
