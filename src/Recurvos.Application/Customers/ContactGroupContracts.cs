using System.ComponentModel.DataAnnotations;

namespace Recurvos.Application.Customers;

public sealed class ContactGroupRequest
{
    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    public IReadOnlyCollection<Guid> ContactIds { get; set; } = Array.Empty<Guid>();
}

public sealed class ContactGroupDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int ContactsCount { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public IReadOnlyCollection<Guid> ContactIds { get; set; } = Array.Empty<Guid>();
}

public interface IContactGroupService
{
    Task<IReadOnlyCollection<ContactGroupDto>> GetAsync(CancellationToken cancellationToken = default);
    Task<ContactGroupDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ContactGroupDto> CreateAsync(ContactGroupRequest request, CancellationToken cancellationToken = default);
    Task<ContactGroupDto?> UpdateAsync(Guid id, ContactGroupRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
