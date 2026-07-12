using Microsoft.EntityFrameworkCore;
using Recurvos.Application.Abstractions;
using Recurvos.Application.Customers;
using Recurvos.Application.Features;
using Recurvos.Application.Platform;
using Recurvos.Domain.Entities;
using Recurvos.Domain.Enums;
using Recurvos.Infrastructure.Persistence;
using System.Text.Json;

namespace Recurvos.Infrastructure.Services;

public sealed class CustomerService(
    AppDbContext dbContext,
    ICurrentUserService currentUserService,
    IAuditService auditService,
    IFeatureEntitlementService featureEntitlementService,
    IPackageLimitService packageLimitService) : ICustomerService
{
    private static readonly HashSet<string> AllowedContactTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Customer",
        "Supplier",
        "Employee",
    };

    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Active",
        "Inactive",
        "Archived",
    };

    private static readonly HashSet<string> AllowedEntityTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Company",
        "Individual",
        "General Public",
        "Foreign Company",
        "Foreign Individual",
        "Exempted Person",
    };

    public async Task<IReadOnlyCollection<CustomerDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        var customers = await dbContext.Customers
            .Where(x => x.SubscriberId == GetSubscriberId())
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return customers.Select(BuildCustomerDto).ToList();
    }

    public async Task<CustomerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == id, cancellationToken);
        return customer is null ? null : BuildCustomerDto(customer);
    }

    public async Task<CustomerDto> CreateAsync(CustomerRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        await packageLimitService.EnsureCanCreateCustomerAsync(cancellationToken);
        var contactType = NormalizeContactType(request.ContactType);
        var status = NormalizeStatus(request.Status);
        var entityType = NormalizeEntityType(request.EntityType);
        var legalName = NormalizeLegalName(request.LegalName, request.Name);
        var phoneNumbers = NormalizeStringList(request.PhoneNumbers, request.PhoneNumber);
        var emailAddresses = NormalizeEmailList(request.EmailAddresses, request.Email);
        var addresses = NormalizeAddresses(request.Addresses, request.BillingAddress);
        var groups = NormalizeStringList(request.Groups);
        var tags = NormalizeStringList(request.Tags);
        ValidateConditionalFields(contactType, request.ReceivableAccount, request.PayableAccount);
        var receivableAccount = await ResolveAccountSelectionAsync(request.ReceivableAccountId, request.ReceivableAccount, AccountType.Asset, "Receivable account", cancellationToken);
        var payableAccount = await ResolveAccountSelectionAsync(request.PayableAccountId, request.PayableAccount, AccountType.Liability, "Payable account", cancellationToken);
        var incomeAccount = await ResolveAccountSelectionAsync(request.IncomeAccountId, request.IncomeAccount, AccountType.Revenue, "Income account", cancellationToken);
        var expenseAccount = await ResolveAccountSelectionAsync(request.ExpenseAccountId, request.ExpenseAccount, AccountType.Expense, "Expense account", cancellationToken);
        var priceLevel = await ValidatePriceLevelAsync(request.PriceLevel, cancellationToken);
        var currency = await ValidateCurrencyAsync(request.Currency, cancellationToken);
        var paymentTerm = await ValidatePaymentTermAsync(request.PaymentTerm, cancellationToken);
        var customer = new Customer
        {
            SubscriberId = GetSubscriberId(),
            Name = legalName,
            Email = emailAddresses.FirstOrDefault() ?? string.Empty,
            PhoneNumber = phoneNumbers.FirstOrDefault() ?? string.Empty,
            ExternalReference = request.ExternalReference,
            BillingAddress = BuildBillingAddress(addresses, request.BillingAddress),
            EntityType = entityType,
            LegalName = legalName,
            OtherName = request.OtherName.Trim(),
            RegistrationNumberType = request.RegistrationNumberType.Trim(),
            RegistrationNumber = request.RegistrationNumber.Trim(),
            OldRegistrationNumber = request.OldRegistrationNumber.Trim(),
            Tin = request.Tin.Trim(),
            SstRegistrationNumber = request.SstRegistrationNumber.Trim(),
            ContactType = contactType,
            Status = status,
            ContactPersonsJson = SerializeList(request.ContactPersons.Where(HasAnyContactPersonValue)),
            PhoneNumbersJson = SerializeList(phoneNumbers),
            EmailAddressesJson = SerializeList(emailAddresses),
            AddressesJson = SerializeList(addresses),
            ReceivableAccountId = receivableAccount.AccountId,
            ReceivableAccount = receivableAccount.AccountCode,
            CreditLimit = request.CreditLimit,
            PayableAccountId = payableAccount.AccountId,
            PayableAccount = payableAccount.AccountCode,
            GroupsJson = SerializeList(groups),
            PriceLevel = priceLevel,
            Currency = currency,
            PaymentTerm = paymentTerm,
            IncomeAccountId = incomeAccount.AccountId,
            IncomeAccount = incomeAccount.AccountCode,
            ExpenseAccountId = expenseAccount.AccountId,
            ExpenseAccount = expenseAccount.AccountCode,
            Location = request.Location.Trim(),
            TagsJson = SerializeList(tags),
            MyInvoisControl = request.MyInvoisControl.Trim(),
        };

        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("customer.created", nameof(Customer), customer.Id.ToString(), customer.Name, cancellationToken);
        return BuildCustomerDto(customer);
    }

    public async Task<CustomerDto?> UpdateAsync(Guid id, CustomerRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == id, cancellationToken);
        if (customer is null)
        {
            return null;
        }

        var contactType = NormalizeContactType(request.ContactType);
        var status = NormalizeStatus(request.Status);
        var entityType = NormalizeEntityType(request.EntityType);
        var legalName = NormalizeLegalName(request.LegalName, request.Name);
        var phoneNumbers = NormalizeStringList(request.PhoneNumbers, request.PhoneNumber);
        var emailAddresses = NormalizeEmailList(request.EmailAddresses, request.Email);
        var addresses = NormalizeAddresses(request.Addresses, request.BillingAddress);
        var groups = NormalizeStringList(request.Groups);
        var tags = NormalizeStringList(request.Tags);
        ValidateConditionalFields(contactType, request.ReceivableAccount, request.PayableAccount);
        var receivableAccount = await ResolveAccountSelectionAsync(request.ReceivableAccountId, request.ReceivableAccount, AccountType.Asset, "Receivable account", cancellationToken);
        var payableAccount = await ResolveAccountSelectionAsync(request.PayableAccountId, request.PayableAccount, AccountType.Liability, "Payable account", cancellationToken);
        var incomeAccount = await ResolveAccountSelectionAsync(request.IncomeAccountId, request.IncomeAccount, AccountType.Revenue, "Income account", cancellationToken);
        var expenseAccount = await ResolveAccountSelectionAsync(request.ExpenseAccountId, request.ExpenseAccount, AccountType.Expense, "Expense account", cancellationToken);
        var priceLevel = await ValidatePriceLevelAsync(request.PriceLevel, cancellationToken);
        var currency = await ValidateCurrencyAsync(request.Currency, cancellationToken);
        var paymentTerm = await ValidatePaymentTermAsync(request.PaymentTerm, cancellationToken);

        customer.EntityType = entityType;
        customer.LegalName = legalName;
        customer.OtherName = request.OtherName.Trim();
        customer.RegistrationNumberType = request.RegistrationNumberType.Trim();
        customer.RegistrationNumber = request.RegistrationNumber.Trim();
        customer.OldRegistrationNumber = request.OldRegistrationNumber.Trim();
        customer.Tin = request.Tin.Trim();
        customer.SstRegistrationNumber = request.SstRegistrationNumber.Trim();
        customer.ContactType = contactType;
        customer.Status = status;
        customer.Name = legalName;
        customer.Email = emailAddresses.FirstOrDefault() ?? string.Empty;
        customer.PhoneNumber = phoneNumbers.FirstOrDefault() ?? string.Empty;
        customer.ExternalReference = request.ExternalReference.Trim();
        customer.BillingAddress = BuildBillingAddress(addresses, request.BillingAddress);
        customer.ContactPersonsJson = SerializeList(request.ContactPersons.Where(HasAnyContactPersonValue));
        customer.PhoneNumbersJson = SerializeList(phoneNumbers);
        customer.EmailAddressesJson = SerializeList(emailAddresses);
        customer.AddressesJson = SerializeList(addresses);
        customer.ReceivableAccountId = receivableAccount.AccountId;
        customer.ReceivableAccount = receivableAccount.AccountCode;
        customer.CreditLimit = request.CreditLimit;
        customer.PayableAccountId = payableAccount.AccountId;
        customer.PayableAccount = payableAccount.AccountCode;
        customer.GroupsJson = SerializeList(groups);
        customer.PriceLevel = priceLevel;
        customer.Currency = currency;
        customer.PaymentTerm = paymentTerm;
        customer.IncomeAccountId = incomeAccount.AccountId;
        customer.IncomeAccount = incomeAccount.AccountCode;
        customer.ExpenseAccountId = expenseAccount.AccountId;
        customer.ExpenseAccount = expenseAccount.AccountCode;
        customer.Location = request.Location.Trim();
        customer.TagsJson = SerializeList(tags);
        customer.MyInvoisControl = request.MyInvoisControl.Trim();
        customer.UpdatedAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("customer.updated", nameof(Customer), customer.Id.ToString(), customer.Name, cancellationToken);
        return BuildCustomerDto(customer);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.SubscriberId == GetSubscriberId() && x.Id == id, cancellationToken);
        if (customer is null)
        {
            return false;
        }

        dbContext.Customers.Remove(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        await auditService.WriteAsync("customer.deleted", nameof(Customer), customer.Id.ToString(), customer.Name, cancellationToken);
        return true;
    }

    private Guid GetSubscriberId() => currentUserService.UserId ?? throw new UnauthorizedAccessException();

    private async Task EnsureReadAccessAsync(CancellationToken cancellationToken)
    {
        if (await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken)
            || await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.ManualInvoices, cancellationToken)
            || await featureEntitlementService.CurrentUserHasFeatureAsync(PlatformFeatureKeys.RecurringInvoices, cancellationToken))
        {
            return;
        }

        throw new InvalidOperationException("Your current package does not include Customer management.");
    }

    private static string NormalizeContactType(string? value)
    {
        var values = value?
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();

        if (values.Length == 0)
        {
            return "Customer";
        }

        if (values.Any(item => !AllowedContactTypes.Contains(item)))
        {
            throw new InvalidOperationException("Contact type must be Customer, Supplier, or Employee.");
        }

        return string.Join(", ", values.Select(item => AllowedContactTypes.First(allowed => allowed.Equals(item, StringComparison.OrdinalIgnoreCase))));
    }

    private static string NormalizeStatus(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "Active";
        }

        if (!AllowedStatuses.Contains(normalized))
        {
            throw new InvalidOperationException("Status must be Active, Inactive, or Archived.");
        }

        return AllowedStatuses.First(item => item.Equals(normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeEntityType(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "Company";
        }

        if (!AllowedEntityTypes.Contains(normalized))
        {
            throw new InvalidOperationException("Unsupported entity type.");
        }

        return AllowedEntityTypes.First(item => item.Equals(normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeLegalName(string? legalName, string? fallbackName)
    {
        var normalized = string.IsNullOrWhiteSpace(legalName) ? fallbackName?.Trim() ?? string.Empty : legalName.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Legal name is required.");
        }

        return normalized;
    }

    private static List<string> NormalizeStringList(IEnumerable<string>? values, string? fallbackValue = null)
    {
        var normalized = (values ?? Array.Empty<string>())
            .Select(item => item.Trim())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalized.Count == 0 && !string.IsNullOrWhiteSpace(fallbackValue))
        {
            normalized.Add(fallbackValue.Trim());
        }

        return normalized;
    }

    private static List<string> NormalizeEmailList(IEnumerable<string>? values, string? fallbackValue = null)
    {
        var normalized = NormalizeStringList(values, fallbackValue);
        if (normalized.Count == 0)
        {
            throw new InvalidOperationException("At least one email address is required.");
        }

        return normalized;
    }

    private static List<CustomerAddressInput> NormalizeAddresses(IEnumerable<CustomerAddressInput>? values, string? fallbackBillingAddress)
    {
        var normalized = (values ?? Array.Empty<CustomerAddressInput>())
            .Select(address => new CustomerAddressInput
            {
                AddressName = address.AddressName.Trim(),
                StreetAddress = address.StreetAddress.Trim(),
                AddressLine2 = address.AddressLine2.Trim(),
                AddressLine3 = address.AddressLine3.Trim(),
                City = address.City.Trim(),
                Postcode = address.Postcode.Trim(),
                Country = address.Country.Trim(),
                State = address.State.Trim(),
                IsDefaultBilling = address.IsDefaultBilling,
                IsDefaultShipping = address.IsDefaultShipping,
            })
            .Where(address => !string.IsNullOrWhiteSpace(address.AddressName)
                || !string.IsNullOrWhiteSpace(address.StreetAddress)
                || !string.IsNullOrWhiteSpace(address.AddressLine2)
                || !string.IsNullOrWhiteSpace(address.AddressLine3)
                || !string.IsNullOrWhiteSpace(address.City)
                || !string.IsNullOrWhiteSpace(address.Postcode)
                || !string.IsNullOrWhiteSpace(address.Country)
                || !string.IsNullOrWhiteSpace(address.State))
            .ToList();

        if (normalized.Count == 0 && !string.IsNullOrWhiteSpace(fallbackBillingAddress))
        {
            normalized.Add(new CustomerAddressInput
            {
                AddressName = "Primary",
                StreetAddress = fallbackBillingAddress.Trim(),
                IsDefaultBilling = true,
                IsDefaultShipping = true,
            });
        }

        if (normalized.Count == 0)
        {
            return normalized;
        }

        if (!normalized.Any(address => address.IsDefaultBilling))
        {
            normalized[0].IsDefaultBilling = true;
        }

        if (!normalized.Any(address => address.IsDefaultShipping))
        {
            normalized[0].IsDefaultShipping = true;
        }

        return normalized;
    }

    private static string BuildBillingAddress(IReadOnlyCollection<CustomerAddressInput> addresses, string? fallbackBillingAddress)
    {
        var address = addresses.FirstOrDefault(item => item.IsDefaultBilling) ?? addresses.FirstOrDefault();
        if (address is null)
        {
            return fallbackBillingAddress?.Trim() ?? string.Empty;
        }

        var segments = new[]
        {
            string.Join(", ", new[] { address.StreetAddress, address.AddressLine2, address.AddressLine3 }.Where(item => !string.IsNullOrWhiteSpace(item))),
            string.Join(", ", new[] { address.City, address.State, address.Postcode }.Where(item => !string.IsNullOrWhiteSpace(item))),
            address.Country,
        }.Where(item => !string.IsNullOrWhiteSpace(item));

        return string.Join(", ", segments);
    }

    private static void ValidateConditionalFields(string contactType, string? receivableAccount, string? payableAccount)
    {
        var types = contactType.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var isCustomer = types.Any(item => item.Equals("Customer", StringComparison.OrdinalIgnoreCase));
        var isSupplier = types.Any(item => item.Equals("Supplier", StringComparison.OrdinalIgnoreCase));

        if (isCustomer && string.IsNullOrWhiteSpace(receivableAccount))
        {
            throw new InvalidOperationException("Receivable account is required when Customer is selected.");
        }

        if (isSupplier && string.IsNullOrWhiteSpace(payableAccount))
        {
            throw new InvalidOperationException("Payable account is required when Supplier is selected.");
        }
    }

    private async Task<AccountSelection> ResolveAccountSelectionAsync(
        Guid? accountId,
        string? value,
        AccountType expectedType,
        string fieldName,
        CancellationToken cancellationToken)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized) && (!accountId.HasValue || accountId == Guid.Empty))
        {
            return AccountSelection.Empty;
        }

        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var account = accountId.HasValue && accountId != Guid.Empty
            ? await dbContext.Accounts
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.CompanyId == companyId
                        && x.IsActive
                        && x.Id == accountId.Value,
                    cancellationToken)
            : await dbContext.Accounts
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.CompanyId == companyId
                        && x.IsActive
                        && x.Code == normalized,
                    cancellationToken);

        if (account is null)
        {
            throw new InvalidOperationException($"{fieldName} must reference an active account.");
        }

        if (account.Type != expectedType)
        {
            throw new InvalidOperationException($"{fieldName} must reference an active {expectedType.ToString().ToLowerInvariant()} account.");
        }

        return new AccountSelection(account.Id, account.Code);
    }

    private async Task<string> ValidateCurrencyAsync(string? value, CancellationToken cancellationToken)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var currency = await dbContext.CurrencyDefinitions
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.CompanyId == companyId
                    && x.IsActive
                    && x.Code == normalized,
                cancellationToken);

        if (currency is null)
        {
            throw new InvalidOperationException("Currency must reference an active currency code.");
        }

        return currency.Code;
    }

    private async Task<string> ValidatePaymentTermAsync(string? value, CancellationToken cancellationToken)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var paymentTerm = await dbContext.PaymentTerms
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.CompanyId == companyId
                    && x.IsActive
                    && x.Code == normalized,
                cancellationToken);

        if (paymentTerm is null)
        {
            throw new InvalidOperationException("Payment term must reference an active payment term code.");
        }

        return paymentTerm.Code;
    }

    private async Task<string> ValidatePriceLevelAsync(string? value, CancellationToken cancellationToken)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var companyId = currentUserService.CompanyId ?? throw new UnauthorizedAccessException();
        var priceLevel = await dbContext.PriceLevels
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.CompanyId == companyId
                    && x.IsActive
                    && x.Code == normalized,
                cancellationToken);

        if (priceLevel is null)
        {
            throw new InvalidOperationException("Price level must reference an active price level code.");
        }

        return priceLevel.Code;
    }

    private static bool HasAnyContactPersonValue(CustomerContactPersonInput person) =>
        !string.IsNullOrWhiteSpace(person.Name)
        || !string.IsNullOrWhiteSpace(person.Role)
        || !string.IsNullOrWhiteSpace(person.Email)
        || !string.IsNullOrWhiteSpace(person.PhoneNumber);

    private static string SerializeList<T>(IEnumerable<T> values) => JsonSerializer.Serialize(values);

    private static List<T> DeserializeList<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<T>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json) ?? new List<T>();
        }
        catch
        {
            return new List<T>();
        }
    }

    private static CustomerDto BuildCustomerDto(Customer customer) => new()
    {
        Id = customer.Id,
        Name = customer.Name,
        Email = customer.Email,
        PhoneNumber = customer.PhoneNumber,
        ExternalReference = customer.ExternalReference,
        BillingAddress = customer.BillingAddress,
        EntityType = string.IsNullOrWhiteSpace(customer.EntityType) ? "Company" : customer.EntityType,
        LegalName = string.IsNullOrWhiteSpace(customer.LegalName) ? customer.Name : customer.LegalName,
        OtherName = customer.OtherName,
        RegistrationNumberType = customer.RegistrationNumberType,
        RegistrationNumber = customer.RegistrationNumber,
        OldRegistrationNumber = customer.OldRegistrationNumber,
        Tin = customer.Tin,
        SstRegistrationNumber = customer.SstRegistrationNumber,
        ContactType = string.IsNullOrWhiteSpace(customer.ContactType) ? "Customer" : customer.ContactType,
        Status = string.IsNullOrWhiteSpace(customer.Status) ? "Active" : customer.Status,
        ContactPersons = DeserializeList<CustomerContactPersonInput>(customer.ContactPersonsJson),
        PhoneNumbers = DeserializeList<string>(customer.PhoneNumbersJson).DefaultIfEmpty(customer.PhoneNumber).Where(item => !string.IsNullOrWhiteSpace(item)).ToArray(),
        EmailAddresses = DeserializeList<string>(customer.EmailAddressesJson).DefaultIfEmpty(customer.Email).Where(item => !string.IsNullOrWhiteSpace(item)).ToArray(),
        Addresses = DeserializeList<CustomerAddressInput>(customer.AddressesJson).Count > 0
            ? DeserializeList<CustomerAddressInput>(customer.AddressesJson)
            : string.IsNullOrWhiteSpace(customer.BillingAddress)
                ? Array.Empty<CustomerAddressInput>()
                : new[]
                {
                    new CustomerAddressInput
                    {
                        AddressName = "Primary",
                        StreetAddress = customer.BillingAddress,
                        IsDefaultBilling = true,
                        IsDefaultShipping = true,
                    },
                },
        ReceivableAccountId = customer.ReceivableAccountId,
        ReceivableAccount = customer.ReceivableAccount,
        CreditLimit = customer.CreditLimit,
        PayableAccountId = customer.PayableAccountId,
        PayableAccount = customer.PayableAccount,
        Groups = DeserializeList<string>(customer.GroupsJson),
        PriceLevel = customer.PriceLevel,
        Currency = customer.Currency,
        PaymentTerm = customer.PaymentTerm,
        IncomeAccountId = customer.IncomeAccountId,
        IncomeAccount = customer.IncomeAccount,
        ExpenseAccountId = customer.ExpenseAccountId,
        ExpenseAccount = customer.ExpenseAccount,
        Location = customer.Location,
        Tags = DeserializeList<string>(customer.TagsJson),
        MyInvoisControl = customer.MyInvoisControl,
    };

    private sealed record AccountSelection(Guid? AccountId, string AccountCode)
    {
        public static readonly AccountSelection Empty = new(null, string.Empty);
    }
}
