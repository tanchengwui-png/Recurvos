using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Products;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/product-groups")]
public sealed class ProductGroupsController(IProductGroupService productGroupService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<ProductGroupDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await productGroupService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductGroupDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var group = await productGroupService.GetByIdAsync(id, cancellationToken);
        return group is null ? NotFound() : Ok(group);
    }

    [HttpGet("products")]
    public async Task<ActionResult<IReadOnlyCollection<ProductGroupProductLookupDto>>> GetProducts(CancellationToken cancellationToken) =>
        Ok(await productGroupService.GetProductsAsync(cancellationToken));

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductGroupDto>> Create(ProductGroupRequest request, CancellationToken cancellationToken) =>
        Ok(await productGroupService.CreateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductGroupDto>> Update(Guid id, ProductGroupRequest request, CancellationToken cancellationToken)
    {
        var group = await productGroupService.UpdateAsync(id, request, cancellationToken);
        return group is null ? NotFound() : Ok(group);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        await productGroupService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
