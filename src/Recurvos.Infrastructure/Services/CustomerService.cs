using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Customers;
using Recurvos.Application.Features;
using Recurvos.Application.Platform;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class CustomerService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService,
    IPackageLimitService packageLimitService) : ICustomerService
{
    public async Task<IReadOnlyCollection<CustomerDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        return await dbContext.Customers
            .Where(x => x.SubscriberId == GetSubscriberId())
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => new CustomerDto(x.Id, x.Name, x.Email, x.PhoneNumber, x.ExternalReference, x.BillingAddress))
            .ToListAsync(cancellationToken);
    }

    public async Task<CustomerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        return await dbContext.Customers
            .Where(x => x.SubscriberId == GetSubscriberId() && x.Id == id)
            .Select(x => new CustomerDto(x.Id, x.Name, x.Email, x.PhoneNumber, x.ExternalReference, x.BillingAddress))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<CustomerDto> CreateAsync(CustomerRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        await packageLimitService.EnsureCanCreateCustomerAsync(cancellationToken);
        var customer = new Customer
        {
            SubscriberId = GetSubscriberId(),
            Name = request.Name,
            Email = request.Email,
            PhoneNumber = request.PhoneNumber,
            ExternalReference = request.ExternalReference,
            BillingAddress = request.BillingAddress
        };

        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("customer.created", nameof(Customer), customer.Id.ToString(), customer.Name, cancellationToken);
        return new CustomerDto(customer.Id, customer.Name, customer.Email, customer.PhoneNumber, customer.ExternalReference, customer.BillingAddress);
    }

    public async Task<CustomerDto?> UpdateAsync(Guid id, CustomerRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == id, cancellationToken);
        if (customer is null)
        {
            return null;
        }

        customer.Name = request.Name;
        customer.Email = request.Email;
        customer.PhoneNumber = request.PhoneNumber;
        customer.ExternalReference = request.ExternalReference;
        customer.BillingAddress = request.BillingAddress;
        customer.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("customer.updated", nameof(Customer), customer.Id.ToString(), customer.Name, cancellationToken);
        return new CustomerDto(customer.Id, customer.Name, customer.Email, customer.PhoneNumber, customer.ExternalReference, customer.BillingAddress);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == id, cancellationToken);
        if (customer is null)
        {
            return false;
        }

        dbContext.Customers.Remove(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("customer.deleted", nameof(Customer), customer.Id.ToString(), customer.Name, cancellationToken);
        return true;
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

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
}
