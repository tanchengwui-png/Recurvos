using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Application.Tests.Integration;

/// <summary>Regression coverage for the active-company middleware and scoped product reads.</summary>
public sealed class CompanyIsolationIntegrationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public CompanyIsolationIntegrationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Active_company_header_limits_product_lists_and_rejects_non_memberships()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();

        Guid companyAId;
        Guid companyBId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var owner = await db.Users.SingleAsync(x => x.Email == "recurvos-basic@hotmail.com");
            companyAId = owner.CompanyId;
            var companyB = new Company
            {
                SubscriberId = owner.Id, Name = "Isolation Company B", RegistrationNumber = "ISO-B-001",
                Email = "isolation-b@example.test", Phone = "+60000000002", Address = "B", IsActive = true,
            };
            db.Companies.Add(companyB);
            db.CompanyMemberships.Add(new CompanyMembership { UserId = owner.Id, Company = companyB, Role = CompanyMembershipRole.Owner, IsActive = true });
            db.Products.Add(new Product { CompanyId = companyAId, Name = "Company A Only", Code = "ISO-A", IsActive = true });
            db.Products.Add(new Product { Company = companyB, Name = "Company B Only", Code = "ISO-B", IsActive = true });
            await db.SaveChangesAsync();
            companyBId = companyB.Id;
        }

        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", companyAId.ToString());
        var companyAProducts = await (await client.GetAsync("/api/products")).Content.ReadAsStringAsync();
        companyAProducts.Should().Contain("ISO-A");
        companyAProducts.Should().NotContain("ISO-B");

        client.DefaultRequestHeaders.Remove("X-Recurvos-Company-Id");
        client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", companyBId.ToString());
        var companyBProducts = await (await client.GetAsync("/api/products")).Content.ReadAsStringAsync();
        companyBProducts.Should().Contain("ISO-B");
        companyBProducts.Should().NotContain("ISO-A");

        client.DefaultRequestHeaders.Remove("X-Recurvos-Company-Id");
        client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", Guid.NewGuid().ToString());
        (await client.GetAsync("/api/products")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
