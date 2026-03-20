namespace Recurvos.Application.Settings;

public sealed record BillingReadinessItemDto(
    string Key,
    string Title,
    string Description,
    bool Required,
    bool Done,
    string ActionPath);

public sealed record BillingReadinessDto(
    Guid? CompanyId,
    bool IsReady,
    IReadOnlyCollection<BillingReadinessItemDto> Items)
{
    public IReadOnlyCollection<BillingReadinessItemDto> MissingRequiredItems =>
        Items.Where(x => x.Required && !x.Done).ToList();
}

public interface IBillingReadinessService
{
    Task<BillingReadinessDto> GetAsync(Guid? companyId = null, CancellationToken cancellationToken = default);
    Task<BillingReadinessDto> GetForCompanyAsync(Guid companyId, CancellationToken cancellationToken = default);
    Task EnsureReadyAsync(Guid companyId, string operationName, CancellationToken cancellationToken = default);
}
