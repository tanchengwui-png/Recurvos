using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Recurvos.Application.Invoices;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;
using Recurvos.Infrastructure.Services;

namespace Recurvos.Application.Tests.Integration;

public sealed class BillingIntegrationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public BillingIntegrationTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Auth_Register_RequiresEmailVerification()
    {
        await _factory.EnsureSeededAsync();
        using var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            packageCode = "starter",
            companyName = "Integration Co",
            registrationNumber = "202612345678",
            companyEmail = "finance@integration.my",
            fullName = "Integration Owner",
            email = "owner@integration.my",
            password = "Passw0rd!",
            acceptLegalTerms = true
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<RegisterResponse>(TestWebApplicationFactory.JsonOptions);
        body!.RequiresEmailVerification.Should().BeTrue();
        body.Email.Should().Be("owner@integration.my");

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var company = await dbContext.Companies.SingleAsync(x => x.Email == "finance@integration.my");
        company.SelectedPackage.Should().Be("starter");
        company.PackageStatus.Should().Be("pending_verification");
        company.TrialEndsAtUtc.Should().BeNull();
        company.SubscriberId.Should().NotBeEmpty();

        var user = await dbContext.Users.SingleAsync(x => x.Email == "owner@integration.my");
        user.IsEmailVerified.Should().BeFalse();
        user.TermsAcceptedAtUtc.Should().NotBeNull();
        user.PrivacyAcceptedAtUtc.Should().NotBeNull();
        user.TermsVersion.Should().Be("2026-03-17");
        user.PrivacyVersion.Should().Be("2026-03-17");
    }

    [Fact]
    public async Task Auth_Register_CreatesSubscriberPackageInvoice()
    {
        await _factory.EnsureSeededAsync();
        using var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            packageCode = "starter",
            companyName = "Package Billing Co",
            registrationNumber = "202634567890",
            companyEmail = "finance@packagebilling.my",
            fullName = "Package Billing Owner",
            email = "owner@packagebilling.my",
            password = "Passw0rd!",
            acceptLegalTerms = true
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await VerifyLatestRegistrationAsync("owner@packagebilling.my");
        using var authorized = TestWebApplicationFactory.Authorize(_factory.CreateClient(), auth!.AccessToken);

        var summary = await authorized.GetFromJsonAsync<SubscriberPackageBillingSummaryView>("/api/package-billing", TestWebApplicationFactory.JsonOptions);

        summary.Should().NotBeNull();
        summary!.PackageCode.Should().Be("starter");
        summary.Invoices.Should().ContainSingle();
        summary.Invoices.Single().InvoiceNumber.Should().StartWith("SUB-");
        summary.Invoices.Single().Currency.Should().Be("MYR");
    }

    [Fact]
    public async Task PlatformInvoicePreview_DownloadsPdf_WithoutSavingInvoice()
    {
        await _factory.EnsureSeededAsync();
        using var loginClient = _factory.CreateClient();
        var loginResponse = await loginClient.PostAsJsonAsync("/api/auth/login", new
        {
            email = "owner@recurvo.com",
            password = "Passw0rd!"
        });

        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthVerifyResponse>(TestWebApplicationFactory.JsonOptions);
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), auth!.AccessToken);

        await using var beforeScope = _factory.Services.CreateAsyncScope();
        var beforeDbContext = beforeScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoiceCountBefore = await beforeDbContext.Invoices.CountAsync();

        var response = await client.PostAsJsonAsync("/api/platform/invoice-preview/download", new
        {
            customerName = "Preview Customer",
            customerEmail = "preview@example.test",
            customerAddress = "Shah Alam",
            invoiceNumber = "PREVIEW-TEST",
            dueDateUtc = DateTime.UtcNow.AddDays(7),
            lineItems = new[]
            {
                new
                {
                    description = "Preview line",
                    quantity = 2,
                    unitAmount = 50m
                }
            }
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");

        await using var afterScope = _factory.Services.CreateAsyncScope();
        var afterDbContext = afterScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoiceCountAfter = await afterDbContext.Invoices.CountAsync();

        invoiceCountAfter.Should().Be(invoiceCountBefore);
    }

    [Fact]
    public async Task InvoiceGeneration_CreatesInvoiceAndReminderSchedules()
    {
        await _factory.EnsureSeededAsync();
        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoiceService = scope.ServiceProvider.GetRequiredService<IInvoiceService>();
        var subscription = await dbContext.Subscriptions.Include(x => x.Items).FirstAsync();
        subscription.Items.First().NextBillingUtc = DateTime.UtcNow.AddMinutes(-1);
        await dbContext.SaveChangesAsync();

        var created = await invoiceService.GenerateDueInvoicesAsync();

        created.Should().BeGreaterThan(0);
        dbContext.Invoices.Count().Should().BeGreaterThan(1);
        dbContext.ReminderSchedules.Count().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task WebhookProcessing_IsIdempotent()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        var invoices = await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions);
        var invoiceId = invoices!.First().Id;
        var payment = await (await client.PostAsync($"/api/payments/invoice/{invoiceId}/link", JsonContent.Create(new { }))).Content.ReadFromJsonAsync<PaymentResponse>(TestWebApplicationFactory.JsonOptions);

        var webhookBody = new { paymentId = payment!.ExternalPaymentId, eventId = "evt_1", succeeded = true };
        var first = await _factory.CreateClient().PostAsJsonAsync("/api/webhooks/billplz", webhookBody);
        var second = await _factory.CreateClient().PostAsJsonAsync("/api/webhooks/billplz", webhookBody);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        dbContext.WebhookEvents.Count().Should().Be(1);
    }

    [Fact]
    public async Task PaymentWebhook_TransitionsPaymentAndInvoiceToPaid()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        var invoices = await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions);
        var invoice = invoices!.First();
        var payment = await (await client.PostAsync($"/api/payments/invoice/{invoice.Id}/link", JsonContent.Create(new { }))).Content.ReadFromJsonAsync<PaymentResponse>(TestWebApplicationFactory.JsonOptions);

        var webhookResponse = await _factory.CreateClient().PostAsJsonAsync("/api/webhooks/billplz", new
        {
            paymentId = payment!.ExternalPaymentId,
            eventId = "evt_paid",
            succeeded = true
        });

        webhookResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var storedPayment = await dbContext.Payments.FirstAsync(x => x.ExternalPaymentId == payment.ExternalPaymentId);
        var storedInvoice = await dbContext.Invoices.FirstAsync(x => x.Id == invoice.Id);

        storedPayment.Status.Should().Be(PaymentStatus.Succeeded);
        storedInvoice.Status.Should().Be(InvoiceStatus.Paid);
        storedInvoice.AmountDue.Should().Be(0);
    }

    [Fact]
    public async Task Invoice_Send_UsesBrandedEmailTemplate()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        var sendResponse = await client.PostAsync($"/api/invoices/{invoice.Id}/send", JsonContent.Create(new { }));

        sendResponse.StatusCode.Should().Be(HttpStatusCode.Accepted);

        await using var scope = _factory.Services.CreateAsyncScope();
        var fakeEmailSender = scope.ServiceProvider.GetRequiredService<FakeEmailSender>();
        var message = fakeEmailSender.Sent.Last(x => x.Subject.Contains(invoice.InvoiceNumber, StringComparison.OrdinalIgnoreCase));

        message.Body.Should().Contain("Invoice delivery");
        message.Body.Should().Contain(invoice.InvoiceNumber);
        message.Body.Should().Contain("Amount due");
        message.Body.Should().Contain("Recurvos Billing Platform");
        message.Attachments.Should().ContainSingle();
        message.Attachments.Single().FileName.Should().Be($"{invoice.InvoiceNumber}.pdf");
        message.Attachments.Single().ContentType.Should().Be("application/pdf");
    }

    [Fact]
    public async Task Invoice_ReverseLatestManualPayment_ReopensInvoice()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        var markPaidResponse = await client.PostAsJsonAsync($"/api/invoices/{invoice.Id}/mark-paid", new { });
        markPaidResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var reverseResponse = await client.PostAsJsonAsync($"/api/invoices/{invoice.Id}/reverse-payment", new
        {
            reason = "Recorded in error"
        });

        reverseResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var storedInvoice = await dbContext.Invoices.FirstAsync(x => x.Id == invoice.Id);
        var storedPayment = await dbContext.Payments
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstAsync(x => x.InvoiceId == invoice.Id);

        storedPayment.Status.Should().Be(PaymentStatus.Reversed);
        storedInvoice.Status.Should().Be(InvoiceStatus.Open);
        storedInvoice.AmountPaid.Should().Be(0);
        storedInvoice.AmountDue.Should().Be(invoice.Total);
    }

    [Fact]
    public async Task Invoice_RecordPaymentWithProof_UploadsAndDownloadsProof()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(invoice.BalanceAmount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)), "amount");
        form.Add(new StringContent("Bank transfer"), "method");
        form.Add(new StringContent("TXN-123"), "reference");
        form.Add(new StringContent(DateTime.UtcNow.ToString("O")), "paidAtUtc");
        using var proofContent = new ByteArrayContent(Encoding.UTF8.GetBytes("payment-proof"));
        proofContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        form.Add(proofContent, "proofFile", "proof.txt");

        var recordResponse = await client.PostAsync($"/api/invoices/{invoice.Id}/record-payment-with-proof", form);
        recordResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var payments = await client.GetFromJsonAsync<List<PaymentView>>("/api/payments", TestWebApplicationFactory.JsonOptions);
        var payment = payments!.First(x => x.InvoiceId == invoice.Id && x.Status == "Succeeded");

        var proofResponse = await client.GetAsync($"/api/payments/{payment.Id}/proof");
        proofResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        proofResponse.Content.Headers.ContentType!.MediaType.Should().Be("text/plain");
        (await proofResponse.Content.ReadAsStringAsync()).Should().Be("payment-proof");
    }

    [Fact]
    public async Task PublicPaymentConfirmation_SubmitAndApprove_RecordsPayment()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var authorized = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await authorized.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        var link = await (await authorized.PostAsync($"/api/payment-confirmations/invoices/{invoice.Id}/link", JsonContent.Create(new { })))
            .Content.ReadFromJsonAsync<PaymentConfirmationLinkView>(TestWebApplicationFactory.JsonOptions);
        var publicToken = link!.Url.Split("token=", StringSplitOptions.RemoveEmptyEntries).Last();

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(publicToken), "token");
        form.Add(new StringContent("Nur Payment"), "payerName");
        form.Add(new StringContent(invoice.BalanceAmount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)), "amount");
        form.Add(new StringContent(DateTime.UtcNow.ToString("O")), "paidAtUtc");
        form.Add(new StringContent("BANK-123"), "transactionReference");

        var submitResponse = await _factory.CreateClient().PostAsync("/api/public/payment-confirmations", form);
        submitResponse.StatusCode.Should().Be(HttpStatusCode.Accepted);

        var queue = await authorized.GetFromJsonAsync<List<PaymentConfirmationView>>("/api/payment-confirmations", TestWebApplicationFactory.JsonOptions);
        var submission = queue!.First(x => x.InvoiceId == invoice.Id && x.Status == "Pending");

        var approveResponse = await authorized.PostAsJsonAsync($"/api/payment-confirmations/{submission.Id}/approve", new
        {
            reviewNote = "Matched with customer notification"
        });
        approveResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var storedInvoice = await dbContext.Invoices.FirstAsync(x => x.Id == invoice.Id);
        var storedPayment = await dbContext.Payments.OrderByDescending(x => x.CreatedAtUtc).FirstAsync(x => x.InvoiceId == invoice.Id);

        storedInvoice.Status.Should().Be(InvoiceStatus.Paid);
        storedInvoice.AmountDue.Should().Be(0);
        storedPayment.Status.Should().Be(PaymentStatus.Succeeded);
        storedPayment.GatewayName.Should().Be("Customer confirmation");
    }

    [Fact]
    public async Task PublicPaymentConfirmation_RejectsDuplicatePendingSubmission()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var authorized = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await authorized.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        var link = await (await authorized.PostAsync($"/api/payment-confirmations/invoices/{invoice.Id}/link", JsonContent.Create(new { })))
            .Content.ReadFromJsonAsync<PaymentConfirmationLinkView>(TestWebApplicationFactory.JsonOptions);
        var publicToken = link!.Url.Split("token=", StringSplitOptions.RemoveEmptyEntries).Last();

        MultipartFormDataContent CreateForm()
        {
            var form = new MultipartFormDataContent();
            form.Add(new StringContent(publicToken), "token");
            form.Add(new StringContent("Nur Payment"), "payerName");
            form.Add(new StringContent(invoice.BalanceAmount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)), "amount");
            form.Add(new StringContent(DateTime.UtcNow.ToString("O")), "paidAtUtc");
            form.Add(new StringContent("BANK-123"), "transactionReference");
            return form;
        }

        var firstResponse = await _factory.CreateClient().PostAsync("/api/public/payment-confirmations", CreateForm());
        firstResponse.StatusCode.Should().Be(HttpStatusCode.Accepted);

        var secondResponse = await _factory.CreateClient().PostAsync("/api/public/payment-confirmations", CreateForm());
        secondResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task SubscriberPackageInvoice_PaidPayment_ExposesReceiptDownload()
    {
        await _factory.EnsureSeededAsync();
        using var client = _factory.CreateClient();

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new
        {
            packageCode = "starter",
            companyName = "Receipt Test Co",
            registrationNumber = "202645678901",
            companyEmail = "finance@receipttest.my",
            fullName = "Receipt Owner",
            email = "owner@receipttest.my",
            password = "Passw0rd!",
            acceptLegalTerms = true
        });

        registerResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await VerifyLatestRegistrationAsync("owner@receipttest.my");
        using var authorized = TestWebApplicationFactory.Authorize(_factory.CreateClient(), auth!.AccessToken);

        var summary = await authorized.GetFromJsonAsync<SubscriberPackageBillingSummaryView>("/api/package-billing", TestWebApplicationFactory.JsonOptions);
        var invoice = summary!.Invoices.Single();

        var paymentLinkResponse = await authorized.PostAsync($"/api/package-billing/invoices/{invoice.Id}/payment-link", JsonContent.Create(new { }));
        paymentLinkResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var paymentLinkedInvoice = await paymentLinkResponse.Content.ReadFromJsonAsync<SubscriberPackageBillingInvoiceView>(TestWebApplicationFactory.JsonOptions);

        var webhookResponse = await _factory.CreateClient().PostAsJsonAsync("/api/webhooks/billplz", new
        {
            paymentId = $"fake_{invoice.InvoiceNumber}",
            eventId = "evt_package_paid",
            succeeded = true
        });

        webhookResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var receiptResponse = await authorized.GetAsync($"/api/package-billing/invoices/{invoice.Id}/receipt");
        receiptResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        receiptResponse.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");

        var refreshedSummary = await authorized.GetFromJsonAsync<SubscriberPackageBillingSummaryView>("/api/package-billing", TestWebApplicationFactory.JsonOptions);
        refreshedSummary!.Invoices.Single(x => x.Id == invoice.Id).HasReceipt.Should().BeTrue();
        paymentLinkedInvoice!.PaymentLinkUrl.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task MixedIntervalSubscription_GeneratesInvoiceForDueItemOnly()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();

        await using (var arrangeScope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = arrangeScope.ServiceProvider.GetRequiredService<AppDbContext>();
            var customer = await dbContext.Customers.FirstAsync();
            var monthlyPlan = await dbContext.ProductPlans.FirstAsync(x => x.PlanCode == "STARTER-MONTHLY");
            var yearlyPlan = await dbContext.ProductPlans.FirstAsync(x => x.PlanCode == "STARTER-YEARLY");

            var response = await TestWebApplicationFactory.Authorize(_factory.CreateClient(), token).PostAsJsonAsync("/api/subscriptions", new
            {
                customerId = customer.Id,
                startDateUtc = DateTime.UtcNow.Date,
                notes = "mixed cadence",
                items = new[]
                {
                    new { productPlanId = monthlyPlan.Id, quantity = 1 },
                    new { productPlanId = yearlyPlan.Id, quantity = 1 }
                }
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var subscription = await dbContext.Subscriptions
                .Include(x => x.Items).ThenInclude(x => x.ProductPlan)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstAsync();

            var monthlyItem = subscription.Items.Single(x => x.ProductPlan!.PlanCode == "STARTER-MONTHLY");
            monthlyItem.NextBillingUtc = DateTime.UtcNow.AddMinutes(-1);
            await dbContext.SaveChangesAsync();
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var invoiceService = scope.ServiceProvider.GetRequiredService<IInvoiceService>();

            var created = await invoiceService.GenerateDueInvoicesAsync();

            created.Should().BeGreaterThan(0);

            var invoice = await dbContext.Invoices
                .Include(x => x.LineItems)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstAsync(x => x.SourceType == InvoiceSourceType.Subscription);

            invoice.LineItems.Should().ContainSingle();
            invoice.LineItems.Single().Description.Should().Contain("Starter Monthly");
        }
    }

    [Fact]
    public async Task SetDefaultPlan_Unsets_PreviousDefault_ForSameProduct()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();

        Guid monthlyPlanId;
        Guid yearlyPlanId;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            monthlyPlanId = await dbContext.ProductPlans
                .Where(x => x.PlanCode == "STARTER-MONTHLY")
                .Select(x => x.Id)
                .FirstAsync();
            yearlyPlanId = await dbContext.ProductPlans
                .Where(x => x.PlanCode == "STARTER-YEARLY")
                .Select(x => x.Id)
                .FirstAsync();
        }

        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);
        var response = await client.PatchAsJsonAsync($"/api/product-plans/{yearlyPlanId}/default", new
        {
            isDefault = true
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var assertScope = _factory.Services.CreateAsyncScope();
        var assertDbContext = assertScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var monthlyPlan = await assertDbContext.ProductPlans.FirstAsync(x => x.Id == monthlyPlanId);
        var yearlyPlan = await assertDbContext.ProductPlans.FirstAsync(x => x.Id == yearlyPlanId);

        monthlyPlan.IsDefault.Should().BeFalse();
        yearlyPlan.IsDefault.Should().BeTrue();
    }

    [Fact]
    public async Task RecordRefund_PreventsRefundTotalGreaterThanCollected()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        await client.PostAsJsonAsync($"/api/invoices/{invoice.Id}/mark-paid", new { });
        var payments = await client.GetFromJsonAsync<List<PaymentView>>("/api/payments", TestWebApplicationFactory.JsonOptions);
        var payment = payments!.First(x => x.InvoiceId == invoice.Id && x.Status == "Succeeded");

        var response = await client.PostAsJsonAsync($"/api/refunds/payments/{payment.Id}", new
        {
            invoiceId = invoice.Id,
            amount = payment.Amount + 1,
            reason = "over-refund"
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreditNote_PreventsCreditGreaterThanRemainingEligibleAmount()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();

        var response = await client.PostAsJsonAsync("/api/credit-notes", new
        {
            invoiceId = invoice.Id,
            reason = "too much credit",
            issuedAtUtc = DateTime.UtcNow,
            lines = new[]
            {
                new
                {
                    description = "full invoice plus one",
                    quantity = 1,
                    unitAmount = invoice.Total + 1,
                    taxAmount = 0m
                }
            }
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task RefundAndCreditNote_CanBeCreatedAndAppearInLinkedHistory()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var invoice = (await client.GetFromJsonAsync<List<InvoiceDto>>("/api/invoices", TestWebApplicationFactory.JsonOptions))!.First();
        await client.PostAsJsonAsync($"/api/invoices/{invoice.Id}/mark-paid", new { });

        var payments = await client.GetFromJsonAsync<List<PaymentView>>("/api/payments", TestWebApplicationFactory.JsonOptions);
        var payment = payments!.First(x => x.InvoiceId == invoice.Id && x.Status == "Succeeded");

        var refundResponse = await client.PostAsJsonAsync($"/api/refunds/payments/{payment.Id}", new
        {
            invoiceId = invoice.Id,
            amount = 10m,
            reason = "partial goodwill refund",
            externalRefundId = "manual-ref-1"
        });

        refundResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var creditNoteResponse = await client.PostAsJsonAsync("/api/credit-notes", new
        {
            invoiceId = invoice.Id,
            reason = "service adjustment",
            issuedAtUtc = DateTime.UtcNow,
            lines = new[]
            {
                new
                {
                    description = "discount adjustment",
                    quantity = 1,
                    unitAmount = 20m,
                    taxAmount = 0m
                }
            }
        });

        creditNoteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var refreshedInvoice = await client.GetFromJsonAsync<InvoiceDto>($"/api/invoices/{invoice.Id}", TestWebApplicationFactory.JsonOptions);
        var refreshedPayment = await client.GetFromJsonAsync<PaymentView>($"/api/payments/{payment.Id}", TestWebApplicationFactory.JsonOptions);

        refreshedInvoice!.Refunds.Should().ContainSingle(x => x.Reason == "partial goodwill refund");
        refreshedInvoice.CreditNotes.Should().ContainSingle(x => x.Reason == "service adjustment");
        refreshedPayment!.Refunds.Should().ContainSingle(x => x.Reason == "partial goodwill refund");
        refreshedPayment.NetCollectedAmount.Should().Be(payment.Amount - 10m);
    }

    [Fact]
    public async Task FinanceExport_InvoicesCsv_ReturnsCsvAndMarksInvoicesExported()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var response = await client.GetAsync($"/api/finance/exports/invoices/csv?startDateUtc={Uri.EscapeDataString(DateTime.UtcNow.AddDays(-30).ToString("O"))}&endDateUtc={Uri.EscapeDataString(DateTime.UtcNow.AddDays(1).ToString("O"))}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/csv");

        var csv = await response.Content.ReadAsStringAsync();
        csv.Should().Contain("document no,customer code,customer name,currency,subtotal,tax,total,paid amount,payment date,external reference,status");
        csv.Should().Contain("INV-");

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        dbContext.Invoices.Any(x => x.AccountingExportedAtUtc.HasValue).Should().BeTrue();
    }

    [Fact]
    public async Task FinanceExport_ReconciliationStatus_ReturnsPhaseTwoStub()
    {
        await _factory.EnsureSeededAsync();
        var token = await _factory.LoginAsSubscriberOwnerAsync();
        using var client = TestWebApplicationFactory.Authorize(_factory.CreateClient(), token);

        var status = await client.GetFromJsonAsync<ReconciliationStatusView>("/api/finance/reconciliation/status", TestWebApplicationFactory.JsonOptions);

        status!.Phase.Should().Be("Phase 2");
        status.Status.Should().Be("NotStarted");
    }

    [Fact]
    public async Task Auth_ForgotPassword_SendsResetEmail_And_ResetPassword_UpdatesCredentials()
    {
        await _factory.EnsureSeededAsync();
        using var client = _factory.CreateClient();

        var forgotResponse = await client.PostAsJsonAsync("/api/auth/forgot-password", new
        {
            email = "tanchengwui+basic@hotmail.com"
        });

        forgotResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        await using var scope = _factory.Services.CreateAsyncScope();
        var fakeEmailSender = scope.ServiceProvider.GetRequiredService<FakeEmailSender>();
        var resetToken = fakeEmailSender.GetLatestPasswordResetToken("tanchengwui+basic@hotmail.com");

        var resetResponse = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            token = resetToken,
            newPassword = "NewPassw0rd!"
        });

        resetResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "tanchengwui+basic@hotmail.com",
            password = "NewPassw0rd!"
        });

        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Cleanup_Removes_Stale_Unverified_Signups()
    {
        await _factory.EnsureSeededAsync();
        using var client = _factory.CreateClient();

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new
        {
            packageCode = "starter",
            companyName = "Stale Signup Co",
            registrationNumber = "202656789012",
            companyEmail = "finance@stalesignup.my",
            fullName = "Stale Signup Owner",
            email = "owner@stalesignup.my",
            password = "Passw0rd!",
            acceptLegalTerms = true
        });

        registerResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cleanupService = scope.ServiceProvider.GetRequiredService<StaleSignupCleanupService>();

        var company = await dbContext.Companies.SingleAsync(x => x.Email == "finance@stalesignup.my");
        company.CreatedAtUtc = DateTime.UtcNow.Subtract(StaleSignupCleanupService.RetentionWindow).AddHours(-1);
        await dbContext.SaveChangesAsync();

        var removed = await cleanupService.CleanupAsync();

        removed.Should().BeGreaterThan(0);
        (await dbContext.Companies.AnyAsync(x => x.Email == "finance@stalesignup.my")).Should().BeFalse();
        (await dbContext.Users.AnyAsync(x => x.Email == "owner@stalesignup.my")).Should().BeFalse();
    }

    private async Task<AuthVerifyResponse> VerifyLatestRegistrationAsync(string email)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var fakeEmailSender = scope.ServiceProvider.GetRequiredService<FakeEmailSender>();
        var token = fakeEmailSender.GetLatestVerificationToken(email);

        using var client = _factory.CreateClient();
        var verifyResponse = await client.PostAsJsonAsync("/api/auth/verify-email", new { token });
        verifyResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await verifyResponse.Content.ReadFromJsonAsync<AuthVerifyResponse>(TestWebApplicationFactory.JsonOptions))!;
    }

    private sealed record RegisterResponse(bool RequiresEmailVerification, string Email, string Message);
    private sealed record AuthVerifyResponse(string AccessToken, string RefreshToken, string Role);
    private sealed record PaymentResponse(string ExternalPaymentId);
    private sealed record PaymentView(Guid Id, Guid InvoiceId, decimal Amount, string Status, decimal NetCollectedAmount, bool HasProof, IReadOnlyCollection<RefundView> Refunds);
    private sealed record PaymentConfirmationLinkView(Guid InvoiceId, string InvoiceNumber, string Url);
    private sealed record PaymentConfirmationView(Guid Id, Guid InvoiceId, string InvoiceNumber, string Status);
    private sealed record RefundView(Guid Id, string Reason);
    private sealed record ReconciliationStatusView(string Phase, string Status, string Message);
    private sealed record SubscriberPackageBillingSummaryView(string PackageCode, IReadOnlyCollection<SubscriberPackageBillingInvoiceView> Invoices);
    private sealed record SubscriberPackageBillingInvoiceView(Guid Id, string InvoiceNumber, string Currency, bool HasReceipt, string? PaymentLinkUrl);
}
