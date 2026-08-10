using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Customers;
using Recurvos.Application.Features;
using Recurvos.Application.Platform;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;
using System.Text.Json;

namespace Recurvos.Infrastructure.Services;

public sealed class ContactGroupService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService) : IContactGroupService
{
    public async Task<IReadOnlyCollection<ContactGroupDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        var companyId = GetCompanyId();
        var groups = await dbContext.ContactGroups
            .Where(x => x.CompanyId == companyId)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);
        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(companyId.ToString()))
            .ToListAsync(cancellationToken);

        return groups.Select(group => BuildDto(group, customers)).ToList();
    }

    public async Task<ContactGroupDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        var companyId = GetCompanyId();
        var group = await dbContext.ContactGroups.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == id, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(companyId.ToString()))
            .ToListAsync(cancellationToken);
        return BuildDto(group, customers);
    }

    public async Task<ContactGroupDto> CreateAsync(ContactGroupRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var companyId = GetCompanyId();
        var normalizedName = NormalizeName(request.Name);
        await EnsureUniqueNameAsync(companyId, normalizedName, null, cancellationToken);

        var selectedContactIds = request.ContactIds.Distinct().ToHashSet();
        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(companyId.ToString()))
            .ToListAsync(cancellationToken);
        EnsureAllContactsExist(selectedContactIds, customers);

        var group = new ContactGroup
        {
            CompanyId = companyId,
            SubscriberId = GetSubscriberId(),
            Name = normalizedName,
        };

        dbContext.ContactGroups.Add(group);
        ApplyMembership(normalizedName, null, selectedContactIds, customers);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("contact-group.created", nameof(ContactGroup), group.Id.ToString(), group.Name, cancellationToken);
        return BuildDto(group, customers);
    }

    public async Task<ContactGroupDto?> UpdateAsync(Guid id, ContactGroupRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var companyId = GetCompanyId();
        var group = await dbContext.ContactGroups.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == id, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var normalizedName = NormalizeName(request.Name);
        await EnsureUniqueNameAsync(companyId, normalizedName, id, cancellationToken);

        var selectedContactIds = request.ContactIds.Distinct().ToHashSet();
        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(companyId.ToString()))
            .ToListAsync(cancellationToken);
        EnsureAllContactsExist(selectedContactIds, customers);

        var previousName = group.Name;
        group.Name = normalizedName;
        group.UpdatedAtUtc = DateTime.UtcNow;
        ApplyMembership(normalizedName, previousName, selectedContactIds, customers);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("contact-group.updated", nameof(ContactGroup), group.Id.ToString(), group.Name, cancellationToken);
        return BuildDto(group, customers);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var companyId = GetCompanyId();
        var group = await dbContext.ContactGroups.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Id == id, cancellationToken);
        if (group is null)
        {
            return false;
        }

        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(companyId.ToString()))
            .ToListAsync(cancellationToken);
        ApplyMembership(string.Empty, group.Name, new HashSet<Guid>(), customers);
        dbContext.ContactGroups.Remove(group);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("contact-group.deleted", nameof(ContactGroup), group.Id.ToString(), group.Name, cancellationToken);
        return true;
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();
    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

    private async Task EnsureReadAccessAsync(CancellationToken cancellationToken)
    {
        if (await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken)
            || await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.ManualInvoices, cancellationToken)
            || await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken))
        {
            return;
        }

        throw new InvalidOperationException("Your current package does not include Customer management.");
    }

    private static string NormalizeName(string? value)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Group name is required.");
        }

        return normalized;
    }

    private async Task EnsureUniqueNameAsync(Guid companyId, string name, Guid? excludeId, CancellationToken cancellationToken)
    {
        var normalizedName = name.ToLower();
        var exists = await dbContext.ContactGroups.AnyAsync(
            x => x.CompanyId == companyId
                && x.Id != excludeId
                && x.Name.ToLower() == normalizedName,
            cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("A contact group with this name already exists.");
        }
    }

    private static void EnsureAllContactsExist(IReadOnlyCollection<Guid> selectedContactIds, IReadOnlyCollection<Customer> customers)
    {
        var availableContactIds = customers.Select(x => x.Id).ToHashSet();
        if (selectedContactIds.Any(id => !availableContactIds.Contains(id)))
        {
            throw new InvalidOperationException("One or more selected contacts could not be found.");
        }
    }

    private static void ApplyMembership(string newName, string? oldName, IReadOnlySet<Guid> selectedContactIds, IReadOnlyCollection<Customer> customers)
    {
        foreach (var customer in customers)
        {
            var groups = DeserializeList(customer.GroupsJson);
            if (!string.IsNullOrWhiteSpace(oldName))
            {
                groups.RemoveAll(item => item.Equals(oldName, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.IsNullOrWhiteSpace(newName) && selectedContactIds.Contains(customer.Id) && !groups.Contains(newName, StringComparer.OrdinalIgnoreCase))
            {
                groups.Add(newName);
            }

            customer.GroupsJson = JsonSerializer.Serialize(groups
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
                .ToList());
            customer.UpdatedAtUtc = DateTime.UtcNow;
        }
    }

    private static List<string> DeserializeList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<string>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static ContactGroupDto BuildDto(ContactGroup group, IReadOnlyCollection<Customer> customers)
    {
        var contactIds = customers
            .Where(customer => DeserializeList(customer.GroupsJson).Contains(group.Name, StringComparer.OrdinalIgnoreCase))
            .Select(customer => customer.Id)
            .OrderBy(id => id)
            .ToArray();

        return new ContactGroupDto
        {
            Id = group.Id,
            Name = group.Name,
            ContactsCount = contactIds.Length,
            CreatedAtUtc = group.CreatedAtUtc,
            UpdatedAtUtc = group.UpdatedAtUtc,
            ContactIds = contactIds,
        };
    }
}
