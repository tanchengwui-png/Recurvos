using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Application.Tests.Integration;

public sealed class SalesQuotationConversionIntegrationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public SalesQuotationConversionIntegrationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Theory]
    [InlineData(SalesQuotationStatus.Draft)]
    [InlineData(SalesQuotationStatus.Sent)]
    [InlineData(SalesQuotationStatus.Rejected)]
    [InlineData(SalesQuotationStatus.Expired)]
    public async Task Only_accepted_quotations_can_be_converted_to_sales_orders(SalesQuotationStatus status)
    {
        var context = await CreateQuotationAsync(status);
        var quotation = await GetQuotationAsync(context.QuotationId);

        var response = await context.Client.PostAsJsonAsync($"/api/sales/quotations/{context.QuotationId}/convert-to-sales-order", ConversionRequest(quotation.Lines.Single().Id, 1));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().Contain("accepted");
    }

    [Fact]
    public async Task Accepted_quotation_supports_partial_conversions_without_exceeding_line_quantity()
    {
        var context = await CreateQuotationAsync(SalesQuotationStatus.Accepted);

        var quotation = await GetQuotationAsync(context.QuotationId);
        var firstResponse = await context.Client.PostAsJsonAsync($"/api/sales/quotations/{context.QuotationId}/convert-to-sales-order", ConversionRequest(quotation.Lines.Single().Id, 0.4m));

        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var firstOrder = await firstResponse.Content.ReadFromJsonAsync<ConvertedOrder>(TestWebApplicationFactory.JsonOptions);
        firstOrder.Should().NotBeNull();

        var secondResponse = await context.Client.PostAsJsonAsync($"/api/sales/quotations/{context.QuotationId}/convert-to-sales-order", ConversionRequest(quotation.Lines.Single().Id, 0.6m));
        secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var excessResponse = await context.Client.PostAsJsonAsync($"/api/sales/quotations/{context.QuotationId}/convert-to-sales-order", ConversionRequest(quotation.Lines.Single().Id, 0.1m));
        excessResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await excessResponse.Content.ReadAsStringAsync()).Should().Contain("remaining quantity");

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var quotation = await db.SalesQuotations.SingleAsync(x => x.Id == context.QuotationId);
        quotation.Status.Should().Be(SalesQuotationStatus.Accepted);
        quotation.ConvertedSalesOrderId.Should().BeNull();
        (await db.SalesOrders.CountAsync(x => x.SalesQuotationId == context.QuotationId)).Should().Be(2);
    }

    [Fact]
    public async Task Conversion_is_scoped_to_the_active_company()
    {
        var context = await CreateQuotationAsync(SalesQuotationStatus.Accepted);
        Guid otherCompanyId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var owner = await db.Users.SingleAsync(x => x.Email == "recurvos-basic@hotmail.com");
            var otherCompany = new Company
            {
                SubscriberId = owner.Id,
                Name = "Quotation isolation company",
                RegistrationNumber = "QUOTE-ISO-001",
                Email = "quotation-isolation@example.test",
                Phone = "+60000000003",
                Address = "B",
                IsActive = true,
            };
            db.Companies.Add(otherCompany);
            db.CompanyMemberships.Add(new CompanyMembership { UserId = owner.Id, Company = otherCompany, Role = CompanyMembershipRole.Owner, IsActive = true });
            await db.SaveChangesAsync();
            otherCompanyId = otherCompany.Id;
        }

        context.Client.DefaultRequestHeaders.Remove("X-Recurvos-Company-Id");
        context.Client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", otherCompanyId.ToString());
        var response = await context.Client.PostAsJsonAsync($"/api/sales/quotations/{context.QuotationId}/convert-to-sales-order", ConversionRequest(Guid.NewGuid(), 1));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private async Task<(HttpClient Client, Guid QuotationId)> CreateQuotationAsync(SalesQuotationStatus status)
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        Guid companyId;
        Guid quotationId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            companyId = await db.Users.Where(x => x.Email == "recurvos-basic@hotmail.com").Select(x => x.CompanyId).SingleAsync();
            var quotation = new SalesQuotation
            {
                CompanyId = companyId,
                QuotationNumber = $"TEST-QT-{Guid.NewGuid():N}",
                ContactId = Guid.NewGuid(),
                ContactName = "Conversion test customer",
                DocumentDateUtc = DateTime.UtcNow,
                Currency = "MYR",
                Status = status,
                Lines = [new SalesQuotationLine { SortOrder = 1, Description = "Test item", Quantity = 1, UnitPrice = 10, LineTotal = 10 }],
                Subtotal = 10,
                TotalAmount = 10,
            };
            db.SalesQuotations.Add(quotation);
            await db.SaveChangesAsync();
            quotationId = quotation.Id;
        }

        var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", companyId.ToString());
        return (client, quotationId);
    }

    private async Task<QuotationDetails> GetQuotationAsync(Guid quotationId)
    {
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var companyId = await db.SalesQuotations.Where(x => x.Id == quotationId).Select(x => x.CompanyId).SingleAsync();
        var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        client.DefaultRequestHeaders.Add("X-Recurvos-Company-Id", companyId.ToString());
        return (await client.GetFromJsonAsync<QuotationDetails>($"/api/sales/quotations/{quotationId}", TestWebApplicationFactory.JsonOptions))!;
    }

    private static object ConversionRequest(Guid lineId, decimal quantity) => new { documentDateUtc = DateTime.UtcNow, referenceNo = "", notes = "", lines = new[] { new { salesQuotationLineId = lineId, quantity } } };

    private sealed record ConvertedOrder(Guid Id, string SalesOrderNumber);
    private sealed record QuotationDetails(IReadOnlyCollection<QuotationLine> Lines);
    private sealed record QuotationLine(Guid Id);
}
