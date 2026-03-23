using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Recurvos.Application.Auth;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class RegistrationGuardService(
    IMemoryCache memoryCache,
    IHttpContextAccessor httpContextAccessor,
    AppDbContext dbContext) : IRegistrationGuardService
{
    private static readonly TimeSpan SuccessfulRegistrationWindow = TimeSpan.FromHours(24);
    private static readonly TimeSpan FingerprintAttemptWindow = TimeSpan.FromHours(1);
    private const int SuccessfulRegistrationLimitPerIp = 3;
    private const int FingerprintAttemptLimit = 3;

    public async Task ValidateAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            throw new InvalidOperationException("We couldn't create your account right now. Please try again.");
        }

        var remoteIp = ResolveRemoteIp();
        if (GetCounter($"register-success:{remoteIp}") >= SuccessfulRegistrationLimitPerIp)
        {
            throw new InvalidOperationException("Too many accounts were created from this connection. Please contact support if you need help.");
        }

        var normalizedCompanyEmail = Normalize(request.CompanyEmail);
        var normalizedRegistrationNumber = request.RegistrationNumber.Trim().ToUpperInvariant();
        var normalizedUserEmail = Normalize(request.Email);
        var fingerprintKey = $"register-fingerprint:{remoteIp}:{normalizedUserEmail}:{normalizedCompanyEmail}:{normalizedRegistrationNumber}";

        if (IncrementCounter(fingerprintKey, FingerprintAttemptWindow) > FingerprintAttemptLimit)
        {
            throw new InvalidOperationException("Too many signup attempts for the same details. Please wait a while and try again.");
        }

        if (await dbContext.Companies.AnyAsync(x => x.Email == normalizedCompanyEmail, cancellationToken))
        {
            throw new InvalidOperationException("A company with this billing email already exists.");
        }

        if (!string.IsNullOrWhiteSpace(normalizedRegistrationNumber) &&
            await dbContext.Companies.AnyAsync(x => x.RegistrationNumber == normalizedRegistrationNumber, cancellationToken))
        {
            throw new InvalidOperationException("A company with this registration number already exists.");
        }
    }

    public void MarkSuccessfulRegistration()
    {
        var remoteIp = ResolveRemoteIp();
        IncrementCounter($"register-success:{remoteIp}", SuccessfulRegistrationWindow);
    }

    private int GetCounter(string key) => memoryCache.TryGetValue<int>(key, out var current) ? current : 0;

    private int IncrementCounter(string key, TimeSpan window)
    {
        var next = GetCounter(key) + 1;
        memoryCache.Set(key, next, window);
        return next;
    }

    private string ResolveRemoteIp() => httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static string Normalize(string value) => value.Trim().ToLowerInvariant();
}
