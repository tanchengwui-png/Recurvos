using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Hangfire;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Recurvos.Api.Extensions;
using Recurvos.Infrastructure;
using Recurvos.Infrastructure.Configuration;
using Recurvos.Infrastructure.Jobs;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddJwtSwagger();
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173", "http://localhost:4173"];
builder.Services.AddCors(options =>
{
    options.AddPolicy("Web", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SecretKey))
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ManageBilling", policy => policy.RequireRole("Owner", "Admin"));
    options.AddPolicy("OwnerOnly", policy => policy.RequireRole("Owner"));
    options.AddPolicy("PlatformOwnerOnly", policy => policy.RequireClaim("platformOwner", bool.TrueString));
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new
            {
                title = "Too many attempts",
                status = StatusCodes.Status429TooManyRequests,
                detail = "Too many requests from this connection. Please wait a moment and try again."
            },
            cancellationToken);
    };

    options.AddPolicy("auth-login", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"login:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("auth-register", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"register:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 4,
                Window = TimeSpan.FromMinutes(5),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("auth-refresh", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"refresh:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("auth-verify", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"verify:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 12,
                Window = TimeSpan.FromMinutes(5),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("auth-reset", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"reset:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 6,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("public-payment-confirmation", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"payment-confirmation:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 12,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("public-read", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"public-read:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("public-webhook", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"public-webhook:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var app = builder.Build();
var resetDemoData = args.Any(argument => string.Equals(argument, "--reset-demo-data", StringComparison.OrdinalIgnoreCase));

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var legacySchemaRepairService = scope.ServiceProvider.GetRequiredService<LegacySchemaRepairService>();
    if (resetDemoData)
    {
        await ResetDemoDataAsync(scope.ServiceProvider, dbContext, legacySchemaRepairService);
        return;
    }

    if (dbContext.Database.IsRelational())
    {
        await dbContext.Database.MigrateAsync();
        await legacySchemaRepairService.EnsureAsync();
    }
    else
    {
        await dbContext.Database.EnsureCreatedAsync();
    }
    await scope.ServiceProvider.GetRequiredService<DbSeeder>().SeedAsync();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseExceptionHandler(exceptionApp =>
{
    exceptionApp.Run(async context =>
    {
        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        if (exception is not null)
        {
            Console.Error.WriteLine(exception);
        }

        var (statusCode, title) = exception switch
        {
            UnauthorizedAccessException unauthorizedException when !string.IsNullOrWhiteSpace(unauthorizedException.Message)
                => (StatusCodes.Status401Unauthorized, unauthorizedException.Message),
            UnauthorizedAccessException
                => (StatusCodes.Status401Unauthorized, "You are not authorized to perform this action."),
            NullReferenceException
                => (StatusCodes.Status400BadRequest, "We couldn't create your account right now. Please try again."),
            InvalidOperationException invalidOperationException when invalidOperationException.Message.Contains("circular dependency", StringComparison.OrdinalIgnoreCase)
                => (StatusCodes.Status400BadRequest, "We couldn't create your account right now. Please try again."),
            InvalidOperationException invalidOperationException
                => (StatusCodes.Status400BadRequest, invalidOperationException.Message),
            KeyNotFoundException keyNotFoundException when !string.IsNullOrWhiteSpace(keyNotFoundException.Message)
                => (StatusCodes.Status404NotFound, keyNotFoundException.Message),
            _ => (StatusCodes.Status500InternalServerError, "Something went wrong. Please try again.")
        };

        context.Response.StatusCode = statusCode;
        await Results.Problem(statusCode: statusCode, title: title).ExecuteAsync(context);
    });
});

app.UseHttpsRedirection();
app.UseCors("Web");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseHangfireDashboard("/hangfire");

RecurringJob.AddOrUpdate<GenerateInvoicesJob>("generate-invoices", x => x.ExecuteAsync(), Cron.Hourly);
RecurringJob.AddOrUpdate<GenerateSubscriberPackageInvoicesJob>("generate-subscriber-package-invoices", x => x.ExecuteAsync(), Cron.Hourly);
RecurringJob.AddOrUpdate<ReconcileSubscriberPackageStatusesJob>("reconcile-subscriber-package-statuses", x => x.ExecuteAsync(), Cron.Hourly);
RecurringJob.AddOrUpdate<SendInvoiceRemindersJob>("send-invoice-reminders", x => x.ExecuteAsync(), Cron.Daily);
RecurringJob.AddOrUpdate<RetryFailedPaymentsJob>("retry-failed-payments", x => x.ExecuteAsync(), Cron.Hourly);
RecurringJob.AddOrUpdate<CleanupStaleSignupsJob>("cleanup-stale-signups", x => x.ExecuteAsync(), Cron.Daily);

app.MapControllers();

app.Run();

static async Task ResetDemoDataAsync(IServiceProvider services, AppDbContext dbContext, LegacySchemaRepairService legacySchemaRepairService)
{
    Console.WriteLine("Resetting Recurvos demo data...");

    if (dbContext.Database.IsRelational())
    {
        await dbContext.Database.EnsureDeletedAsync();
        await dbContext.Database.MigrateAsync();
        await legacySchemaRepairService.EnsureAsync();
    }
    else
    {
        await dbContext.Database.EnsureDeletedAsync();
        await dbContext.Database.EnsureCreatedAsync();
    }

    services.GetRequiredService<StorageResetService>().ClearAll();

    await services.GetRequiredService<DbSeeder>().SeedAsync();

    Console.WriteLine("Recurvos demo data reset complete.");
    Console.WriteLine("Seeded accounts:");
    Console.WriteLine("  Platform owner: owner@recurvo.com / P@ssw0rd!@#$%");
    Console.WriteLine("  Subscriber Basic: Recurvos-Basic@hotmail.com / P@ssw0rd!@#$%");
    Console.WriteLine("  Subscriber Growth: Recurvos-growth@hotmail.com / P@ssw0rd!@#$%");
    Console.WriteLine("  Subscriber Premium: Recurvos-premium@hotmail.com / P@ssw0rd!@#$%");
}

public partial class Program;
