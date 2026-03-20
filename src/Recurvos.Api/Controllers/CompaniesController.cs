using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Companies;
using Recurvos.Application.ProductPlans;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/companies")]
public sealed class CompaniesController(ICompanyService companyService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<CompanyLookupDto>>> Get(CancellationToken cancellationToken) =>
        Ok(await companyService.GetOwnedAsync(cancellationToken));

    [HttpGet("{id:guid}/logo")]
    public async Task<IActionResult> GetLogo(Guid id, CancellationToken cancellationToken)
    {
        var logo = await companyService.GetLogoAsync(id, cancellationToken);
        return logo is null ? NotFound() : File(logo.Content, logo.ContentType, logo.FileName);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CompanyLookupDto>> Create(CompanyUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await companyService.CreateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CompanyLookupDto>> Update(Guid id, CompanyUpsertRequest request, CancellationToken cancellationToken)
    {
        var company = await companyService.UpdateAsync(id, request, cancellationToken);
        return company is null ? NotFound() : Ok(company);
    }

    [HttpPost("{id:guid}/logo")]
    [Authorize(Policy = "ManageBilling")]
    [RequestSizeLimit(5_000_000)]
    public async Task<ActionResult<CompanyLookupDto>> UploadLogo(Guid id, IFormFile file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Please choose a logo file to upload.");
        }

        if (file.Length > 5_000_000)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Logo exceeds the platform maximum upload size.");
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var company = await companyService.UploadLogoAsync(id, stream, file.FileName, cancellationToken);
            return company is null ? NotFound() : Ok(company);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("{companyId:guid}/product-plans")]
    public async Task<ActionResult<IReadOnlyCollection<ProductPlanDto>>> GetRecurringPlans(Guid companyId, CancellationToken cancellationToken) =>
        Ok(await companyService.GetRecurringPlansAsync(companyId, cancellationToken));
}
