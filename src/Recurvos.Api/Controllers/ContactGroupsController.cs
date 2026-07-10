using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Customers;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/contact-groups")]
public sealed class ContactGroupsController(IContactGroupService contactGroupService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyCollection<ContactGroupDto>>> Get(CancellationToken cancellationToken) => Ok(await contactGroupService.GetAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ContactGroupDto>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var group = await contactGroupService.GetByIdAsync(id, cancellationToken);
        return group is null ? NotFound() : Ok(group);
    }

    [HttpPost]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ContactGroupDto>> Create(ContactGroupRequest request, CancellationToken cancellationToken) => Ok(await contactGroupService.CreateAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ContactGroupDto>> Update(Guid id, ContactGroupRequest request, CancellationToken cancellationToken)
    {
        var group = await contactGroupService.UpdateAsync(id, request, cancellationToken);
        return group is null ? NotFound() : Ok(group);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) => await contactGroupService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
}
