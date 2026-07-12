using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Recurvos.Application.Finance;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Application.Tests.Integration;

public sealed class StatementIntegrationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public StatementIntegrationTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task CustomerStatement_ComputesOpeningBalance_RunningBalance_Aging_And_PreservesContactPersonContract()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        var companyId = Guid.Parse(ParseJwtClaim(token, "companyId"));
        var subscriberId = Guid.Parse(ParseJwtClaim(token, ClaimTypes.NameIdentifier));
        var contactId = Guid.NewGuid();
        var fromDate = new DateTime(2026, 4, 1, 0, 0, 0, DateTimeKind.Utc);
        var toDate = new DateTime(2026, 4, 30, 23, 59, 59, DateTimeKind.Utc);
        var now = DateTime.UtcNow;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            dbContext.Customers.Add(new Customer
            {
                Id = contactId,
                SubscriberId = subscriberId,
                Name = "Acme Customer",
                LegalName = "Acme Customer Sdn Bhd",
                ContactType = "Customer",
                Currency = "MYR",
                ContactPersonsJson = """[{"Name":"Jane Doe","Role":"Manager","Email":"jane@example.com","PhoneNumber":"+60120000000"}]""",
                CreatedAtUtc = now,
            });

            var openingInvoiceId = Guid.NewGuid();
            var rangedInvoiceId = Guid.NewGuid();
            var settledInvoiceId = Guid.NewGuid();
            var paymentId = Guid.NewGuid();
            var settledPaymentId = Guid.NewGuid();
            var creditNoteId = Guid.NewGuid();
            var refundId = Guid.NewGuid();

            dbContext.Invoices.AddRange(
                new Invoice
                {
                    Id = openingInvoiceId,
                    CompanyId = companyId,
                    CustomerId = contactId,
                    InvoiceNumber = "INV-OPEN",
                    Status = InvoiceStatus.Open,
                    IssueDateUtc = new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(-45),
                    Subtotal = 100m,
                    TaxAmount = 0m,
                    Total = 100m,
                    AmountDue = 100m,
                    AmountPaid = 0m,
                    Currency = "MYR",
                    CreatedAtUtc = now,
                },
                new Invoice
                {
                    Id = rangedInvoiceId,
                    CompanyId = companyId,
                    CustomerId = contactId,
                    InvoiceNumber = "INV-RANGE",
                    Status = InvoiceStatus.Open,
                    IssueDateUtc = new DateTime(2026, 4, 5, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(1),
                    Subtotal = 200m,
                    TaxAmount = 0m,
                    Total = 200m,
                    AmountDue = 140m,
                    AmountPaid = 60m,
                    Currency = "MYR",
                    CreatedAtUtc = now,
                },
                new Invoice
                {
                    Id = settledInvoiceId,
                    CompanyId = companyId,
                    CustomerId = contactId,
                    InvoiceNumber = "INV-SETTLED",
                    Status = InvoiceStatus.Paid,
                    IssueDateUtc = new DateTime(2026, 4, 10, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(-5),
                    Subtotal = 80m,
                    TaxAmount = 0m,
                    Total = 80m,
                    AmountDue = 0m,
                    AmountPaid = 80m,
                    Currency = "MYR",
                    CreatedAtUtc = now,
                });

            dbContext.Payments.AddRange(
                new Payment
                {
                    Id = paymentId,
                    CompanyId = companyId,
                    InvoiceId = rangedInvoiceId,
                    Status = PaymentStatus.Succeeded,
                    Amount = 50m,
                    Currency = "MYR",
                    GatewayName = "Billplz",
                    ExternalPaymentId = "PAY-RANGE",
                    PaidAtUtc = new DateTime(2026, 4, 8, 0, 0, 0, DateTimeKind.Utc),
                    CreatedAtUtc = now,
                },
                new Payment
                {
                    Id = settledPaymentId,
                    CompanyId = companyId,
                    InvoiceId = settledInvoiceId,
                    Status = PaymentStatus.Succeeded,
                    Amount = 80m,
                    Currency = "MYR",
                    GatewayName = "Billplz",
                    ExternalPaymentId = "PAY-SETTLED",
                    PaidAtUtc = new DateTime(2026, 4, 12, 0, 0, 0, DateTimeKind.Utc),
                    CreatedAtUtc = now,
                });

            dbContext.CreditNotes.Add(new CreditNote
            {
                Id = creditNoteId,
                CompanyId = companyId,
                InvoiceId = rangedInvoiceId,
                CustomerId = contactId,
                CreditNoteNumber = "CN-001",
                Currency = "MYR",
                SubtotalReduction = 20m,
                TaxReduction = 0m,
                TotalReduction = 20m,
                Reason = "Price adjustment",
                Status = CreditNoteStatus.Issued,
                IssuedAtUtc = new DateTime(2026, 4, 9, 0, 0, 0, DateTimeKind.Utc),
                CreatedAtUtc = now,
            });

            dbContext.Refunds.Add(new Refund
            {
                Id = refundId,
                CompanyId = companyId,
                PaymentId = paymentId,
                InvoiceId = rangedInvoiceId,
                Amount = 10m,
                Currency = "MYR",
                Reason = "Customer overpayment refund",
                ExternalRefundId = "REF-001",
                Status = RefundStatus.Succeeded,
            });

            await dbContext.SaveChangesAsync();
            var savedRefund = await dbContext.Refunds.FirstAsync(x => x.Id == refundId);
            savedRefund.CreatedAtUtc = new DateTime(2026, 4, 11, 0, 0, 0, DateTimeKind.Utc);
            await dbContext.SaveChangesAsync();
        }

        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var response = await client.GetAsync(
            $"/api/statements?contactId={contactId:D}&statementType=Customer&fromDateUtc={Uri.EscapeDataString(fromDate.ToString("O"))}&toDateUtc={Uri.EscapeDataString(toDate.ToString("O"))}&contactPerson=Jane%20Doe");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<StatementOfAccountDto>(TestWebApplicationFactory.JsonOptions);

        report.Should().NotBeNull();
        report!.StatementType.Should().Be(StatementAccountType.Customer);
        report.ContactId.Should().Be(contactId);
        report.OpeningBalance.Should().Be(100m);
        report.ClosingBalance.Should().Be(240m);
        report.HasOpeningBalance.Should().BeTrue();

        report.Rows.Select(x => x.DocumentNumber).Should().ContainInOrder("OPENING", "INV-RANGE", "PAY-RANGE", "CN-001", "INV-SETTLED", "REF-001", "PAY-SETTLED");
        report.Rows.Select(x => x.Balance).Should().ContainInOrder(100m, 300m, 250m, 230m, 310m, 320m, 240m);

        report.Aging.Current.Should().Be(140m);
        report.Aging.Days31To60.Should().Be(100m);
        report.Aging.TotalOutstanding.Should().Be(240m);
    }

    [Fact]
    public async Task CustomerStatement_OutstandingOnly_ExcludesSettledInvoiceTransactions()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        var companyId = Guid.Parse(ParseJwtClaim(token, "companyId"));
        var subscriberId = Guid.Parse(ParseJwtClaim(token, ClaimTypes.NameIdentifier));
        var contactId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            dbContext.Customers.Add(new Customer
            {
                Id = contactId,
                SubscriberId = subscriberId,
                Name = "Outstanding Filter Customer",
                LegalName = "Outstanding Filter Customer Sdn Bhd",
                ContactType = "Customer",
                Currency = "MYR",
                CreatedAtUtc = now,
            });

            var openInvoiceId = Guid.NewGuid();
            var paidInvoiceId = Guid.NewGuid();
            dbContext.Invoices.AddRange(
                new Invoice
                {
                    Id = openInvoiceId,
                    CompanyId = companyId,
                    CustomerId = contactId,
                    InvoiceNumber = "INV-OPEN-ONLY",
                    Status = InvoiceStatus.Open,
                    IssueDateUtc = new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(-2),
                    Total = 150m,
                    AmountDue = 150m,
                    Currency = "MYR",
                    CreatedAtUtc = now,
                },
                new Invoice
                {
                    Id = paidInvoiceId,
                    CompanyId = companyId,
                    CustomerId = contactId,
                    InvoiceNumber = "INV-PAID-ONLY",
                    Status = InvoiceStatus.Paid,
                    IssueDateUtc = new DateTime(2026, 5, 2, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(-1),
                    Total = 75m,
                    AmountDue = 0m,
                    AmountPaid = 75m,
                    Currency = "MYR",
                    CreatedAtUtc = now,
                });

            dbContext.Payments.Add(new Payment
            {
                Id = Guid.NewGuid(),
                CompanyId = companyId,
                InvoiceId = paidInvoiceId,
                Status = PaymentStatus.Succeeded,
                Amount = 75m,
                Currency = "MYR",
                GatewayName = "Billplz",
                ExternalPaymentId = "PAY-PAID-ONLY",
                PaidAtUtc = new DateTime(2026, 5, 3, 0, 0, 0, DateTimeKind.Utc),
                CreatedAtUtc = now,
            });

            await dbContext.SaveChangesAsync();
        }

        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        var response = await client.GetAsync($"/api/statements?contactId={contactId:D}&statementType=Customer&includeOutstandingOnly=true");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<StatementOfAccountDto>(TestWebApplicationFactory.JsonOptions);

        report.Should().NotBeNull();
        report!.Rows.Should().ContainSingle();
        report.Rows.Single().DocumentNumber.Should().Be("INV-OPEN-ONLY");
        report.Rows.Single().Balance.Should().Be(150m);
    }

    [Fact]
    public async Task SupplierStatement_ComputesBills_Payments_Credits_Refunds_RunningBalance_And_Aging()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        var companyId = Guid.Parse(ParseJwtClaim(token, "companyId"));
        var subscriberId = Guid.Parse(ParseJwtClaim(token, ClaimTypes.NameIdentifier));
        var contactId = Guid.NewGuid();
        var fromDate = new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc);
        var toDate = new DateTime(2026, 6, 30, 23, 59, 59, DateTimeKind.Utc);
        var now = DateTime.UtcNow;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            dbContext.Customers.Add(new Customer
            {
                Id = contactId,
                SubscriberId = subscriberId,
                Name = "Supply Partner",
                LegalName = "Supply Partner Sdn Bhd",
                ContactType = "Supplier",
                Currency = "MYR",
                CreatedAtUtc = now,
            });

            var openingBillId = Guid.NewGuid();
            var rangedBillId = Guid.NewGuid();
            var paymentId = Guid.NewGuid();
            var paymentAllocationId = Guid.NewGuid();
            var creditNoteId = Guid.NewGuid();
            var refundId = Guid.NewGuid();
            var refundAllocationId = Guid.NewGuid();

            dbContext.PurchaseBills.AddRange(
                new PurchaseBill
                {
                    Id = openingBillId,
                    CompanyId = companyId,
                    ContactId = contactId,
                    ContactName = "Supply Partner",
                    PurchaseBillNumber = "PB-OPEN",
                    Currency = "MYR",
                    IssueDateUtc = new DateTime(2026, 5, 15, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(-75),
                    Status = PurchaseBillStatus.Issued,
                    TotalAmount = 300m,
                    AmountDue = 300m,
                    AmountPaid = 0m,
                    CreatedFromDocumentId = Guid.NewGuid(),
                    CreatedFromDocumentNumber = "PO-OPEN",
                    CreatedFromDocumentType = "PurchaseOrder",
                    CreatedAtUtc = now,
                },
                new PurchaseBill
                {
                    Id = rangedBillId,
                    CompanyId = companyId,
                    ContactId = contactId,
                    ContactName = "Supply Partner",
                    PurchaseBillNumber = "PB-RANGE",
                    Currency = "MYR",
                    IssueDateUtc = new DateTime(2026, 6, 5, 0, 0, 0, DateTimeKind.Utc),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(-10),
                    Status = PurchaseBillStatus.PartiallyPaid,
                    TotalAmount = 200m,
                    AmountDue = 120m,
                    AmountPaid = 80m,
                    CreatedFromDocumentId = Guid.NewGuid(),
                    CreatedFromDocumentNumber = "PO-RANGE",
                    CreatedFromDocumentType = "PurchaseOrder",
                    CreatedAtUtc = now,
                });

            dbContext.PurchasePayments.Add(new PurchasePayment
            {
                Id = paymentId,
                CompanyId = companyId,
                PurchasePaymentNumber = "PP-001",
                ContactId = contactId,
                ContactName = "Supply Partner",
                PaymentDateUtc = new DateTime(2026, 6, 8, 0, 0, 0, DateTimeKind.Utc),
                Currency = "MYR",
                Status = PurchasePaymentStatus.Posted,
                TotalAmount = 50m,
                Allocations =
                [
                    new PurchasePaymentAllocation
                    {
                        Id = paymentAllocationId,
                        PurchaseBillId = rangedBillId,
                        PurchaseBillNumber = "PB-RANGE",
                        Amount = 50m,
                        CreatedAtUtc = now,
                    }
                ],
                CreatedAtUtc = now,
            });

            dbContext.PurchaseCreditNotes.Add(new PurchaseCreditNote
            {
                Id = creditNoteId,
                CompanyId = companyId,
                PurchaseBillId = rangedBillId,
                ContactId = contactId,
                ContactName = "Supply Partner",
                PurchaseCreditNoteNumber = "PCN-001",
                Currency = "MYR",
                SubtotalReduction = 20m,
                TaxReduction = 0m,
                TotalReduction = 20m,
                Reason = "Supplier discount",
                Status = PurchaseCreditNoteStatus.Approved,
                IssuedAtUtc = new DateTime(2026, 6, 9, 0, 0, 0, DateTimeKind.Utc),
                CreatedAtUtc = now,
            });

            dbContext.PurchaseRefunds.Add(new PurchaseRefund
            {
                Id = refundId,
                CompanyId = companyId,
                PurchasePaymentId = paymentId,
                ContactId = contactId,
                ContactName = "Supply Partner",
                PurchaseRefundNumber = "PR-001",
                RefundDateUtc = new DateTime(2026, 6, 11, 0, 0, 0, DateTimeKind.Utc),
                Currency = "MYR",
                TotalAmount = 10m,
                Status = PurchaseRefundStatus.Refunded,
                Allocations =
                [
                    new PurchaseRefundAllocation
                    {
                        Id = refundAllocationId,
                        PurchasePaymentAllocationId = paymentAllocationId,
                        PurchaseBillId = rangedBillId,
                        PurchaseBillNumber = "PB-RANGE",
                        Amount = 10m,
                        CreatedAtUtc = now,
                    }
                ],
                CreatedAtUtc = now,
            });

            await dbContext.SaveChangesAsync();
        }

        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        var response = await client.GetAsync(
            $"/api/statements?contactId={contactId:D}&statementType=Supplier&fromDateUtc={Uri.EscapeDataString(fromDate.ToString("O"))}&toDateUtc={Uri.EscapeDataString(toDate.ToString("O"))}&contactPerson=Jane%20Doe");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<StatementOfAccountDto>(TestWebApplicationFactory.JsonOptions);

        report.Should().NotBeNull();
        report!.StatementType.Should().Be(StatementAccountType.Supplier);
        report.OpeningBalance.Should().Be(300m);
        report.ClosingBalance.Should().Be(440m);
        report.Rows.Select(x => x.DocumentNumber).Should().ContainInOrder("OPENING", "PB-RANGE", "PP-001", "PCN-001", "PR-001");
        report.Rows.Select(x => x.Balance).Should().ContainInOrder(300m, 500m, 450m, 430m, 440m);

        report.Aging.Days1To30.Should().Be(120m);
        report.Aging.Days61To90.Should().Be(300m);
        report.Aging.TotalOutstanding.Should().Be(420m);
    }

    private static string ParseJwtClaim(string token, string claimType)
    {
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        return jwt.Claims.First(x => x.Type == claimType).Value;
    }
}
