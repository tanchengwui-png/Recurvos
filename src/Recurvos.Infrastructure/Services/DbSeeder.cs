using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Common;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Auth;
using Recurvos.Infrastructure.Persistence;

namespace Recurvos.Infrastructure.Services;

public sealed class DbSeeder(AppDbContext dbContext)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        await EnsureWhatsAppSchemaAsync(cancellationToken);
        var pendingSubscriberAssignments = new List<(Company Company, User User)>();
        var passwordHasher = new PasswordHasher();
        var demoSubscribers = GetDemoSubscribers();
        var demoSubscriberEmails = demoSubscribers.Select(x => x.OwnerEmail).ToArray();
        var platformOwnerExists = await dbContext.Users.AnyAsync(x => x.Email == "owner@recurvo.com", cancellationToken);
        var subscriberOwnerCount = await dbContext.Users.CountAsync(x => demoSubscriberEmails.Contains(x.Email), cancellationToken);
        var subscriberOwnersExist = subscriberOwnerCount == demoSubscriberEmails.Length;
        var catalogSeedExists = await dbContext.Products.AnyAsync(x => x.Code == "STARTER", cancellationToken)
            && await dbContext.ProductPlans.AnyAsync(x => x.PlanCode == "STARTER-MONTHLY", cancellationToken);
        var packageSeedExists = await dbContext.PlatformPackages.AnyAsync(cancellationToken);

        if (platformOwnerExists && subscriberOwnersExist && catalogSeedExists && packageSeedExists)
        {
            await BackfillPlatformPackageBillingDefaultsAsync(cancellationToken);
            return;
        }

        Company? platformCompany = null;
        if (!platformOwnerExists)
        {
            platformCompany = await dbContext.Companies.FirstOrDefaultAsync(
                x => x.IsPlatformAccount || x.Email == "support@recurvos.com" || x.Email == "support@recurvo.com",
                cancellationToken);

            if (platformCompany is null)
            {
                platformCompany = new Company
                {
                    Name = "SYSNEX TECHNOLOGY",
                    RegistrationNumber = "202603074137",
                    Email = "support@recurvos.com",
                    Phone = "+60126093799",
                    Address = "Kuala Lumpur, Malaysia",
                    IsActive = true,
                    IsPlatformAccount = true
                };
                dbContext.Companies.Add(platformCompany);
            }
            else
            {
                platformCompany.Name = "SYSNEX TECHNOLOGY";
                platformCompany.RegistrationNumber = "202603074137";
                platformCompany.Email = "support@recurvos.com";
                platformCompany.Phone = "+60126093799";
                platformCompany.Address = "Kuala Lumpur, Malaysia";
                platformCompany.IsActive = true;
                platformCompany.IsPlatformAccount = true;
            }

            dbContext.Users.Add(new User
            {
                Company = platformCompany,
                CompanyId = platformCompany.Id,
                FullName = "Recurvo Owner",
                Email = "owner@recurvo.com",
                PasswordHash = passwordHasher.Hash("Passw0rd!"),
                IsEmailVerified = true,
                EmailVerifiedAtUtc = DateTime.UtcNow,
                IsOwner = true,
                IsPlatformOwner = true,
                Role = UserRole.Owner
            });
        }

        foreach (var demoSubscriber in demoSubscribers)
        {
            var subscriberOwnerExists = await dbContext.Users.AnyAsync(x => x.Email == demoSubscriber.OwnerEmail, cancellationToken);
            if (subscriberOwnerExists)
            {
                continue;
            }

            var subscriberCompany = await dbContext.Companies
                .FirstOrDefaultAsync(x => x.Email == demoSubscriber.BillingEmail || x.Name == demoSubscriber.CompanyName, cancellationToken);

            if (subscriberCompany is null)
            {
                subscriberCompany = new Company
                {
                    Name = demoSubscriber.CompanyName,
                    RegistrationNumber = demoSubscriber.RegistrationNumber,
                    Email = demoSubscriber.BillingEmail,
                    Phone = demoSubscriber.Phone,
                    Address = demoSubscriber.Address,
                    IsActive = true,
                    IsPlatformAccount = false,
                    SelectedPackage = demoSubscriber.PackageCode,
                    PackageStatus = "active",
                    InvoiceSequence = 1001
                };
                dbContext.Companies.Add(subscriberCompany);
            }
            else
            {
                subscriberCompany.Phone ??= string.Empty;
                subscriberCompany.Address ??= string.Empty;
                subscriberCompany.IsActive = true;
                subscriberCompany.IsPlatformAccount = false;
                subscriberCompany.SelectedPackage ??= demoSubscriber.PackageCode;
                subscriberCompany.PackageStatus ??= "active";
                if (subscriberCompany.InvoiceSequence == 0)
                {
                    subscriberCompany.InvoiceSequence = 1001;
                }
            }

            var subscriberOwner = new User
            {
                Company = subscriberCompany,
                CompanyId = subscriberCompany.Id,
                FullName = demoSubscriber.OwnerName,
                Email = demoSubscriber.OwnerEmail,
                PasswordHash = passwordHasher.Hash("Passw0rd!"),
                IsEmailVerified = true,
                EmailVerifiedAtUtc = DateTime.UtcNow,
                IsOwner = true,
                IsPlatformOwner = false,
                Role = UserRole.Owner
            };
            dbContext.Users.Add(subscriberOwner);
            pendingSubscriberAssignments.Add((subscriberCompany, subscriberOwner));
            dbContext.CompanyInvoiceSettings.Add(new CompanyInvoiceSettings
            {
                CompanyId = subscriberCompany.Id,
                Prefix = "INV-",
                NextNumber = 1002,
                Padding = 6,
                ResetYearly = false,
                LastResetYear = DateTime.UtcNow.Year,
                ReceiptPrefix = "RCT-",
                ReceiptNextNumber = 1002,
                ReceiptPadding = 6,
                ReceiptResetYearly = false,
                ReceiptLastResetYear = DateTime.UtcNow.Year,
                PaymentDueDays = 7,
                ShowCompanyAddressOnInvoice = true,
                ShowCompanyAddressOnReceipt = true,
                AutoSendInvoices = true,
                AutoCompressUploads = true,
                UploadMaxBytes = 2_000_000,
                UploadImageMaxDimension = 1600,
                UploadImageQuality = 80
            });

            var customer = await dbContext.Customers.FirstOrDefaultAsync(
                x => x.SubscriberId == subscriberCompany.SubscriberId && x.Email == demoSubscriber.CustomerEmail,
                cancellationToken);
            if (customer is null)
            {
                customer = new Customer
                {
                    SubscriberId = subscriberOwner.Id,
                    Name = demoSubscriber.CustomerName,
                    Email = demoSubscriber.CustomerEmail,
                    PhoneNumber = demoSubscriber.CustomerPhone,
                    BillingAddress = demoSubscriber.CustomerAddress
                };
                dbContext.Customers.Add(customer);
            }

            var starter = await EnsureProductAsync(subscriberCompany.Id, "Recurvo Starter", "STARTER", "Core recurring billing for smaller operators.", "Subscriptions", true, cancellationToken);
            var growth = await EnsureProductAsync(subscriberCompany.Id, "Recurvo Growth", "GROWTH", "Higher-volume recurring billing with expanded workflows.", "Subscriptions", true, cancellationToken);
            var premium = await EnsureProductAsync(subscriberCompany.Id, "Recurvo Premium", "PREMIUM", "Premium recurring billing for mature service businesses.", "Subscriptions", true, cancellationToken);

            var starterMonthly = await EnsurePlanAsync(starter, "Starter Monthly", "STARTER-MONTHLY", 49m, IntervalUnit.Month, 1, true, 0, cancellationToken);
            await EnsurePlanAsync(starter, "Starter Yearly", "STARTER-YEARLY", 490m, IntervalUnit.Year, 1, false, 1, cancellationToken);
            var growthMonthly = await EnsurePlanAsync(growth, "Growth Monthly", "GROWTH-MONTHLY", 99m, IntervalUnit.Month, 1, true, 0, cancellationToken);
            await EnsurePlanAsync(growth, "Growth Yearly", "GROWTH-YEARLY", 990m, IntervalUnit.Year, 1, false, 1, cancellationToken);
            var premiumMonthly = await EnsurePlanAsync(premium, "Premium Monthly", "PREMIUM-MONTHLY", 199m, IntervalUnit.Month, 1, true, 0, cancellationToken);
            await EnsurePlanAsync(premium, "Premium Yearly", "PREMIUM-YEARLY", 1990m, IntervalUnit.Year, 1, false, 1, cancellationToken);

            var seededPlan = demoSubscriber.PackageCode switch
            {
                "growth" => growthMonthly,
                "premium" => premiumMonthly,
                _ => starterMonthly
            };

            var subscriptionExists = await dbContext.Subscriptions.AnyAsync(
                x => x.CompanyId == subscriberCompany.Id,
                cancellationToken);
            if (!subscriptionExists)
            {
                var start = DateTime.UtcNow.Date.AddDays(-15);
                var periodEnd = BillingCalculator.ComputePeriodEnd(start, IntervalUnit.Month, 1);
                var next = BillingCalculator.ComputeNextBillingUtc(periodEnd);
                var subscription = new Subscription
                {
                    CompanyId = subscriberCompany.Id,
                    Customer = customer,
                    CustomerId = customer.Id,
                    Status = SubscriptionStatus.Active,
                    StartDateUtc = start,
                    CurrentPeriodStartUtc = start,
                    CurrentPeriodEndUtc = periodEnd,
                    NextBillingUtc = next,
                    CancelAtPeriodEnd = false,
                    AutoRenew = true,
                    UnitPrice = seededPlan.UnitAmount,
                    Currency = seededPlan.Currency,
                    IntervalUnit = seededPlan.IntervalUnit,
                    IntervalCount = seededPlan.IntervalCount,
                    Notes = "Seeded recurring subscription",
                    UpdatedAtUtc = DateTime.UtcNow,
                    Items =
                    [
                        new SubscriptionItem
                        {
                            CompanyId = subscriberCompany.Id,
                            ProductPlan = seededPlan,
                            ProductPlanId = seededPlan.Id,
                            Quantity = 1,
                            UnitAmount = seededPlan.UnitAmount,
                            Currency = seededPlan.Currency,
                            BillingType = seededPlan.BillingType,
                            IntervalUnit = seededPlan.IntervalUnit,
                            IntervalCount = seededPlan.IntervalCount,
                            AutoRenew = true,
                            CurrentPeriodStartUtc = start,
                            CurrentPeriodEndUtc = periodEnd,
                            NextBillingUtc = next
                        }
                    ]
                };

                dbContext.Subscriptions.Add(subscription);
                dbContext.Invoices.Add(new Invoice
                {
                    CompanyId = subscriberCompany.Id,
                    Customer = customer,
                    CustomerId = customer.Id,
                    Subscription = subscription,
                    SubscriptionId = subscription.Id,
                    InvoiceNumber = "INV-001001",
                    Status = InvoiceStatus.Open,
                    IssueDateUtc = DateTime.UtcNow.Date.AddDays(-2),
                    DueDateUtc = DateTime.UtcNow.Date.AddDays(5),
                    Subtotal = seededPlan.UnitAmount,
                    Total = seededPlan.UnitAmount,
                    AmountDue = seededPlan.UnitAmount,
                    Currency = "MYR",
                    LineItems =
                    [
                        new InvoiceLineItem
                        {
                            CompanyId = subscriberCompany.Id,
                            Description = seededPlan.PlanName,
                            Quantity = 1,
                            UnitAmount = seededPlan.UnitAmount,
                            TotalAmount = seededPlan.UnitAmount,
                            SubscriptionItemId = subscription.Items.First().Id
                        }
                    ]
                });
            }

            var dunningRuleNames = new[]
            {
                ("Due date reminder", 0),
                ("3 day overdue", 3),
                ("7 day overdue", 7)
            };

            foreach (var (name, offsetDays) in dunningRuleNames)
            {
                var exists = await dbContext.DunningRules.AnyAsync(
                    x => x.CompanyId == subscriberCompany.Id && x.Name == name,
                    cancellationToken);
                if (!exists)
                {
                    dbContext.DunningRules.Add(new DunningRule
                    {
                        CompanyId = subscriberCompany.Id,
                        Name = name,
                        OffsetDays = offsetDays,
                        IsActive = true
                    });
                }
            }
        }

        var resolvedPlatformCompany = platformCompany
            ?? await dbContext.Companies.FirstOrDefaultAsync(
                x => x.IsPlatformAccount || x.Email == "support@recurvos.com" || x.Email == "support@recurvo.com",
                cancellationToken);
        if (resolvedPlatformCompany is not null
            && !await dbContext.CompanyInvoiceSettings.AnyAsync(x => x.CompanyId == resolvedPlatformCompany.Id, cancellationToken))
        {
            dbContext.CompanyInvoiceSettings.Add(new CompanyInvoiceSettings
            {
                CompanyId = resolvedPlatformCompany.Id,
                Prefix = "RCV-INV",
                NextNumber = 2,
                Padding = 6,
                ResetYearly = true,
                LastResetYear = null,
                ReceiptPrefix = "RCV-RCT",
                ReceiptNextNumber = 2,
                ReceiptPadding = 6,
                ReceiptResetYearly = true,
                ReceiptLastResetYear = DateTime.UtcNow.Year,
                PaymentDueDays = 7,
                ShowCompanyAddressOnInvoice = true,
                ShowCompanyAddressOnReceipt = true,
                AutoSendInvoices = true,
                AutoCompressUploads = true,
                UploadMaxBytes = 2_000_000,
                UploadImageMaxDimension = 1600,
                UploadImageQuality = 80,
                WhatsAppEnabled = true,
                WhatsAppProvider = "whatsapp_web_js",
                WhatsAppSessionStatus = "not_connected",
                FeedbackNotificationEmail = "tanchengwui@hotmail.com",
                SmtpHost = "smtp.gmail.com",
                SmtpPort = 465,
                SmtpUsername = "tanchengwui@gmail.com",
                SmtpPassword = "esfx ajbq uoor myxz",
                SmtpFromEmail = "no-reply-stg@recurvos.com",
                SmtpFromName = "Recurvos Admin",
                SmtpUseSsl = true,
                LocalEmailCaptureEnabled = false,
                EmailShieldEnabled = false,
                UseProductionPlatformSettings = false,
                BillplzApiKey = "0817d7e9-5047-437c-98e3-847a086e728a",
                BillplzCollectionId = "rc2eertl",
                BillplzXSignatureKey = "0bad97332fbb5a173caa81d314e1b9e6df3e1b99055447f44ea4a7c9497235c67fb8d4d983bb6a196a1d2a3591c769cc61b4e3b17c0b68851c006b31266353d8",
                BillplzBaseUrl = "https://www.billplz-sandbox.com",
                BillplzRequireSignatureVerification = true
            });
        }

        if (!packageSeedExists)
        {
            SeedPlatformPackages();
        }
        else
        {
            await BackfillPlatformPackageBillingDefaultsAsync(cancellationToken);
        }

        var companiesWithoutSubscriber = await dbContext.Companies
            .Include(x => x.Users)
            .Where(x => !x.SubscriberId.HasValue)
            .ToListAsync(cancellationToken);
        foreach (var company in companiesWithoutSubscriber)
        {
            var owner = company.Users
                .OrderByDescending(x => x.IsPlatformOwner)
                .ThenByDescending(x => x.IsOwner)
                .ThenBy(x => x.CreatedAtUtc)
                .FirstOrDefault();
            if (owner is not null)
            {
                company.SubscriberId = owner.Id;
            }
        }

        var customersWithoutSubscriber = await dbContext.Customers
            .Where(x => x.SubscriberId == Guid.Empty)
            .ToListAsync(cancellationToken);
        foreach (var customer in customersWithoutSubscriber)
        {
            var subscriberId = await dbContext.Subscriptions
                .Where(x => x.CustomerId == customer.Id)
                .Select(x => x.Company!.SubscriberId)
                .FirstOrDefaultAsync(cancellationToken);

            if (subscriberId.HasValue && subscriberId.Value != Guid.Empty)
            {
                customer.SubscriberId = subscriberId.Value;
            }
        }

        var seedUsers = await dbContext.Users
            .Where(x => x.Email == "owner@recurvo.com" || demoSubscriberEmails.Contains(x.Email))
            .ToListAsync(cancellationToken);
        foreach (var seedUser in seedUsers.Where(x => !x.IsEmailVerified))
        {
            seedUser.IsEmailVerified = true;
            seedUser.EmailVerifiedAtUtc = DateTime.UtcNow;
        }

        var companiesWithoutInvoiceSettings = await dbContext.Companies
            .Where(x => !dbContext.CompanyInvoiceSettings.Any(s => s.CompanyId == x.Id))
            .ToListAsync(cancellationToken);
        foreach (var company in companiesWithoutInvoiceSettings)
        {
            if (company.IsPlatformAccount)
            {
                dbContext.CompanyInvoiceSettings.Add(new CompanyInvoiceSettings
                {
                    CompanyId = company.Id,
                    Prefix = "RCV-INV",
                    NextNumber = 2,
                    Padding = 6,
                    ResetYearly = true,
                    LastResetYear = null,
                    ReceiptPrefix = "RCV-RCT",
                    ReceiptNextNumber = 2,
                    ReceiptPadding = 6,
                    ReceiptResetYearly = true,
                    ReceiptLastResetYear = DateTime.UtcNow.Year,
                    PaymentDueDays = 7,
                    ShowCompanyAddressOnInvoice = true,
                    ShowCompanyAddressOnReceipt = true,
                    AutoSendInvoices = true,
                    AutoCompressUploads = true,
                    UploadMaxBytes = 2_000_000,
                    UploadImageMaxDimension = 1600,
                    UploadImageQuality = 80,
                    WhatsAppEnabled = true,
                    WhatsAppProvider = "whatsapp_web_js",
                    WhatsAppSessionStatus = "not_connected",
                    FeedbackNotificationEmail = "tanchengwui@hotmail.com",
                    SmtpHost = "smtp.gmail.com",
                    SmtpPort = 465,
                    SmtpUsername = "tanchengwui@gmail.com",
                    SmtpPassword = "esfx ajbq uoor myxz",
                    SmtpFromEmail = "no-reply-stg@recurvos.com",
                    SmtpFromName = "Recurvos Admin",
                    SmtpUseSsl = true,
                    LocalEmailCaptureEnabled = false,
                    EmailShieldEnabled = false,
                    UseProductionPlatformSettings = false,
                    BillplzApiKey = "0817d7e9-5047-437c-98e3-847a086e728a",
                    BillplzCollectionId = "rc2eertl",
                    BillplzXSignatureKey = "0bad97332fbb5a173caa81d314e1b9e6df3e1b99055447f44ea4a7c9497235c67fb8d4d983bb6a196a1d2a3591c769cc61b4e3b17c0b68851c006b31266353d8",
                    BillplzBaseUrl = "https://www.billplz-sandbox.com",
                    BillplzRequireSignatureVerification = true
                });
            }
            else
            {
                dbContext.CompanyInvoiceSettings.Add(new CompanyInvoiceSettings
                {
                    CompanyId = company.Id,
                    Prefix = "INV-",
                    NextNumber = company.InvoiceSequence > 0 ? company.InvoiceSequence : 1001,
                    Padding = 6,
                    ResetYearly = false,
                    LastResetYear = null,
                    ReceiptPrefix = "RCT-",
                    ReceiptNextNumber = 1001,
                    ReceiptPadding = 6,
                    ReceiptResetYearly = false,
                    ReceiptLastResetYear = null,
                    PaymentDueDays = 7,
                    ShowCompanyAddressOnInvoice = true,
                    ShowCompanyAddressOnReceipt = true,
                    AutoSendInvoices = true,
                    AutoCompressUploads = true,
                    UploadMaxBytes = 2_000_000,
                    UploadImageMaxDimension = 1600,
                    UploadImageQuality = 80
                });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        foreach (var (company, user) in pendingSubscriberAssignments)
        {
            company.SubscriberId = user.Id;
        }

        var companiesMissingSubscriber = await dbContext.Companies
            .Include(x => x.Users)
            .Where(x => !x.SubscriberId.HasValue)
            .ToListAsync(cancellationToken);
        foreach (var company in companiesMissingSubscriber)
        {
            var owner = company.Users
                .OrderByDescending(x => x.IsPlatformOwner)
                .ThenByDescending(x => x.IsOwner)
                .ThenBy(x => x.CreatedAtUtc)
                .FirstOrDefault();
            if (owner is not null)
            {
                company.SubscriberId = owner.Id;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static DemoSubscriberSeed[] GetDemoSubscribers() =>
    [
        new(
            PackageCode: "starter",
            PackageLabel: "Basic",
            CompanyName: "Blue Oak Pilates Studio Sdn Bhd",
            RegistrationNumber: "202601000101",
            BillingEmail: "tanchengwui+basic@hotmail.com",
            Phone: "+60379331201",
            Address: "Bangsar South, Kuala Lumpur, Malaysia",
            OwnerName: "Tancheng Wui",
            OwnerEmail: "tanchengwui+basic@hotmail.com",
            CustomerName: "Aina Syuhada",
            CustomerEmail: "aina.syuhada@example.com",
            CustomerPhone: "+601121110101",
            CustomerAddress: "Mont Kiara, Kuala Lumpur, Malaysia"),
        new(
            PackageCode: "growth",
            PackageLabel: "Growth",
            CompanyName: "Northpoint Learning Hub Sdn Bhd",
            RegistrationNumber: "202601000202",
            BillingEmail: "tanchengwui+growth@hotmail.com",
            Phone: "+60376224502",
            Address: "Ara Damansara, Selangor, Malaysia",
            OwnerName: "Tancheng Wui",
            OwnerEmail: "tanchengwui+growth@hotmail.com",
            CustomerName: "Daniel Tan",
            CustomerEmail: "daniel.tan@example.com",
            CustomerPhone: "+601123450202",
            CustomerAddress: "Subang Jaya, Selangor, Malaysia"),
        new(
            PackageCode: "premium",
            PackageLabel: "Premium",
            CompanyName: "Meridian Wellness Group Sdn Bhd",
            RegistrationNumber: "202601000303",
            BillingEmail: "tanchengwui+premium@hotmail.com",
            Phone: "+60374995603",
            Address: "Damansara Heights, Kuala Lumpur, Malaysia",
            OwnerName: "Tancheng Wui",
            OwnerEmail: "tanchengwui+premium@hotmail.com",
            CustomerName: "Farah Nabila",
            CustomerEmail: "farah.nabila@example.com",
            CustomerPhone: "+601134560303",
            CustomerAddress: "Cyberjaya, Selangor, Malaysia")
    ];

    private sealed record DemoSubscriberSeed(
        string PackageCode,
        string PackageLabel,
        string CompanyName,
        string RegistrationNumber,
        string BillingEmail,
        string Phone,
        string Address,
        string OwnerName,
        string OwnerEmail,
        string CustomerName,
        string CustomerEmail,
        string CustomerPhone,
        string CustomerAddress);

    private async Task EnsureWhatsAppSchemaAsync(CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "PlatformPackages"
            ADD COLUMN IF NOT EXISTS "MaxWhatsAppRemindersPerMonth" integer NOT NULL DEFAULT 0;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "PlatformPackages"
            ADD COLUMN IF NOT EXISTS "MaxPlans" integer NOT NULL DEFAULT 0;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "PendingPackageCode" character varying(20) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ALTER COLUMN "PackageStatus" TYPE character varying(40);
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "PackageBillingCycleStartUtc" timestamp with time zone NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Users"
            ADD COLUMN IF NOT EXISTS "IsActive" boolean NOT NULL DEFAULT TRUE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "Industry" text NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Companies"
            ADD COLUMN IF NOT EXISTS "NatureOfBusiness" text NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppProvider" character varying(50) NOT NULL DEFAULT 'generic_api';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "AutoSendInvoices" boolean NOT NULL DEFAULT TRUE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "PaymentGatewayProvider" character varying(40) NOT NULL DEFAULT 'none';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "PaymentGatewayTermsAccepted" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "PaymentGatewayTermsAcceptedAtUtc" timestamp with time zone NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SubscriberBillplzApiKey" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SubscriberBillplzCollectionId" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SubscriberBillplzXSignatureKey" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SubscriberBillplzBaseUrl" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SubscriberBillplzRequireSignatureVerification" boolean NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ShowCompanyAddressOnInvoice" boolean NOT NULL DEFAULT TRUE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ShowCompanyAddressOnReceipt" boolean NOT NULL DEFAULT TRUE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "IsTaxEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "TaxName" character varying(50) NOT NULL DEFAULT 'SST';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "TaxRate" numeric(5,2) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "TaxRegistrationNo" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "PaymentDueDays" integer NOT NULL DEFAULT 7;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ReceiptPrefix" character varying(20) NOT NULL DEFAULT 'RCT';
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ReceiptNextNumber" integer NOT NULL DEFAULT 1;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ReceiptPadding" integer NOT NULL DEFAULT 6;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ReceiptResetYearly" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ReceiptLastResetYear" integer NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppApiUrl" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppAccessToken" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppSenderId" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppTemplate" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppSessionStatus" character varying(50) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppSessionPhone" character varying(50) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "WhatsAppSessionLastSyncedAtUtc" timestamp with time zone NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "FeedbackNotificationEmail" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpHost" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpPort" integer NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpUsername" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpPassword" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpFromEmail" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpFromName" character varying(150) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UseProductionPlatformSettings" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionIssuerCompanyName" character varying(150) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionIssuerRegistrationNumber" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionIssuerBillingEmail" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionIssuerPhone" character varying(50) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionIssuerAddress" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpHost" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpPort" integer NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpUsername" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpPassword" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpFromEmail" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpFromName" character varying(150) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "BillplzApiKey" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "BillplzCollectionId" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "BillplzXSignatureKey" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "BillplzBaseUrl" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "BillplzRequireSignatureVerification" boolean NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionBillplzApiKey" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionBillplzCollectionId" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionBillplzXSignatureKey" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionBillplzBaseUrl" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionBillplzRequireSignatureVerification" boolean NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "SmtpUseSsl" boolean NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionSmtpUseSsl" boolean NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "LocalEmailCaptureEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "EmailShieldEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "EmailShieldAddress" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionLocalEmailCaptureEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionEmailShieldEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "ProductionEmailShieldAddress" character varying(200) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "EmailDispatchLogs" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "OriginalRecipient" character varying(200) NOT NULL,
                "EffectiveRecipient" character varying(200) NOT NULL,
                "Subject" character varying(300) NOT NULL,
                "DeliveryMode" character varying(50) NOT NULL,
                "WasRedirected" boolean NOT NULL,
                "RedirectReason" character varying(100) NULL,
                "Succeeded" boolean NOT NULL,
                "ErrorMessage" character varying(1000) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_EmailDispatchLogs" PRIMARY KEY ("Id")
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_EmailDispatchLogs_CompanyId_CreatedAtUtc"
            ON "EmailDispatchLogs" ("CompanyId", "CreatedAtUtc");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "AutoCompressUploads" boolean NOT NULL DEFAULT TRUE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UploadMaxBytes" integer NOT NULL DEFAULT 2000000;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UploadImageMaxDimension" integer NOT NULL DEFAULT 1600;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ADD COLUMN IF NOT EXISTS "UploadImageQuality" integer NOT NULL DEFAULT 80;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Invoices"
            ADD COLUMN IF NOT EXISTS "TaxAmount" numeric(18,2) NOT NULL DEFAULT 0;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Invoices"
            ADD COLUMN IF NOT EXISTS "IsTaxEnabled" boolean NOT NULL DEFAULT FALSE;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Invoices"
            ADD COLUMN IF NOT EXISTS "TaxName" character varying(50) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Invoices"
            ADD COLUMN IF NOT EXISTS "TaxRate" numeric(5,2) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Invoices"
            ADD COLUMN IF NOT EXISTS "TaxRegistrationNo" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE company_invoice_settings
            ALTER COLUMN "WhatsAppTemplate" TYPE character varying(2000);
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "WhatsAppNotifications" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "InvoiceId" uuid NOT NULL,
                "ReminderScheduleId" uuid NULL,
                "RecipientPhoneNumber" character varying(50) NOT NULL,
                "Status" character varying(40) NOT NULL,
                "ExternalMessageId" character varying(200) NULL,
                "ErrorMessage" character varying(1000) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_WhatsAppNotifications" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_WhatsAppNotifications_Invoices_InvoiceId" FOREIGN KEY ("InvoiceId") REFERENCES "Invoices" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_WhatsAppNotifications_ReminderSchedules_ReminderScheduleId" FOREIGN KEY ("ReminderScheduleId") REFERENCES "ReminderSchedules" ("Id") ON DELETE SET NULL
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppNotifications_CompanyId_CreatedAtUtc"
            ON "WhatsAppNotifications" ("CompanyId", "CreatedAtUtc");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppNotifications_InvoiceId"
            ON "WhatsAppNotifications" ("InvoiceId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppNotifications_ReminderScheduleId"
            ON "WhatsAppNotifications" ("ReminderScheduleId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "FeedbackItems" (
                "Id" uuid NOT NULL,
                "CompanyId" uuid NOT NULL,
                "SubmittedByUserId" uuid NULL,
                "SubmittedByName" character varying(150) NOT NULL,
                "SubmittedByEmail" character varying(200) NOT NULL,
                "Subject" character varying(150) NOT NULL,
                "Category" character varying(40) NOT NULL,
                "Priority" character varying(20) NOT NULL,
                "Message" character varying(2000) NOT NULL,
                "Status" character varying(30) NOT NULL,
                "AdminNote" character varying(1000) NULL,
                "ReviewedAtUtc" timestamp with time zone NULL,
                "ReviewedByUserId" uuid NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NULL,
                CONSTRAINT "PK_FeedbackItems" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_FeedbackItems_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_FeedbackItems_Users_SubmittedByUserId" FOREIGN KEY ("SubmittedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL,
                CONSTRAINT "FK_FeedbackItems_Users_ReviewedByUserId" FOREIGN KEY ("ReviewedByUserId") REFERENCES "Users" ("Id") ON DELETE SET NULL
            );
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_CompanyId_Status_CreatedAtUtc"
            ON "FeedbackItems" ("CompanyId", "Status", "CreatedAtUtc");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_SubmittedByUserId"
            ON "FeedbackItems" ("SubmittedByUserId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_ReviewedByUserId"
            ON "FeedbackItems" ("ReviewedByUserId");
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "LastPlatformResponseAtUtc" timestamp with time zone NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "SubscriberLastViewedAtUtc" timestamp with time zone NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "StepsToReproduce" character varying(2000) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "ExpectedResult" character varying(1000) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "ActualResult" character varying(1000) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "PageUrl" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "BrowserInfo" character varying(1000) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "ScreenshotPath" character varying(500) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "ScreenshotFileName" character varying(255) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "FeedbackItems"
            ADD COLUMN IF NOT EXISTS "ScreenshotContentType" character varying(100) NULL;
            """, cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE INDEX IF NOT EXISTS "IX_FeedbackItems_CompanyId_LastPlatformResponseAtUtc"
            ON "FeedbackItems" ("CompanyId", "LastPlatformResponseAtUtc");
            """, cancellationToken);
    }

    private async Task BackfillPlatformPackageBillingDefaultsAsync(CancellationToken cancellationToken)
    {
        var packages = await dbContext.PlatformPackages.ToListAsync(cancellationToken);
        foreach (var package in packages)
        {
            switch (package.Code)
            {
                case "starter":
                    package.Amount = package.Amount <= 0 ? 29m : package.Amount;
                    package.PriceLabel = string.IsNullOrWhiteSpace(package.PriceLabel) ? "MYR 29 / month" : package.PriceLabel;
                    package.IntervalUnit = package.IntervalUnit == IntervalUnit.None ? IntervalUnit.Month : package.IntervalUnit;
                    package.IntervalCount = package.IntervalCount <= 0 ? 1 : package.IntervalCount;
                    package.GracePeriodDays = package.GracePeriodDays <= 0 ? 7 : package.GracePeriodDays;
                    package.Currency = string.IsNullOrWhiteSpace(package.Currency) ? "MYR" : package.Currency;
                    package.MaxCompanies = package.MaxCompanies <= 0 ? 1 : package.MaxCompanies;
                    package.MaxProducts = package.MaxProducts <= 0 ? 6 : package.MaxProducts;
                    package.MaxCustomers = package.MaxCustomers <= 0 ? 50 : package.MaxCustomers;
                    package.MaxWhatsAppRemindersPerMonth = package.MaxWhatsAppRemindersPerMonth < 0 ? 0 : package.MaxWhatsAppRemindersPerMonth;
                    break;
                case "growth":
                    package.Amount = package.Amount <= 0 ? 79m : package.Amount;
                    package.PriceLabel = string.IsNullOrWhiteSpace(package.PriceLabel) ? "MYR 79 / month" : package.PriceLabel;
                    package.IntervalUnit = package.IntervalUnit == IntervalUnit.None ? IntervalUnit.Month : package.IntervalUnit;
                    package.IntervalCount = package.IntervalCount <= 0 ? 1 : package.IntervalCount;
                    package.GracePeriodDays = package.GracePeriodDays <= 0 ? 7 : package.GracePeriodDays;
                    package.Currency = string.IsNullOrWhiteSpace(package.Currency) ? "MYR" : package.Currency;
                    package.MaxCompanies = package.MaxCompanies <= 0 ? 3 : package.MaxCompanies;
                    package.MaxProducts = package.MaxProducts <= 0 ? 15 : package.MaxProducts;
                    package.MaxCustomers = package.MaxCustomers <= 0 ? 200 : package.MaxCustomers;
                    package.MaxWhatsAppRemindersPerMonth = package.MaxWhatsAppRemindersPerMonth <= 0 ? 200 : package.MaxWhatsAppRemindersPerMonth;
                    break;
                case "premium":
                    package.Amount = package.Amount <= 0 ? 149m : package.Amount;
                    package.PriceLabel = string.IsNullOrWhiteSpace(package.PriceLabel) ? "Talk to sales" : package.PriceLabel;
                    package.IntervalUnit = package.IntervalUnit == IntervalUnit.None ? IntervalUnit.Month : package.IntervalUnit;
                    package.IntervalCount = package.IntervalCount <= 0 ? 1 : package.IntervalCount;
                    package.GracePeriodDays = package.GracePeriodDays <= 0 ? 7 : package.GracePeriodDays;
                    package.Currency = string.IsNullOrWhiteSpace(package.Currency) ? "MYR" : package.Currency;
                    package.MaxCompanies = package.MaxCompanies <= 0 ? 5 : package.MaxCompanies;
                    package.MaxProducts = package.MaxProducts <= 0 ? 1000 : package.MaxProducts;
                    package.MaxCustomers = package.MaxCustomers <= 0 ? 500 : package.MaxCustomers;
                    package.MaxWhatsAppRemindersPerMonth = package.MaxWhatsAppRemindersPerMonth <= 0 ? 500 : package.MaxWhatsAppRemindersPerMonth;
                    break;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private void SeedPlatformPackages()
    {
        dbContext.PlatformPackages.AddRange(
            CreatePackage(
                "starter",
                "Starter",
                "MYR 49 / month",
                "Clean billing tools for businesses starting recurring invoicing.",
                49m,
                IntervalUnit.Month,
                1,
                7,
                1,
                6,
                0,
                500,
                0,
                1,
                [
                    "Customer management",
                    "Manual invoices",
                    "Recurring invoices",
                    "Email reminders",
                    "Basic reports",
                    "Auto invoice notification (Email)",
                    "Payment reminders",
                    "Generate WhatsApp friendly reminder (Copy and Paste)",
                    "Payment tracking",
                    "Payment record screen for customer to upload their payment"
                ],
                []),
            CreatePackage(
                "growth",
                "Growth",
                "MYR 79 / month",
                "For teams that need stronger billing operations and finance control.",
                79m,
                IntervalUnit.Month,
                1,
                7,
                3,
                15,
                0,
                5000,
                200,
                2,
                [
                    "Everything in Starter",
                    "Subscriptions and plan management",
                    "Payment tracking",
                    "Finance exports",
                    "Dunning workflows",
                    "Customer management",
                    "Manual invoices",
                    "Auto invoice",
                    "Auto invoice notification (Email)",
                    "Auto invoice notification (WhatsApp)",
                    "Payment reminders",
                    "Generate WhatsApp friendly reminder (Copy and Paste)",
                    "Generate WhatsApp friendly reminder (Browser copy and paste, click send to send)",
                    "Payment record screen for customer to upload their payment",
                    "Basic reports"
                ],
                []),
            CreatePackage(
                "premium",
                "Premium",
                "MYR 199 / month",
                "For larger operators that want rollout support and deeper visibility.",
                199m,
                IntervalUnit.Month,
                1,
                7,
                5,
                1000,
                0,
                50000,
                1000,
                3,
                [
                    "Everything in Growth",
                    "Priority onboarding",
                    "Advanced billing operations",
                    "Platform visibility",
                    "Custom rollout support",
                    "Customer management",
                    "Manual invoices",
                    "Auto invoice",
                    "Auto invoice notification (Email)",
                    "Auto invoice notification (WhatsApp)",
                    "Payment reminders",
                    "Generate WhatsApp friendly reminder (Copy and Paste)",
                    "Generate WhatsApp friendly reminder (Browser copy and paste, click send to send)",
                    "Configurable WhatsApp",
                    "Payment tracking",
                    "Generate payment link",
                    "Payment record screen for customer to upload their payment",
                    "Payment gateway configuration",
                    "Basic reports",
                    "Finance exports"
                ],
                []));
    }

    private static PlatformPackage CreatePackage(
        string code,
        string name,
        string priceLabel,
        string description,
        decimal amount,
        IntervalUnit intervalUnit,
        int intervalCount,
        int gracePeriodDays,
        int maxCompanies,
        int maxProducts,
        int maxPlans,
        int maxCustomers,
        int maxWhatsAppRemindersPerMonth,
        int displayOrder,
        IReadOnlyList<string> features,
        IReadOnlyList<string> trustPoints)
    {
        var package = new PlatformPackage
        {
            Code = code,
            Name = name,
            PriceLabel = priceLabel,
            Description = description,
            Amount = amount,
            Currency = "MYR",
            IntervalUnit = intervalUnit,
            IntervalCount = intervalCount,
            GracePeriodDays = gracePeriodDays,
            MaxCompanies = maxCompanies,
            MaxProducts = maxProducts,
            MaxPlans = maxPlans,
            MaxCustomers = maxCustomers,
            MaxWhatsAppRemindersPerMonth = maxWhatsAppRemindersPerMonth,
            IsActive = true,
            DisplayOrder = displayOrder
        };

        for (var index = 0; index < features.Count; index++)
        {
            package.Features.Add(new PlatformPackageFeature
            {
                PlatformPackageId = package.Id,
                Text = features[index],
                SortOrder = index
            });
        }

        for (var index = 0; index < trustPoints.Count; index++)
        {
            package.TrustPoints.Add(new PlatformPackageTrustPoint
            {
                PlatformPackageId = package.Id,
                Text = trustPoints[index],
                SortOrder = index
            });
        }

        return package;
    }

    private async Task<Product> EnsureProductAsync(
        Guid companyId,
        string name,
        string code,
        string description,
        string category,
        bool isSubscriptionProduct,
        CancellationToken cancellationToken)
    {
        var product = await dbContext.Products.FirstOrDefaultAsync(x => x.CompanyId == companyId && x.Code == code, cancellationToken);
        if (product is not null)
        {
            return product;
        }

        product = new Product
        {
            CompanyId = companyId,
            Name = name,
            Code = code,
            Description = description,
            Category = category,
            IsSubscriptionProduct = isSubscriptionProduct,
            IsActive = true
        };
        dbContext.Products.Add(product);
        return product;
    }

    private async Task<ProductPlan> EnsurePlanAsync(
        Product product,
        string planName,
        string planCode,
        decimal unitAmount,
        IntervalUnit intervalUnit,
        int intervalCount,
        bool isDefault,
        int sortOrder,
        CancellationToken cancellationToken)
    {
        var plan = await dbContext.ProductPlans.FirstOrDefaultAsync(x => x.CompanyId == product.CompanyId && x.PlanCode == planCode, cancellationToken);
        if (plan is not null)
        {
            return plan;
        }

        plan = new ProductPlan
        {
            CompanyId = product.CompanyId,
            Product = product,
            ProductId = product.Id,
            PlanName = planName,
            PlanCode = planCode,
            BillingType = BillingType.Recurring,
            IntervalUnit = intervalUnit,
            IntervalCount = intervalCount,
            Currency = "MYR",
            UnitAmount = unitAmount,
            TrialDays = 0,
            SetupFeeAmount = 0,
            TaxBehavior = TaxBehavior.Unspecified,
            IsDefault = isDefault,
            IsActive = true,
            SortOrder = sortOrder
        };
        dbContext.ProductPlans.Add(plan);
        return plan;
    }
}
