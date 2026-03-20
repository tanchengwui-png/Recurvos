using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Payments;
using Recurvos.Application.Webhooks;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Application.Tests.Integration;

public sealed class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName = $"recurvos-tests-{Guid.NewGuid():N}";
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<AppDbContext>();
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IPaymentGateway>();
            services.RemoveAll<IEmailSender>();

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase(_databaseName));

            services.AddSingleton<FakeEmailSender>();
            services.AddSingleton<IEmailSender>(sp => sp.GetRequiredService<FakeEmailSender>());
            services.AddSingleton<IPaymentGateway, FakePaymentGateway>();
        });
    }

    public async Task<string> LoginAsSubscriberOwnerAsync()
    {
        await EnsureSeededAsync();
        using var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "tanchengwui+basic@hotmail.com",
            password = "Passw0rd!"
        });
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<TestAuthResponse>(JsonOptions);
        return auth!.AccessToken;
    }

    public async Task EnsureSeededAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await dbContext.Database.EnsureCreatedAsync();
        await scope.ServiceProvider.GetRequiredService<DbSeeder>().SeedAsync();
    }

    public static HttpClient Authorize(HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}

public sealed class FakeEmailSender : IEmailSender
{
    public List<(string To, string Subject, string Body, IReadOnlyCollection<EmailAttachment> Attachments)> Sent { get; } = [];

    public Task SendAsync(string to, string subject, string body, IReadOnlyCollection<EmailAttachment>? attachments = null, CancellationToken cancellationToken = default)
    {
        Sent.Add((to, subject, body, attachments ?? Array.Empty<EmailAttachment>()));
        return Task.CompletedTask;
    }

    public string GetLatestVerificationToken(string email)
    {
        var message = Sent.LastOrDefault(x => string.Equals(x.To, email, StringComparison.OrdinalIgnoreCase));
        if (message == default)
        {
            throw new InvalidOperationException($"No email sent to {email}.");
        }

        var match = Regex.Match(message.Body, @"verify-email\?token=([^""&<]+)");
        if (!match.Success)
        {
            throw new InvalidOperationException("Verification token not found in email body.");
        }

        return Uri.UnescapeDataString(match.Groups[1].Value);
    }

    public string GetLatestPasswordResetToken(string email)
    {
        var message = Sent.LastOrDefault(x =>
            string.Equals(x.To, email, StringComparison.OrdinalIgnoreCase) &&
            x.Subject.Contains("Reset your Recurvo password", StringComparison.OrdinalIgnoreCase));
        if (message == default)
        {
            throw new InvalidOperationException($"No password reset email sent to {email}.");
        }

        var match = Regex.Match(message.Body, @"reset-password\?token=([^""&<]+)");
        if (!match.Success)
        {
            throw new InvalidOperationException("Password reset token not found in email body.");
        }

        return Uri.UnescapeDataString(match.Groups[1].Value);
    }
}

public sealed class FakePaymentGateway : IPaymentGateway
{
    public string Name => "Billplz";

    public Task<PaymentLinkResult> CreatePaymentLinkAsync(CreatePaymentLinkCommand command, CancellationToken cancellationToken = default)
        => Task.FromResult(new PaymentLinkResult($"fake_{command.InvoiceNumber}", $"https://payments.test/{command.InvoiceNumber}", "{}"));

    public Task<WebhookParseResult> ParseWebhookAsync(string payload, IDictionary<string, string> headers, CancellationToken cancellationToken = default)
    {
        var paymentId = System.Text.Json.JsonDocument.Parse(payload).RootElement.GetProperty("paymentId").GetString()!;
        var eventId = System.Text.Json.JsonDocument.Parse(payload).RootElement.GetProperty("eventId").GetString()!;
        var succeeded = System.Text.Json.JsonDocument.Parse(payload).RootElement.GetProperty("succeeded").GetBoolean();
        return Task.FromResult(new WebhookParseResult(eventId, succeeded ? "payment.succeeded" : "payment.failed", paymentId, succeeded, payload));
    }
}

public sealed record TestAuthResponse(string AccessToken);
