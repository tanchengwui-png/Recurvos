using Recurvos.Application.Abstractions;
using Recurvos.Domain.Entities;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class AuditService(AppDbContext dbContext, ICurrentUserService currentUserService) : IAuditService
{
    public async Task WriteAsync(string action, string entityName, string entityId, string? metadata = null, CancellationToken cancellationToken = default)
    {
        if (currentUserService.CompanyId is not { } companyId)
        {
            return;
        }

        dbContext.AuditLogs.Add(new AuditLog
        {
            CompanyId = companyId,
            UserId = currentUserService.UserId,
            Action = action,
            EntityName = entityName,
            EntityId = entityId,
            Metadata = metadata
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task WriteAsync(string action, string entityName, string entityId, Guid companyId, string? metadata = null, CancellationToken cancellationToken = default)
    {
        dbContext.AuditLogs.Add(new AuditLog
        {
            CompanyId = companyId,
            UserId = currentUserService.UserId,
            Action = action,
            EntityName = entityName,
            EntityId = entityId,
            Metadata = metadata
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
