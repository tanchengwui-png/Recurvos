using Microsoft.EntityFrameworkCore;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class StaleSignupCleanupService(AppDbContext dbContext)
{
    public static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public async Task<int> CleanupAsync(CancellationToken cancellationToken = default)
    {
        var cutoffUtc = DateTime.UtcNow.Subtract(RetentionWindow);
        var staleCompanies = await dbContext.Companies
            .Where(x =>
                !x.IsPlatformAccount &&
                x.PackageStatus == "pending_verification" &&
                x.CreatedAtUtc <= cutoffUtc)
            .ToListAsync(cancellationToken);

        if (staleCompanies.Count == 0)
        {
            return 0;
        }

        dbContext.Companies.RemoveRange(staleCompanies);
        await dbContext.SaveChangesAsync(cancellationToken);
        return staleCompanies.Count;
    }
}
