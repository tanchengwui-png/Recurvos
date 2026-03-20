namespace Recurvos.Application.Abstractions;

public interface IAuditService
{
    Task WriteAsync(string action, string entityName, string entityId, string? metadata = null, CancellationToken cancellationToken = default);
    Task WriteAsync(string action, string entityName, string entityId, Guid companyId, string? metadata = null, CancellationToken cancellationToken = default);
}
