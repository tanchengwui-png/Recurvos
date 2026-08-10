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

    private static readonly HashSet<string> AllowedBatchListOperations = new(StringComparer.OrdinalIgnoreCase)
    {
        "Append",
        "Replace",
        "Remove",
    };

    public async Task<IReadOnlyCollection<CustomerDto>> GetAsync(CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(GetCompanyId().ToString()))
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return customers.Select(BuildCustomerDto).ToList();
    }

    public async Task<CustomerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureReadAccessAsync(cancellationToken);
        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(x => x.CompanyIdsJson.Contains(GetCompanyId().ToString()) && x.Id == id, cancellationToken);
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
        var companyIds = await ValidateCompanyAssignmentsAsync(request.CompanyIds?.Any() == true ? request.CompanyIds : new[] { GetCompanyId() }, cancellationToken);
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
            CompanyIdsJson = SerializeList(companyIds),
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
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyIdsJson.Contains(GetCompanyId().ToString()) && x.Id == id, cancellationToken);
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
        var companyIds = await ValidateCompanyAssignmentsAsync(request.CompanyIds, cancellationToken);
        ValidateConditionalFields(contactType, request.ReceivableAccount, request.PayableAccount);
        var receivableAccount = await ResolveAccountSelectionAsync(request.ReceivableAccountId, request.ReceivableAccount, AccountType.Asset, "Receivable account", cancellationToken);
        var payableAccount = await ResolveAccountSelectionAsync(request.PayableAccountId, request.PayableAccount, AccountType.Liability, "Payable account", cancellationToken);
        var incomeAccount = await ResolveAccountSelectionAsync(request.IncomeAccountId, request.IncomeAccount, AccountType.Revenue, "Income account", cancellationToken);
        var expenseAccount = await ResolveAccountSelectionAsync(request.ExpenseAccountId, request.ExpenseAccount, AccountType.Expense, "Expense account", cancellationToken);
        var priceLevel = await ValidatePriceLevelAsync(request.PriceLevel, cancellationToken);
        var currency = await ValidateCurrencyAsync(request.Currency, cancellationToken);
        var paymentTerm = await ValidatePaymentTermAsync(request.PaymentTerm, cancellationToken);

        customer.EntityType = entityType;
        customer.CompanyIdsJson = SerializeList(companyIds);
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

    public async Task<CustomerBatchUpdateResult> BatchUpdateAsync(CustomerBatchUpdateRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var selectedIds = request.CustomerIds
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();

        if (selectedIds.Length == 0)
        {
            throw new InvalidOperationException("Select at least one contact to update.");
        }

        var updatedFields = GetSelectedBatchUpdateFields(request.Fields).ToArray();
        if (updatedFields.Length == 0)
        {
            throw new InvalidOperationException("Select at least one field to update.");
        }

        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(GetCompanyId().ToString()) && selectedIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        var foundIds = customers.Select(customer => customer.Id).ToHashSet();
        var failedIds = selectedIds.Where(id => !foundIds.Contains(id)).ToList();

        if (customers.Count == 0)
        {
            return new CustomerBatchUpdateResult
            {
                RequestedCount = selectedIds.Length,
                SuccessCount = 0,
                FailureCount = failedIds.Count,
                FailedCustomerIds = failedIds,
                UpdatedFields = updatedFields,
                Customers = Array.Empty<CustomerDto>(),
            };
        }

        var values = request.Values ?? new CustomerBatchUpdateValues();
        var modes = request.Modes ?? new CustomerBatchUpdateListModes();
        var targets = request.Targets ?? new CustomerBatchUpdateTargets();
        var legalName = string.Empty;
        var email = new List<string>();
        var phoneNumber = new List<string>();
        var contactPersons = new List<CustomerContactPersonInput>();
        var targetContactPersons = new List<CustomerContactPersonInput>();
        var phoneNumbers = new List<string>();
        var targetPhoneNumbers = new List<string>();
        var emailAddresses = new List<string>();
        var targetEmailAddresses = new List<string>();
        var addresses = new List<CustomerAddressInput>();
        var targetAddresses = new List<CustomerAddressInput>();
        var contactType = string.Empty;
        var status = string.Empty;
        var groups = new List<string>();
        var targetGroups = new List<string>();
        var tags = new List<string>();
        var targetTags = new List<string>();
        var receivableAccount = AccountSelection.Empty;
        var payableAccount = AccountSelection.Empty;
        var incomeAccount = AccountSelection.Empty;
        var expenseAccount = AccountSelection.Empty;
        var priceLevel = string.Empty;
        var currency = string.Empty;
        var paymentTerm = string.Empty;
        var contactPersonsMode = "Replace";
        var phoneNumbersMode = "Replace";
        var emailAddressesMode = "Replace";
        var addressesMode = "Replace";
        var groupsMode = "Replace";
        var tagsMode = "Replace";

        if (request.Fields.LegalName)
        {
            legalName = NormalizeLegalName(values.LegalName, values.LegalName);
        }

        if (request.Fields.Email)
        {
            email = NormalizeEmailList(new[] { values.Email });
        }

        if (request.Fields.PhoneNumber)
        {
            phoneNumber = NormalizeStringList(new[] { values.PhoneNumber });
        }

        if (request.Fields.ContactPersons)
        {
            contactPersons = NormalizeContactPersons(values.ContactPersons);
            contactPersonsMode = NormalizeBatchUpdateListMode(modes.ContactPersons);
            targetContactPersons = NormalizeContactPersons(targets.ContactPersons);
            ValidateTargetedBatchOperation(contactPersonsMode, targetContactPersons, "Contact Persons");
        }

        if (request.Fields.PhoneNumbers)
        {
            phoneNumbers = NormalizeStringList(values.PhoneNumbers);
            phoneNumbersMode = NormalizeBatchUpdateListMode(modes.PhoneNumbers);
            targetPhoneNumbers = NormalizeStringList(targets.PhoneNumbers);
            ValidateTargetedBatchOperation(phoneNumbersMode, targetPhoneNumbers, "Phone Numbers");
        }

        if (request.Fields.EmailAddresses)
        {
            emailAddresses = NormalizeStringList(values.EmailAddresses);
            emailAddressesMode = NormalizeBatchUpdateListMode(modes.EmailAddresses);
            targetEmailAddresses = NormalizeStringList(targets.EmailAddresses);
            ValidateTargetedBatchOperation(emailAddressesMode, targetEmailAddresses, "Email Addresses");
        }

        if (request.Fields.Addresses)
        {
            addresses = NormalizeAddresses(values.Addresses, string.Empty);
            addressesMode = NormalizeBatchUpdateListMode(modes.Addresses);
            targetAddresses = NormalizeAddresses(targets.Addresses, string.Empty);
            ValidateTargetedBatchOperation(addressesMode, targetAddresses, "Addresses");
        }

        if (request.Fields.ContactType)
        {
            contactType = NormalizeContactType(values.ContactType);
        }

        if (request.Fields.Status)
        {
            status = NormalizeStatus(values.Status);
        }

        if (request.Fields.Groups)
        {
            groups = NormalizeStringList(values.Groups);
            groupsMode = NormalizeBatchUpdateListMode(modes.Groups);
            targetGroups = NormalizeStringList(targets.Groups);
            ValidateTargetedBatchOperation(groupsMode, targetGroups, "Contact Groups");
        }

        if (request.Fields.Tags)
        {
            tags = NormalizeStringList(values.Tags);
            tagsMode = NormalizeBatchUpdateListMode(modes.Tags);
            targetTags = NormalizeStringList(targets.Tags);
            ValidateTargetedBatchOperation(tagsMode, targetTags, "Tags");
        }

        if (request.Fields.ReceivableAccount)
        {
            receivableAccount = await ResolveAccountSelectionAsync(values.ReceivableAccountId, values.ReceivableAccount, AccountType.Asset, "Receivable account", cancellationToken);
        }

        if (request.Fields.PayableAccount)
        {
            payableAccount = await ResolveAccountSelectionAsync(values.PayableAccountId, values.PayableAccount, AccountType.Liability, "Payable account", cancellationToken);
        }

        if (request.Fields.IncomeAccount)
        {
            incomeAccount = await ResolveAccountSelectionAsync(values.IncomeAccountId, values.IncomeAccount, AccountType.Revenue, "Income account", cancellationToken);
        }

        if (request.Fields.ExpenseAccount)
        {
            expenseAccount = await ResolveAccountSelectionAsync(values.ExpenseAccountId, values.ExpenseAccount, AccountType.Expense, "Expense account", cancellationToken);
        }

        if (request.Fields.PriceLevel)
        {
            priceLevel = await ValidatePriceLevelAsync(values.PriceLevel, cancellationToken);
        }

        if (request.Fields.Currency)
        {
            currency = await ValidateCurrencyAsync(values.Currency, cancellationToken);
        }

        if (request.Fields.PaymentTerm)
        {
            paymentTerm = await ValidatePaymentTermAsync(values.PaymentTerm, cancellationToken);
        }

        if (request.Fields.ContactType || request.Fields.ReceivableAccount || request.Fields.PayableAccount)
        {
            foreach (var customer in customers)
            {
                var effectiveContactType = request.Fields.ContactType ? contactType : customer.ContactType;
                var types = effectiveContactType.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var isCustomer = types.Any(item => item.Equals("Customer", StringComparison.OrdinalIgnoreCase));
                var isSupplier = types.Any(item => item.Equals("Supplier", StringComparison.OrdinalIgnoreCase));
                var effectiveReceivableAccount = request.Fields.ReceivableAccount ? receivableAccount.AccountCode : customer.ReceivableAccount;
                var effectivePayableAccount = request.Fields.PayableAccount ? payableAccount.AccountCode : customer.PayableAccount;

                if ((request.Fields.ContactType || request.Fields.ReceivableAccount) && isCustomer && string.IsNullOrWhiteSpace(effectiveReceivableAccount))
                {
                    throw new InvalidOperationException("Receivable account is required when Customer is selected.");
                }

                if ((request.Fields.ContactType || request.Fields.PayableAccount) && isSupplier && string.IsNullOrWhiteSpace(effectivePayableAccount))
                {
                    throw new InvalidOperationException("Payable account is required when Supplier is selected.");
                }
            }
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var updatedAtUtc = DateTime.UtcNow;
        foreach (var customer in customers)
        {
            if (request.Fields.LegalName)
            {
                customer.LegalName = legalName;
                customer.Name = legalName;
            }

            if (request.Fields.Email)
            {
                customer.Email = email.FirstOrDefault() ?? string.Empty;
                customer.EmailAddressesJson = SerializeList(email);
            }

            if (request.Fields.PhoneNumber)
            {
                customer.PhoneNumber = phoneNumber.FirstOrDefault() ?? string.Empty;
                customer.PhoneNumbersJson = SerializeList(phoneNumber);
            }

            if (request.Fields.ContactPersons)
            {
                var nextContactPersons = ApplyContactPersonOperation(GetStoredContactPersons(customer), contactPersons, targetContactPersons, contactPersonsMode);
                customer.ContactPersonsJson = SerializeList(nextContactPersons);
            }

            if (request.Fields.PhoneNumbers)
            {
                var nextPhoneNumbers = ApplyStringListOperation(GetStoredPhoneNumbers(customer), phoneNumbers, targetPhoneNumbers, phoneNumbersMode);
                customer.PhoneNumbersJson = SerializeList(nextPhoneNumbers);
                customer.PhoneNumber = nextPhoneNumbers.FirstOrDefault() ?? string.Empty;
            }

            if (request.Fields.EmailAddresses)
            {
                var nextEmailAddresses = ApplyStringListOperation(GetStoredEmailAddresses(customer), emailAddresses, targetEmailAddresses, emailAddressesMode);
                customer.EmailAddressesJson = SerializeList(nextEmailAddresses);
                customer.Email = nextEmailAddresses.FirstOrDefault() ?? string.Empty;
            }

            if (request.Fields.Addresses)
            {
                var nextAddresses = ApplyAddressOperation(GetStoredAddresses(customer), addresses, targetAddresses, addressesMode);
                customer.AddressesJson = SerializeList(nextAddresses);
                customer.BillingAddress = BuildBillingAddress(nextAddresses, string.Empty);
            }

            if (request.Fields.ContactType)
            {
                customer.ContactType = contactType;
            }

            if (request.Fields.Status)
            {
                customer.Status = status;
            }

            if (request.Fields.ReceivableAccount)
            {
                customer.ReceivableAccountId = receivableAccount.AccountId;
                customer.ReceivableAccount = receivableAccount.AccountCode;
            }

            if (request.Fields.CreditLimit)
            {
                customer.CreditLimit = values.CreditLimit;
            }

            if (request.Fields.PayableAccount)
            {
                customer.PayableAccountId = payableAccount.AccountId;
                customer.PayableAccount = payableAccount.AccountCode;
            }

            if (request.Fields.Groups)
            {
                customer.GroupsJson = SerializeList(ApplyStringListOperation(DeserializeList<string>(customer.GroupsJson), groups, targetGroups, groupsMode));
            }

            if (request.Fields.PriceLevel)
            {
                customer.PriceLevel = priceLevel;
            }

            if (request.Fields.Currency)
            {
                customer.Currency = currency;
            }

            if (request.Fields.PaymentTerm)
            {
                customer.PaymentTerm = paymentTerm;
            }

            if (request.Fields.IncomeAccount)
            {
                customer.IncomeAccountId = incomeAccount.AccountId;
                customer.IncomeAccount = incomeAccount.AccountCode;
            }

            if (request.Fields.ExpenseAccount)
            {
                customer.ExpenseAccountId = expenseAccount.AccountId;
                customer.ExpenseAccount = expenseAccount.AccountCode;
            }

            if (request.Fields.Location)
            {
                customer.Location = values.Location.Trim();
            }

            if (request.Fields.Tags)
            {
                customer.TagsJson = SerializeList(ApplyStringListOperation(DeserializeList<string>(customer.TagsJson), tags, targetTags, tagsMode));
            }

            if (request.Fields.MyInvoisControl)
            {
                customer.MyInvoisControl = values.MyInvoisControl.Trim();
            }

            customer.UpdatedAtUtc = updatedAtUtc;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync(
            "customer.batch_updated",
            nameof(Customer),
            string.Join(",", customers.Select(customer => customer.Id)),
            $"{customers.Count} contacts updated: {string.Join(", ", updatedFields)}",
            cancellationToken);

        return new CustomerBatchUpdateResult
        {
            RequestedCount = selectedIds.Length,
            SuccessCount = customers.Count,
            FailureCount = failedIds.Count,
            FailedCustomerIds = failedIds,
            UpdatedFields = updatedFields,
            Customers = customers.Select(BuildCustomerDto).ToArray(),
        };
    }

    public async Task<CustomerBatchUpdateResult> BatchUpdateGridAsync(CustomerGridBatchUpdateRequest request, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var records = request.Records
            .Where(record => record.CustomerId != Guid.Empty)
            .GroupBy(record => record.CustomerId)
            .Select(group => group.Last())
            .ToArray();

        if (records.Length == 0)
        {
            throw new InvalidOperationException("There are no contact changes to save.");
        }

        var selectedIds = records.Select(record => record.CustomerId).ToArray();
        var customers = await dbContext.Customers
            .Where(x => x.CompanyIdsJson.Contains(GetCompanyId().ToString()) && selectedIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        var customersById = customers.ToDictionary(customer => customer.Id);
        var failedIds = selectedIds.Where(id => !customersById.ContainsKey(id)).ToList();
        var updatedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var updatedAtUtc = DateTime.UtcNow;

        foreach (var record in records)
        {
            if (!customersById.TryGetValue(record.CustomerId, out var customer))
            {
                continue;
            }

            var fields = record.Fields;
            ValidateGridFieldSelection(fields);
            var values = record.Values ?? new CustomerBatchUpdateValues();
            var selectedFields = GetSelectedBatchUpdateFields(fields).ToArray();
            if (selectedFields.Length == 0)
            {
                continue;
            }

            foreach (var field in selectedFields)
            {
                updatedFields.Add(field);
            }

            var contactType = fields.ContactType ? NormalizeContactType(values.ContactType) : customer.ContactType;
            var status = fields.Status ? NormalizeStatus(values.Status) : customer.Status;
            var groups = fields.Groups ? NormalizeStringList(values.Groups) : DeserializeList<string>(customer.GroupsJson);
            var tags = fields.Tags ? NormalizeStringList(values.Tags) : DeserializeList<string>(customer.TagsJson);
            var receivableAccount = fields.ReceivableAccount
                ? await ResolveAccountSelectionAsync(values.ReceivableAccountId, values.ReceivableAccount, AccountType.Asset, "Receivable account", cancellationToken)
                : AccountSelection.Empty;
            var payableAccount = fields.PayableAccount
                ? await ResolveAccountSelectionAsync(values.PayableAccountId, values.PayableAccount, AccountType.Liability, "Payable account", cancellationToken)
                : AccountSelection.Empty;
            var incomeAccount = fields.IncomeAccount
                ? await ResolveAccountSelectionAsync(values.IncomeAccountId, values.IncomeAccount, AccountType.Revenue, "Income account", cancellationToken)
                : AccountSelection.Empty;
            var expenseAccount = fields.ExpenseAccount
                ? await ResolveAccountSelectionAsync(values.ExpenseAccountId, values.ExpenseAccount, AccountType.Expense, "Expense account", cancellationToken)
                : AccountSelection.Empty;
            var priceLevel = fields.PriceLevel ? await ValidatePriceLevelAsync(values.PriceLevel, cancellationToken) : customer.PriceLevel;
            var currency = fields.Currency ? await ValidateCurrencyAsync(values.Currency, cancellationToken) : customer.Currency;
            var paymentTerm = fields.PaymentTerm ? await ValidatePaymentTermAsync(values.PaymentTerm, cancellationToken) : customer.PaymentTerm;

            if (fields.ContactType || fields.ReceivableAccount || fields.PayableAccount)
            {
                var types = contactType.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var isCustomer = types.Any(item => item.Equals("Customer", StringComparison.OrdinalIgnoreCase));
                var isSupplier = types.Any(item => item.Equals("Supplier", StringComparison.OrdinalIgnoreCase));
                var effectiveReceivableAccount = fields.ReceivableAccount ? receivableAccount.AccountCode : customer.ReceivableAccount;
                var effectivePayableAccount = fields.PayableAccount ? payableAccount.AccountCode : customer.PayableAccount;

                if ((fields.ContactType || fields.ReceivableAccount) && isCustomer && string.IsNullOrWhiteSpace(effectiveReceivableAccount))
                {
                    throw new InvalidOperationException("Receivable account is required when Customer is selected.");
                }

                if ((fields.ContactType || fields.PayableAccount) && isSupplier && string.IsNullOrWhiteSpace(effectivePayableAccount))
                {
                    throw new InvalidOperationException("Payable account is required when Supplier is selected.");
                }
            }

            if (fields.LegalName)
            {
                var legalName = NormalizeLegalName(values.LegalName, customer.Name);
                customer.LegalName = legalName;
                customer.Name = legalName;
            }

            if (fields.Email)
            {
                var emails = NormalizeEmailList(new[] { values.Email });
                customer.Email = emails[0];
                customer.EmailAddressesJson = SerializeList(emails);
            }

            if (fields.PhoneNumber)
            {
                var phoneNumbers = NormalizeStringList(new[] { values.PhoneNumber });
                customer.PhoneNumber = phoneNumbers.FirstOrDefault() ?? string.Empty;
                customer.PhoneNumbersJson = SerializeList(phoneNumbers);
            }

            if (fields.ContactType) customer.ContactType = contactType;
            if (fields.Status) customer.Status = status;
            if (fields.ReceivableAccount)
            {
                customer.ReceivableAccountId = receivableAccount.AccountId;
                customer.ReceivableAccount = receivableAccount.AccountCode;
            }
            if (fields.CreditLimit) customer.CreditLimit = values.CreditLimit;
            if (fields.PayableAccount)
            {
                customer.PayableAccountId = payableAccount.AccountId;
                customer.PayableAccount = payableAccount.AccountCode;
            }
            if (fields.Groups) customer.GroupsJson = SerializeList(groups);
            if (fields.PriceLevel) customer.PriceLevel = priceLevel;
            if (fields.Currency) customer.Currency = currency;
            if (fields.PaymentTerm) customer.PaymentTerm = paymentTerm;
            if (fields.IncomeAccount)
            {
                customer.IncomeAccountId = incomeAccount.AccountId;
                customer.IncomeAccount = incomeAccount.AccountCode;
            }
            if (fields.ExpenseAccount)
            {
                customer.ExpenseAccountId = expenseAccount.AccountId;
                customer.ExpenseAccount = expenseAccount.AccountCode;
            }
            if (fields.Location) customer.Location = values.Location.Trim();
            if (fields.Tags) customer.TagsJson = SerializeList(tags);
            if (fields.MyInvoisControl) customer.MyInvoisControl = values.MyInvoisControl.Trim();

            customer.UpdatedAtUtc = updatedAtUtc;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await auditService.WriteAsync(
            "customer.batch_grid_updated",
            nameof(Customer),
            string.Join(",", customers.Select(customer => customer.Id)),
            $"{customers.Count} contacts grid-updated: {string.Join(", ", updatedFields)}",
            cancellationToken);

        return new CustomerBatchUpdateResult
        {
            RequestedCount = records.Length,
            SuccessCount = customers.Count,
            FailureCount = failedIds.Count,
            FailedCustomerIds = failedIds,
            UpdatedFields = updatedFields.ToArray(),
            Customers = customers.Select(BuildCustomerDto).ToArray(),
        };
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await featureEntitlementService.EnsureCurrentUserHasFeatureAsync(PlatformFeatureKeys.CustomerManagement, cancellationToken);
        var customer = await dbContext.Customers.FirstOrDefaultAsync(x => x.CompanyIdsJson.Contains(GetCompanyId().ToString()) && x.Id == id, cancellationToken);
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
    private Guid GetCompanyId() => currentUserService.CompanyId ?? throw new UnauthorizedAccessException();

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
        if (normalized.Count == 0 && !string.IsNullOrWhiteSpace(fallbackValue))
        {
            throw new InvalidOperationException("At least one email address is required.");
        }

        return normalized;
    }

    private static List<CustomerContactPersonInput> NormalizeContactPersons(IEnumerable<CustomerContactPersonInput>? values)
    {
        return (values ?? Array.Empty<CustomerContactPersonInput>())
            .Select(person => new CustomerContactPersonInput
            {
                Name = person.Name.Trim(),
                Role = person.Role.Trim(),
                Email = person.Email.Trim(),
                PhoneNumber = person.PhoneNumber.Trim(),
            })
            .Where(HasAnyContactPersonValue)
            .DistinctBy(GetContactPersonKey)
            .ToList();
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

        var defaultBillingIndex = normalized.FindIndex(address => address.IsDefaultBilling);
        var defaultShippingIndex = normalized.FindIndex(address => address.IsDefaultShipping);

        return normalized
            .Select((address, index) => new CustomerAddressInput
            {
                AddressName = address.AddressName,
                StreetAddress = address.StreetAddress,
                AddressLine2 = address.AddressLine2,
                AddressLine3 = address.AddressLine3,
                City = address.City,
                Postcode = address.Postcode,
                Country = address.Country,
                State = address.State,
                IsDefaultBilling = index == defaultBillingIndex,
                IsDefaultShipping = index == defaultShippingIndex,
            })
            .ToList();
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

    private static string NormalizeBatchUpdateListMode(string? value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? "Replace" : value.Trim();
        if (!AllowedBatchListOperations.Contains(normalized))
        {
            throw new InvalidOperationException("Batch list mode must be Append, Replace, or Remove.");
        }

        return AllowedBatchListOperations.First(item => item.Equals(normalized, StringComparison.OrdinalIgnoreCase));
    }

    private static List<string> ApplyStringListOperation(
        IEnumerable<string> currentValues,
        IEnumerable<string> incomingValues,
        IEnumerable<string> targetValues,
        string mode)
    {
        var current = NormalizeStringList(currentValues);
        var incoming = NormalizeStringList(incomingValues);
        var targets = NormalizeStringList(targetValues);

        return mode switch
        {
            "Append" => NormalizeStringList(current.Concat(incoming)),
            "Remove" => current.Where(value => !targets.Contains(value, StringComparer.OrdinalIgnoreCase)).ToList(),
            "Replace" when targets.Count > 0 => NormalizeStringList(current.Where(value => !targets.Contains(value, StringComparer.OrdinalIgnoreCase)).Concat(incoming)),
            _ => incoming,
        };
    }

    private static List<CustomerContactPersonInput> ApplyContactPersonOperation(
        IEnumerable<CustomerContactPersonInput> currentValues,
        IEnumerable<CustomerContactPersonInput> incomingValues,
        IEnumerable<CustomerContactPersonInput> targetValues,
        string mode)
    {
        var current = NormalizeContactPersons(currentValues);
        var incoming = NormalizeContactPersons(incomingValues);
        var targets = NormalizeContactPersons(targetValues);
        var targetKeys = targets.Select(GetContactPersonKey).ToHashSet(StringComparer.OrdinalIgnoreCase);

        return mode switch
        {
            "Append" => current
                .Concat(incoming)
                .DistinctBy(GetContactPersonKey)
                .ToList(),
            "Remove" => current.Where(person => !targetKeys.Contains(GetContactPersonKey(person))).ToList(),
            "Replace" when targetKeys.Count > 0 => current
                .Where(person => !targetKeys.Contains(GetContactPersonKey(person)))
                .Concat(incoming)
                .DistinctBy(GetContactPersonKey)
                .ToList(),
            _ => incoming,
        };
    }

    private static List<CustomerAddressInput> ApplyAddressOperation(
        IEnumerable<CustomerAddressInput> currentValues,
        IEnumerable<CustomerAddressInput> incomingValues,
        IEnumerable<CustomerAddressInput> targetValues,
        string mode)
    {
        var current = NormalizeAddresses(currentValues, string.Empty);
        var incoming = NormalizeAddresses(incomingValues, string.Empty);
        var targets = NormalizeAddresses(targetValues, string.Empty);
        var targetKeys = targets.Select(GetAddressKey).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var result = mode switch
        {
            "Append" => current
                .Concat(incoming)
                .DistinctBy(GetAddressKey)
                .ToList(),
            "Remove" => current.Where(address => !targetKeys.Contains(GetAddressKey(address))).ToList(),
            "Replace" when targetKeys.Count > 0 => current
                .Where(address => !targetKeys.Contains(GetAddressKey(address)))
                .Concat(incoming)
                .DistinctBy(GetAddressKey)
                .ToList(),
            _ => incoming,
        };

        return NormalizeAddresses(result, string.Empty);
    }

    private static void ValidateTargetedBatchOperation<T>(string mode, IReadOnlyCollection<T> targets, string fieldName)
    {
        if ((mode.Equals("Replace", StringComparison.OrdinalIgnoreCase) || mode.Equals("Remove", StringComparison.OrdinalIgnoreCase))
            && targets.Count == 0)
        {
            throw new InvalidOperationException($"Select at least one existing {fieldName} value to {mode.ToLowerInvariant()}.");
        }
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

    private static IEnumerable<string> GetSelectedBatchUpdateFields(CustomerBatchUpdateFieldSelection fields)
    {
        if (fields.LegalName) yield return "Legal Name";
        if (fields.Email) yield return "Email";
        if (fields.PhoneNumber) yield return "Phone Number";
        if (fields.ContactPersons) yield return "Contact Persons";
        if (fields.PhoneNumbers) yield return "Phone Numbers";
        if (fields.EmailAddresses) yield return "Email Addresses";
        if (fields.Addresses) yield return "Addresses";
        if (fields.ContactType) yield return "Contact Type";
        if (fields.Status) yield return "Status";
        if (fields.ReceivableAccount) yield return "Receivable Account";
        if (fields.CreditLimit) yield return "Credit Limit";
        if (fields.PayableAccount) yield return "Payable Account";
        if (fields.Groups) yield return "Contact Groups";
        if (fields.PriceLevel) yield return "Price Level";
        if (fields.Currency) yield return "Currency";
        if (fields.PaymentTerm) yield return "Payment Term";
        if (fields.IncomeAccount) yield return "Income Account";
        if (fields.ExpenseAccount) yield return "Expense Account";
        if (fields.Location) yield return "Location";
        if (fields.Tags) yield return "Tags";
        if (fields.MyInvoisControl) yield return "MyInvois Control";
    }

    private static void ValidateGridFieldSelection(CustomerBatchUpdateFieldSelection fields)
    {
        if (fields.ContactPersons
            || fields.PhoneNumbers
            || fields.EmailAddresses
            || fields.Addresses
            || fields.Groups
            || fields.Tags)
        {
            throw new InvalidOperationException("Columns only support single-value fields. Use Bulk Actions for multi-value fields.");
        }
    }

    private static string GetContactPersonKey(CustomerContactPersonInput person) =>
        string.Join("\u001f", person.Name, person.Role, person.Email, person.PhoneNumber).ToLowerInvariant();

    private static string GetAddressKey(CustomerAddressInput address) =>
        string.Join(
            "\u001f",
            address.AddressName,
            address.StreetAddress,
            address.AddressLine2,
            address.AddressLine3,
            address.City,
            address.Postcode,
            address.Country,
            address.State,
            address.IsDefaultBilling,
            address.IsDefaultShipping).ToLowerInvariant();

    private static List<CustomerContactPersonInput> GetStoredContactPersons(Customer customer) =>
        NormalizeContactPersons(DeserializeList<CustomerContactPersonInput>(customer.ContactPersonsJson));

    private static List<string> GetStoredPhoneNumbers(Customer customer) =>
        DeserializeList<string>(customer.PhoneNumbersJson)
            .DefaultIfEmpty(customer.PhoneNumber)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToList();

    private static List<string> GetStoredEmailAddresses(Customer customer) =>
        DeserializeList<string>(customer.EmailAddressesJson)
            .DefaultIfEmpty(customer.Email)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToList();

    private static List<CustomerAddressInput> GetStoredAddresses(Customer customer)
    {
        var addresses = DeserializeList<CustomerAddressInput>(customer.AddressesJson);
        if (addresses.Count > 0)
        {
            return NormalizeAddresses(addresses, string.Empty);
        }

        if (string.IsNullOrWhiteSpace(customer.BillingAddress))
        {
            return new List<CustomerAddressInput>();
        }

        return NormalizeAddresses(new[]
        {
            new CustomerAddressInput
            {
                AddressName = "Primary",
                StreetAddress = customer.BillingAddress,
                IsDefaultBilling = true,
                IsDefaultShipping = true,
            },
        }, string.Empty);
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
        CompanyIds = DeserializeList<Guid>(customer.CompanyIdsJson),
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

    private async Task<IReadOnlyCollection<Guid>> ValidateCompanyAssignmentsAsync(IEnumerable<Guid>? companyIds, CancellationToken cancellationToken)
    {
        var requestedIds = (companyIds ?? Array.Empty<Guid>()).Where(id => id != Guid.Empty).Distinct().ToArray();
        if (requestedIds.Length == 0)
        {
            return Array.Empty<Guid>();
        }

        var assignedCount = await dbContext.CompanyMemberships.CountAsync(
            membership => membership.UserId == GetSubscriberId() && membership.IsActive && requestedIds.Contains(membership.CompanyId),
            cancellationToken);
        if (assignedCount != requestedIds.Length)
        {
            throw new InvalidOperationException("One or more selected companies are unavailable.");
        }

        return requestedIds;
    }

    private sealed record AccountSelection(Guid? AccountId, string AccountCode)
    {
        public static readonly AccountSelection Empty = new(null, string.Empty);
    }
}
