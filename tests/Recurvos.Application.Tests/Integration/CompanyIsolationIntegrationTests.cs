using System.Net;
using System.Net.Http.Json;
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

    [Fact]
    public async Task Factory_reset_preserves_the_company_and_shared_contacts_but_clears_only_its_workspace_data()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();

        Guid companyAId;
        Guid companyBId;
        Guid companyBContactId;
        string companyAName;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var owner = await db.Users.SingleAsync(x => x.Email == "recurvos-basic@hotmail.com");
            companyAId = owner.CompanyId;
            companyAName = await db.Companies.Where(x => x.Id == companyAId).Select(x => x.Name).SingleAsync();
            var companyB = new Company
            {
                SubscriberId = owner.Id, Name = "Reset Isolation B", RegistrationNumber = "RESET-B-001",
                Email = "reset-b@example.test", Phone = "+60000000002", Address = "B", IsActive = true,
            };
            db.Companies.Add(companyB);
            db.CompanyMemberships.Add(new CompanyMembership { UserId = owner.Id, Company = companyB, Role = CompanyMembershipRole.Owner, IsActive = true });
            db.Products.Add(new Product { CompanyId = companyAId, Name = "Resettable product", Code = "RESET-A", IsActive = true });
            db.Products.Add(new Product { Company = companyB, Name = "Other workspace product", Code = "RESET-B", IsActive = true });
            db.Accounts.Add(new Account { CompanyId = companyAId, Code = "RESET-ACCOUNT", Name = "Resettable account" });
            db.SalesQuotations.Add(new SalesQuotation
            {
                CompanyId = companyAId, QuotationNumber = "RESET-Q-001", ContactId = Guid.NewGuid(), ContactName = "Reset contact", DocumentDateUtc = DateTime.UtcNow,
            });
            var companyBContact = new Customer
            {
                SubscriberId = owner.Id,
                Name = "Shared contact",
                CompanyId = companyB.Id,
            };
            db.Customers.Add(companyBContact);
            await db.SaveChangesAsync();
            companyBId = companyB.Id;
            companyBContactId = companyBContact.Id;
        }

        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", companyAId.ToString());
        var resetResponse = await client.PostAsJsonAsync($"/api/companies/{companyAId}/factory-reset", new { confirmationText = companyAName });
        resetResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var verificationScope = _factory.Services.CreateAsyncScope();
        var verificationDb = verificationScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var companyA = await verificationDb.Companies.SingleAsync(x => x.Id == companyAId);
        companyA.Name.Should().Be(companyAName);
        (await verificationDb.CompanyMemberships.CountAsync(x => x.CompanyId == companyAId && x.UserId == companyA.SubscriberId)).Should().Be(1);
        (await verificationDb.Products.AnyAsync(x => x.CompanyId == companyAId && x.Code == "RESET-A")).Should().BeFalse();
        (await verificationDb.SalesQuotations.AnyAsync(x => x.CompanyId == companyAId)).Should().BeFalse();
        (await verificationDb.Products.AnyAsync(x => x.CompanyId == companyBId && x.Code == "RESET-B")).Should().BeTrue();
        var companyBContact = await verificationDb.Customers.SingleAsync(x => x.Id == companyBContactId);
        companyBContact.CompanyId.Should().Be(companyBId);
        (await verificationDb.Accounts.AnyAsync(x => x.CompanyId == companyAId && x.Code == "1100")).Should().BeTrue();
        (await verificationDb.AuditLogs.AnyAsync(x => x.CompanyId == companyAId && x.Action == "company.factory-reset")).Should().BeTrue();
    }
}
