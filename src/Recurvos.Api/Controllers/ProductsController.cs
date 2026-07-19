using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Common;
using Recurvos.Application.ProductPlans;
using Recurvos.Application.Products;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/products")]
public sealed class ProductsController(IProductService productService, IProductPlanService productPlanService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProductListItemDto>>> Get([FromQuery] ProductListQuery query, CancellationToken cancellationToken) =>
        Ok(await productService.GetAsync(query, cancellationToken));

    [HttpGet("{id:guid}/image")]
    public async Task<IActionResult> GetImage(Guid id, CancellationToken cancellationToken)
    {
        var image = await productService.GetImageAsync(id, cancellationToken);
        return image is null ? NotFound() : File(image.Content, image.ContentType, image.FileName);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDetailsDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var product = await productService.GetByIdAsync(id, cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpGet("{productId:guid}/plans")]
    public async Task<ActionResult<IReadOnlyCollection<ProductPlanDto>>> GetPlans(Guid productId, CancellationToken cancellationToken) =>
        Ok(await productPlanService.GetByProductAsync(productId, cancellationToken));

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductDetailsDto>> Create(ProductUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await productService.CreateAsync(request, cancellationToken));

    [HttpPost("batch-update")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductBatchUpdateResult>> BatchUpdate(ProductBatchUpdateRequest request, CancellationToken cancellationToken) =>
        Ok(await productService.BatchUpdateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductDetailsDto>> Update(Guid id, ProductUpsertRequest request, CancellationToken cancellationToken)
    {
        var product = await productService.UpdateAsync(id, request, cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost("{id:guid}/image")]
    [Authorize(Policy = "ManageBilling")]
    [RequestSizeLimit(5_000_000)]
    public async Task<ActionResult<ProductDetailsDto>> UploadImage(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Please choose a product image to upload.");
        }

        if (file.Length > 5_000_000)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Product image exceeds the platform maximum upload size.");
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var product = await productService.UploadImageAsync(id, stream, file.FileName, cancellationToken);
            return product is null ? NotFound() : Ok(product);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpDelete("{id:guid}/image")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductDetailsDto>> RemoveImage(Guid id, CancellationToken cancellationToken)
    {
        var product = await productService.RemoveImageAsync(id, cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductDetailsDto>> SetStatus(Guid id, ProductStatusRequest request, CancellationToken cancellationToken)
    {
        var product = await productService.SetStatusAsync(id, request, cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost("{productId:guid}/plans")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductPlanDto>> CreatePlan(Guid productId, ProductPlanUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await productPlanService.CreateAsync(productId, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        await productService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
