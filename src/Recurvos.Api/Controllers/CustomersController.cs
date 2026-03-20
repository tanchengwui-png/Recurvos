using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Customers;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/customers")]
public sealed class CustomersController(ICustomerService customerService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<CustomerDto>>> Get(CancellationToken cancellationToken) => Ok(await customerService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CustomerDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var customer = await customerService.GetByIdAsync(id, cancellationToken);
        return customer is null ? NotFound() : Ok(customer);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CustomerDto>> Create(CustomerRequest request, CancellationToken cancellationToken) => Ok(await customerService.CreateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CustomerDto>> Update(Guid id, CustomerRequest request, CancellationToken cancellationToken)
    {
        var customer = await customerService.UpdateAsync(id, request, cancellationToken);
        return customer is null ? NotFound() : Ok(customer);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) => await customerService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
