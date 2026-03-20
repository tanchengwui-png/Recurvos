namespace Recurvos.Application.Platform;

public interface IPackageLimitService
{
    Task EnsureCanCreateCompanyAsync(CancellationToken cancellationToken = default);
    Task EnsureCanCreateProductAsync(CancellationToken cancellationToken = default);
    Task EnsureCanCreatePlanAsync(CancellationToken cancellationToken = default);
    Task EnsureCanCreateCustomerAsync(CancellationToken cancellationToken = default);
    Task<int> GetWhatsAppReminderMonthlyLimitAsync(Guid companyId, CancellationToken cancellationToken = default);
}
