using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Application.Tests.Integration;

public sealed class SalesPaymentAllocationIntegrationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public SalesPaymentAllocationIntegrationTests(TestWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task CreateSalesPayment_CreatesOneHeaderAndManyAllocations()
    {
        await _factory.EnsureSeededAsync();
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var customer = await db.Customers.FirstAsync();
        var invoices = new[] { CreateInvoice(customer, "T-PAY-1"), CreateInvoice(customer, "T-PAY-2") };
        db.Invoices.AddRange(invoices); await db.SaveChangesAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        var response = await TestWebApplicationFactory.Authorize(_factory.CreateClient(), token).PostAsJsonAsync("/api/payments", new { customerId = customer.Id, paymentDateUtc = DateTime.UtcNow, method = "Bank transfer", allocations = new[] { new { invoiceId = invoices[0].Id, amount = 600m }, new { invoiceId = invoices[1].Id, amount = 400m } } });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var payment = await db.Payments.Include(x => x.Allocations).OrderByDescending(x => x.CreatedAtUtc).FirstAsync();
        payment.Amount.Should().Be(1000m); payment.InvoiceId.Should().BeNull(); payment.Allocations.Should().HaveCount(2);
    }

    [Fact]
    public async Task CreateSalesPayment_RejectsDuplicateAllocationWithoutPersistingPayment()
    {
        await _factory.EnsureSeededAsync(); await using var scope = _factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var customer = await db.Customers.FirstAsync(); var invoice = CreateInvoice(customer, "T-PAY-DUP"); db.Invoices.Add(invoice); await db.SaveChangesAsync(); var count = await db.Payments.CountAsync(); var token = await _factory.LoginAsSubscriberOwnerAsync();
        var response = await TestWebApplicationFactory.Authorize(_factory.CreateClient(), token).PostAsJsonAsync("/api/payments", new { customerId = customer.Id, paymentDateUtc = DateTime.UtcNow, method = "Bank transfer", allocations = new[] { new { invoiceId = invoice.Id, amount = 100m }, new { invoiceId = invoice.Id, amount = 200m } } });
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest); (await db.Payments.CountAsync()).Should().Be(count);
    }

    [Fact]
    public async Task CreateSalesPayment_CreatesLegacyInvoiceLinkForOneAllocation()
    {
        await _factory.EnsureSeededAsync(); await using var scope = _factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var customer = await db.Customers.FirstAsync(); var invoice = CreateInvoice(customer, "T-PAY-SINGLE"); db.Invoices.Add(invoice); await db.SaveChangesAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        var response = await TestWebApplicationFactory.Authorize(_factory.CreateClient(), token).PostAsJsonAsync("/api/payments", new { customerId = customer.Id, paymentDateUtc = DateTime.UtcNow, method = "Bank transfer", allocations = new[] { new { invoiceId = invoice.Id, amount = 400m } } });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var payment = await db.Payments.Include(x => x.Allocations).OrderByDescending(x => x.CreatedAtUtc).FirstAsync();
        payment.Amount.Should().Be(400m); payment.InvoiceId.Should().Be(invoice.Id); payment.Allocations.Should().ContainSingle(x => x.InvoiceId == invoice.Id && x.Amount == 400m);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task CreateSalesPayment_RejectsNonPositiveAllocationWithoutPersisting(decimal amount)
    {
        await _factory.EnsureSeededAsync(); await using var scope = _factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var customer = await db.Customers.FirstAsync(); var invoice = CreateInvoice(customer, $"T-PAY-NONPOS-{amount}"); db.Invoices.Add(invoice); await db.SaveChangesAsync(); var paymentCount = await db.Payments.CountAsync(); var allocationCount = await db.SalesPaymentAllocations.CountAsync(); var token = await _factory.LoginAsSubscriberOwnerAsync();
        var response = await TestWebApplicationFactory.Authorize(_factory.CreateClient(), token).PostAsJsonAsync("/api/payments", new { customerId = customer.Id, paymentDateUtc = DateTime.UtcNow, method = "Bank transfer", allocations = new[] { new { invoiceId = invoice.Id, amount } } });
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest); (await db.Payments.CountAsync()).Should().Be(paymentCount); (await db.SalesPaymentAllocations.CountAsync()).Should().Be(allocationCount);
    }

    [Fact]
    public async Task CreateSalesPayment_RejectsMissingOrOtherCustomerInvoiceWithoutPersisting()
    {
        await _factory.EnsureSeededAsync(); await using var scope = _factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var customer = await db.Customers.FirstAsync(); var otherCustomer = new Customer { CompanyId = customer.CompanyId, Name = "Other payment customer" }; var otherInvoice = CreateInvoice(otherCustomer, "T-PAY-OTHER"); db.Customers.Add(otherCustomer); db.Invoices.Add(otherInvoice); await db.SaveChangesAsync(); var paymentCount = await db.Payments.CountAsync(); var allocationCount = await db.SalesPaymentAllocations.CountAsync(); var token = await _factory.LoginAsSubscriberOwnerAsync(); var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        var missing = await client.PostAsJsonAsync("/api/payments", new { customerId = customer.Id, paymentDateUtc = DateTime.UtcNow, method = "Bank transfer", allocations = new[] { new { invoiceId = Guid.NewGuid(), amount = 1m } } });
        var otherCustomerResponse = await client.PostAsJsonAsync("/api/payments", new { customerId = customer.Id, paymentDateUtc = DateTime.UtcNow, method = "Bank transfer", allocations = new[] { new { invoiceId = otherInvoice.Id, amount = 1m } } });
        missing.StatusCode.Should().Be(HttpStatusCode.BadRequest); otherCustomerResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest); (await db.Payments.CountAsync()).Should().Be(paymentCount); (await db.SalesPaymentAllocations.CountAsync()).Should().Be(allocationCount);
    }

    private static Invoice CreateInvoice(Customer customer, string number) => new() { CompanyId = customer.CompanyId, CustomerId = customer.Id, InvoiceNumber = number, Currency = "MYR", Status = InvoiceStatus.Open, IssueDateUtc = DateTime.UtcNow, DueDateUtc = DateTime.UtcNow.AddDays(7), Total = 1000m, AmountDue = 1000m };
}
