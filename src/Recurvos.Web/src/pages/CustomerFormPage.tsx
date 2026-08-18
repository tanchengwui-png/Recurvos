import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormActionSection } from "../components/ui/FormActionSection";
import { FormPageBody } from "../components/ui/FormPageBody";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { StandardFormLayout } from "../components/ui/StandardFormLayout";
import { AccountSelect } from "../components/ui/AccountSelect";
import { PhoneNumberField } from "../components/ui/PhoneNumberField";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { api } from "../lib/api";
import { countryOptions, currencyOptions, malaysiaStateOptions } from "../lib/localeOptions";
import { combinePhoneNumber, splitStoredPhoneNumber } from "../lib/phoneNumbers";
import type { SearchableSelectOption } from "../lib/localeOptions";
import type { ContactAddress, ContactGroup, ContactPerson, Customer, MasterDataSnapshot } from "../types";

const contactTypeOptions = ["Customer", "Supplier", "Employee"] as const;
const entityTypeOptions = ["Company", "Individual", "General Public", "Foreign Company", "Foreign Individual", "Exempted Person"] as const;
const statusOptions = ["Active", "Inactive", "Archived"] as const;
const myInvoisControlOptions = ["Default", "Enabled", "Disabled"] as const;
const contactRegistrationNumberTypeOptions: SearchableSelectOption[] = [
  { value: "", label: "None" },
  { value: "NRIC", label: "NRIC" },
  { value: "Passport", label: "Passport" },
  { value: "BRN", label: "BRN" },
  { value: "Army", label: "Army" },
  { value: "Other", label: "Other" },
];

type ContactFormState = {
  legalName: string;
  otherName: string;
  entityType: Customer["entityType"];
  registrationNumberType: string;
  registrationNumber: string;
  oldRegistrationNumber: string;
  tin: string;
  sstRegistrationNumber: string;
  contactTypes: string[];
  status: Customer["status"];
  contactPersons: ContactPerson[];
  phoneNumbers: string[];
  emailAddresses: string[];
  addresses: ContactAddress[];
  receivableAccount: string;
  creditLimit: string;
  payableAccount: string;
  groups: string[];
  priceLevel: string;
  currency: string;
  paymentTerm: string;
  incomeAccount: string;
  expenseAccount: string;
  location: string;
  tags: string[];
  myInvoisControl: string;
  externalReference: string;
};

const emptyContactPerson = (): ContactPerson => ({
  name: "",
  role: "",
  email: "",
  phoneNumber: "",
});

const emptyAddress = (): ContactAddress => ({
  addressName: "",
  streetAddress: "",
  addressLine2: "",
  addressLine3: "",
  city: "",
  postcode: "",
  country: "",
  state: "",
  isDefaultBilling: false,
  isDefaultShipping: false,
});

const emptyForm = (): ContactFormState => ({
  legalName: "",
  otherName: "",
  entityType: "Company",
  registrationNumberType: "",
  registrationNumber: "",
  oldRegistrationNumber: "",
  tin: "",
  sstRegistrationNumber: "",
  contactTypes: ["Customer"],
  status: "Active",
  contactPersons: [emptyContactPerson()],
  phoneNumbers: [""],
  emailAddresses: [""],
  addresses: [{ ...emptyAddress(), isDefaultBilling: true, isDefaultShipping: true }],
  receivableAccount: "",
  creditLimit: "",
  payableAccount: "",
  groups: [],
  priceLevel: "",
  currency: "MYR",
  paymentTerm: "",
  incomeAccount: "",
  expenseAccount: "",
  location: "",
  tags: [],
  myInvoisControl: "Default",
  externalReference: "",
});

function parseContactTypes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureDefaultAddresses(addresses: ContactAddress[]) {
  if (addresses.length === 0) {
    return [{ ...emptyAddress(), isDefaultBilling: true, isDefaultShipping: true }];
  }

  const next = addresses.map((address) => ({ ...address }));

  if (!next.some((address) => address.isDefaultBilling)) {
    next[0].isDefaultBilling = true;
  }

  if (!next.some((address) => address.isDefaultShipping)) {
    next[0].isDefaultShipping = true;
  }

  return next.map((address, index) => ({
    ...address,
    isDefaultBilling: address.isDefaultBilling && next.findIndex((item) => item.isDefaultBilling) === index,
    isDefaultShipping: address.isDefaultShipping && next.findIndex((item) => item.isDefaultShipping) === index,
  }));
}

function getAddressSummary(address: ContactAddress) {
  return [
    [address.streetAddress.trim(), address.addressLine2.trim(), address.addressLine3.trim()].filter(Boolean).join(", "),
    [address.city.trim(), address.state.trim(), address.postcode.trim()].filter(Boolean).join(", "),
    address.country.trim(),
  ].filter(Boolean);
}

function normalizeUniqueStrings(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean).filter((item, index, list) => list.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index);
}

function normalizePhoneNumbers(values: string[]) {
  return normalizeUniqueStrings(values.map((value) => {
    const parsed = splitStoredPhoneNumber(value);
    return combinePhoneNumber(parsed.countryCode, parsed.phoneNumber);
  }));
}

function isCompanyLikeEntity(entityType: Customer["entityType"]) {
  return entityType === "Company" || entityType === "Foreign Company";
}

function getRegistrationNumberPlaceholder(registrationNumberType: string) {
  switch (registrationNumberType) {
    case "NRIC":
      return "NRIC number";
    case "Passport":
      return "Passport number";
    case "BRN":
      return "Business registration number";
    case "Army":
      return "Army number";
    case "Other":
      return "Registration number";
    default:
      return "No registration number required";
  }
}

function mergeGroupOptions(groups: ContactGroup[], selectedGroups: string[]) {
  const merged = new Map<string, string>();

  groups.forEach((group) => {
    merged.set(group.name.toLowerCase(), group.name);
  });

  selectedGroups.forEach((group) => {
    if (group.trim()) {
      merged.set(group.trim().toLowerCase(), group.trim());
    }
  });

  return Array.from(merged.values()).sort((left, right) => left.localeCompare(right));
}

function mergeLookupOptions(existingValues: string[], selectedValues: string[]) {
  const merged = new Map<string, string>();

  existingValues.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed) {
      merged.set(trimmed.toLowerCase(), trimmed);
    }
  });

  selectedValues.forEach((value) => {
    const trimmed = value.trim();
    if (trimmed) {
      merged.set(trimmed.toLowerCase(), trimmed);
    }
  });

  return Array.from(merged.values()).sort((left, right) => left.localeCompare(right));
}

type MultiValueLookupProps = {
  values: string[];
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  addLabel: string;
  emptyText: string;
  ariaLabel: string;
  onChange: (values: string[]) => void;
  onCreate?: (value: string) => Promise<string> | string;
};

function MultiValueLookup({
  values,
  options,
  placeholder,
  searchPlaceholder,
  addLabel,
  emptyText,
  ariaLabel,
  onChange,
  onCreate,
}: MultiValueLookupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedValues = normalizeUniqueStrings(values);
  const mergedOptions = mergeLookupOptions(options, selectedValues);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? mergedOptions.filter((option) => option.toLowerCase().includes(normalizedQuery))
    : mergedOptions;
  const canCreate = Boolean(query.trim()) && !mergedOptions.some((option) => option.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
        setCreateError("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function setValueSelected(value: string, selected: boolean) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    onChange(selected
      ? normalizeUniqueStrings([...selectedValues, trimmed])
      : selectedValues.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()));
  }

  async function createValue() {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      const createdValue = onCreate ? await onCreate(trimmed) : trimmed;
      setValueSelected(createdValue, true);
      setQuery("");
    } catch (creationError) {
      setCreateError(creationError instanceof Error ? creationError.message : "Unable to add value.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div ref={containerRef} className="lookup-multiselect">
      <button
        type="button"
        className={`text-input lookup-multiselect-trigger ${isOpen ? "lookup-multiselect-trigger-open" : ""}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={selectedValues.length > 0 ? "lookup-multiselect-value" : "searchable-select-placeholder"}>
          {selectedValues.length > 0 ? `${selectedValues.length} selected` : placeholder}
        </span>
        <span className="searchable-select-chevron" aria-hidden="true">v</span>
      </button>
      {selectedValues.length > 0 ? (
        <div className="lookup-selected-chips" aria-label={`Selected ${ariaLabel}`}>
          {selectedValues.map((value) => (
            <button key={value} type="button" className="lookup-chip" onClick={() => setValueSelected(value, false)} aria-label={`Remove ${value}`}>
              <span>{value}</span>
              <span aria-hidden="true">x</span>
            </button>
          ))}
        </div>
      ) : null}
      {isOpen ? (
        <div className="lookup-multiselect-popover">
          <input
            ref={searchInputRef}
            className="text-input searchable-select-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCreateError("");
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <div className="lookup-multiselect-list" role="listbox" aria-label={ariaLabel}>
            {filteredOptions.length > 0 ? filteredOptions.map((option) => (
              <label key={option} className="lookup-multiselect-option">
                <input
                  type="checkbox"
                  checked={selectedValues.some((value) => value.toLowerCase() === option.toLowerCase())}
                  onChange={(event) => setValueSelected(option, event.target.checked)}
                />
                <span>{option}</span>
              </label>
            )) : (
              <p className="searchable-select-empty">{emptyText}</p>
            )}
          </div>
          {canCreate ? (
            <button type="button" className="lookup-add-option" onClick={createValue} disabled={isCreating}>
              {isCreating ? "Adding..." : `+ ${addLabel} "${query.trim()}"`}
            </button>
          ) : null}
          {createError ? <p className="lookup-create-error">{createError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingCustomerId = id ?? null;
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [expandedAddressIndexes, setExpandedAddressIndexes] = useState<number[]>(() => editingCustomerId ? [] : [0]);
  const [expandedContactPersonIndexes, setExpandedContactPersonIndexes] = useState<number[]>(() => editingCustomerId ? [] : [0]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [contactTagOptions, setContactTagOptions] = useState<string[]>([]);
  const [masterData, setMasterData] = useState<MasterDataSnapshot | null>(null);

  useEffect(() => {
    async function loadReferenceData() {
      try {
        const [groups, snapshot, contacts] = await Promise.all([
          api.get<ContactGroup[]>("/contact-groups"),
          api.get<MasterDataSnapshot>("/master-data"),
          api.get<Customer[]>("/customers").catch(() => []),
        ]);
        setContactGroups(groups);
        setMasterData(snapshot);
        setContactTagOptions(normalizeUniqueStrings(contacts.flatMap((contact) => contact.tags ?? [])));
      } catch {
        setContactGroups([]);
        setContactTagOptions([]);
        setMasterData(null);
      }
    }

    void loadReferenceData();
  }, []);

  useEffect(() => {
    async function load() {
      if (!editingCustomerId) {
        return;
      }

      const customerList = await api.get<Customer[]>("/customers");
      const customer = customerList.find((item) => item.id === editingCustomerId);
      if (!customer) {
        setError("Contact not found.");
        return;
      }

      const nextAddresses = ensureDefaultAddresses(customer.addresses.length > 0
        ? customer.addresses
        : customer.billingAddress
          ? [{ ...emptyAddress(), addressName: "Billing Address", streetAddress: customer.billingAddress, isDefaultBilling: true, isDefaultShipping: true }]
          : [{ ...emptyAddress(), isDefaultBilling: true, isDefaultShipping: true }]);

      setForm({
        legalName: customer.legalName || customer.name,
        otherName: customer.otherName || "",
        entityType: customer.entityType || "Company",
        registrationNumberType: customer.registrationNumberType || "",
        registrationNumber: customer.registrationNumber || "",
        oldRegistrationNumber: customer.oldRegistrationNumber || "",
        tin: customer.tin || "",
        sstRegistrationNumber: customer.sstRegistrationNumber || "",
        contactTypes: parseContactTypes(customer.contactType || "Customer"),
        status: customer.status || "Active",
        contactPersons: customer.contactPersons.length > 0 ? customer.contactPersons : [emptyContactPerson()],
        phoneNumbers: customer.phoneNumbers.length > 0 ? customer.phoneNumbers : [customer.phoneNumber || ""],
        emailAddresses: customer.emailAddresses.length > 0 ? customer.emailAddresses : [customer.email || ""],
        addresses: nextAddresses,
        receivableAccount: customer.receivableAccount || "",
        creditLimit: customer.creditLimit == null ? "" : String(customer.creditLimit),
        payableAccount: customer.payableAccount || "",
        groups: customer.groups || [],
        priceLevel: customer.priceLevel || "",
        currency: customer.currency || "MYR",
        paymentTerm: customer.paymentTerm || "",
        incomeAccount: customer.incomeAccount || "",
        expenseAccount: customer.expenseAccount || "",
        location: customer.location || "",
        tags: customer.tags || [],
        myInvoisControl: customer.myInvoisControl || "Default",
        externalReference: customer.externalReference || "",
      });
      setExpandedAddressIndexes([]);
      setExpandedContactPersonIndexes([]);
    }

    void load();
  }, [editingCustomerId]);

  const isCustomerSelected = form.contactTypes.includes("Customer");
  const isSupplierSelected = form.contactTypes.includes("Supplier");
  const isEmployeeSelected = form.contactTypes.includes("Employee");
  const showReceivableAccount = isCustomerSelected;
  const showCreditLimit = isCustomerSelected;
  const showPayableAccount = isSupplierSelected || isEmployeeSelected;
  const registrationNumberPlaceholder = getRegistrationNumberPlaceholder(form.registrationNumberType);
  const showOldRegistrationNumber = form.registrationNumberType === "BRN" || form.registrationNumberType === "Other" || isCompanyLikeEntity(form.entityType);
  const showTin = form.entityType !== "General Public";

  const availableRegistrationNumberTypeOptions = form.registrationNumberType && !contactRegistrationNumberTypeOptions.some((option) => option.value === form.registrationNumberType)
    ? [{ value: form.registrationNumberType, label: form.registrationNumberType }, ...contactRegistrationNumberTypeOptions]
    : contactRegistrationNumberTypeOptions;

  const availableCurrencyOptions = form.currency && !currencyOptions.some((option) => option.value === form.currency)
    ? [{ value: form.currency, label: form.currency }, ...currencyOptions]
    : currencyOptions;
  const availableGroupOptions = mergeGroupOptions(contactGroups, form.groups);
  const accountOptions = buildAccountOptions(masterData?.accounts);
  const receivableAccountOptions = accountOptions.filter((option) => option.keywords?.includes("Asset"));
  const payableAccountOptions = accountOptions.filter((option) => option.keywords?.includes("Liability"));
  const masterCurrencyOptions = buildCurrencyOptions(masterData?.currencies, form.currency, availableCurrencyOptions);
  const paymentTermOptions = buildPaymentTermOptions(masterData?.paymentTerms, form.paymentTerm);
  const priceLevelOptions = buildPriceLevelOptions(masterData?.priceLevels, form.priceLevel);
  const availableTagOptions = mergeLookupOptions(contactTagOptions, form.tags);
  const requiredMark = <span className="form-required-indicator" aria-hidden="true">*</span>;

  function updateContactType(type: string, checked: boolean) {
    setForm((current) => {
      const nextTypes = checked
        ? [...current.contactTypes, type]
        : current.contactTypes.filter((item) => item !== type);

      return {
        ...current,
        contactTypes: nextTypes.length > 0 ? nextTypes : ["Customer"],
      };
    });
  }

  function updateStringList(key: "phoneNumbers" | "emailAddresses", index: number, value: string) {
    setForm((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function addStringListItem(key: "phoneNumbers" | "emailAddresses") {
    setForm((current) => ({
      ...current,
      [key]: [...current[key], ""],
    }));
  }

  function removeStringListItem(key: "phoneNumbers" | "emailAddresses", index: number) {
    setForm((current) => {
      const next = current[key].filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        [key]: next.length > 0 ? next : [""],
      };
    });
  }

  function updateContactPerson(index: number, patch: Partial<ContactPerson>) {
    setForm((current) => ({
      ...current,
      contactPersons: current.contactPersons.map((person, personIndex) => personIndex === index ? { ...person, ...patch } : person),
    }));
  }

  function addContactPerson() {
    const nextIndex = form.contactPersons.length;
    setForm((current) => ({
      ...current,
      contactPersons: [...current.contactPersons, emptyContactPerson()],
    }));
    setExpandedContactPersonIndexes((current) => current.includes(nextIndex) ? current : [...current, nextIndex]);
  }

  function removeContactPerson(index: number) {
    setForm((current) => ({
      ...current,
      contactPersons: current.contactPersons.length === 1 ? [emptyContactPerson()] : current.contactPersons.filter((_, personIndex) => personIndex !== index),
    }));
    setExpandedContactPersonIndexes((current) => current
      .filter((personIndex) => personIndex !== index)
      .map((personIndex) => personIndex > index ? personIndex - 1 : personIndex));
  }

  function toggleContactPersonExpanded(index: number) {
    setExpandedContactPersonIndexes((current) => current.includes(index)
      ? current.filter((personIndex) => personIndex !== index)
      : [...current, index]);
  }

  function updateAddress(index: number, patch: Partial<ContactAddress>) {
    setForm((current) => ({
      ...current,
      addresses: ensureDefaultAddresses(current.addresses.map((address, addressIndex) => addressIndex === index ? { ...address, ...patch } : address)),
    }));
  }

  function setDefaultAddress(index: number, type: "billing" | "shipping") {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((address, addressIndex) => ({
        ...address,
        isDefaultBilling: type === "billing" ? addressIndex === index : address.isDefaultBilling,
        isDefaultShipping: type === "shipping" ? addressIndex === index : address.isDefaultShipping,
      })),
    }));
  }

  function addAddress() {
    const nextIndex = form.addresses.length;
    setForm((current) => ({
      ...current,
      addresses: ensureDefaultAddresses([...current.addresses, emptyAddress()]),
    }));
    setExpandedAddressIndexes((current) => current.includes(nextIndex) ? current : [...current, nextIndex]);
  }

  function removeAddress(index: number) {
    setForm((current) => ({
      ...current,
      addresses: ensureDefaultAddresses(current.addresses.filter((_, addressIndex) => addressIndex !== index)),
    }));
    setExpandedAddressIndexes((current) => current
      .filter((addressIndex) => addressIndex !== index)
      .map((addressIndex) => addressIndex > index ? addressIndex - 1 : addressIndex));
  }

  function toggleAddressExpanded(index: number) {
    setExpandedAddressIndexes((current) => current.includes(index)
      ? current.filter((addressIndex) => addressIndex !== index)
      : [...current, index]);
  }

  async function createContactGroup(name: string) {
    const created = await api.post<ContactGroup>("/contact-groups", {
      name,
      contactIds: [],
    });

    setContactGroups((current) => [...current.filter((group) => group.id !== created.id), created].sort((left, right) => left.name.localeCompare(right.name)));
    return created.name;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const normalizedPhoneNumbers = normalizePhoneNumbers(form.phoneNumbers);
    const normalizedEmailAddresses = normalizeUniqueStrings(form.emailAddresses);
    const normalizedGroups = normalizeUniqueStrings(form.groups);
    const normalizedTags = normalizeUniqueStrings(form.tags);
    const normalizedAddresses = ensureDefaultAddresses(form.addresses
      .map((address) => ({
        ...address,
        addressName: address.addressName.trim(),
        streetAddress: address.streetAddress.trim(),
        addressLine2: address.addressLine2.trim(),
        addressLine3: address.addressLine3.trim(),
        city: address.city.trim(),
        postcode: address.postcode.trim(),
        country: address.country.trim(),
        state: address.state.trim(),
      }))
      .filter((address) =>
        address.addressName
        || address.streetAddress
        || address.addressLine2
        || address.addressLine3
        || address.city
        || address.postcode
        || address.country
        || address.state));

    if (!form.legalName.trim()) {
      setError("Legal name is required.");
      return;
    }

    if (form.contactTypes.length === 0) {
      setError("Select at least one contact type.");
      return;
    }

    if (normalizedEmailAddresses.length === 0) {
      setError("At least one email address is required.");
      return;
    }

    if (showReceivableAccount && !form.receivableAccount.trim()) {
      setError("Receivable Account is required when Customer is selected.");
      return;
    }

    if (isSupplierSelected && !form.payableAccount.trim()) {
      setError("Payable Account is required when Supplier is selected.");
      return;
    }

    const invalidAddress = normalizedAddresses.find((address) => address.streetAddress && !address.country);
    if (invalidAddress) {
      setError(`Address "${invalidAddress.addressName || "Unnamed address"}" must include Country when Street Address is entered.`);
      return;
    }

    const unnamedAddress = normalizedAddresses.find((address) => !address.addressName.trim());
    if (unnamedAddress) {
      setError("Address Name is required for each saved address.");
      return;
    }

    const receivableAccountId = resolveAccountIdByCode(masterData?.accounts, form.receivableAccount);
    const payableAccountId = resolveAccountIdByCode(masterData?.accounts, form.payableAccount);
    const incomeAccountId = resolveAccountIdByCode(masterData?.accounts, form.incomeAccount);
    const expenseAccountId = resolveAccountIdByCode(masterData?.accounts, form.expenseAccount);

    const payload = {
      name: form.legalName.trim(),
      legalName: form.legalName.trim(),
      otherName: form.otherName.trim(),
      entityType: form.entityType,
      registrationNumberType: form.registrationNumberType.trim(),
      registrationNumber: form.registrationNumberType.trim() ? form.registrationNumber.trim() : "",
      oldRegistrationNumber: showOldRegistrationNumber ? form.oldRegistrationNumber.trim() : "",
      tin: showTin ? form.tin.trim() : "",
      sstRegistrationNumber: showTin ? form.sstRegistrationNumber.trim() : "",
      email: normalizedEmailAddresses[0] ?? "",
      phoneNumber: normalizedPhoneNumbers[0] ?? "",
      externalReference: form.externalReference.trim(),
      billingAddress: (() => {
        const defaultAddress = normalizedAddresses.find((address) => address.isDefaultBilling) ?? normalizedAddresses[0];
        return defaultAddress ? [[defaultAddress.streetAddress, defaultAddress.addressLine2, defaultAddress.addressLine3].filter(Boolean).join(", "), [defaultAddress.city, defaultAddress.state, defaultAddress.postcode].filter(Boolean).join(", "), defaultAddress.country].filter(Boolean).join(", ") : "";
      })(),
      contactType: form.contactTypes.join(", "),
      status: form.status,
      contactPersons: form.contactPersons
        .map((person) => ({
          name: person.name.trim(),
          role: person.role.trim(),
          email: person.email.trim(),
          phoneNumber: person.phoneNumber.trim(),
        }))
        .filter((person) => person.name || person.role || person.email || person.phoneNumber),
      phoneNumbers: normalizedPhoneNumbers,
      emailAddresses: normalizedEmailAddresses,
      addresses: normalizedAddresses,
      receivableAccountId: showReceivableAccount ? receivableAccountId : null,
      receivableAccount: showReceivableAccount ? form.receivableAccount.trim() : "",
      creditLimit: showCreditLimit && form.creditLimit.trim() ? Number(form.creditLimit) : null,
      payableAccountId: showPayableAccount ? payableAccountId : null,
      payableAccount: showPayableAccount ? form.payableAccount.trim() : "",
      groups: normalizedGroups,
      priceLevel: form.priceLevel.trim(),
      currency: form.currency.trim(),
      paymentTerm: form.paymentTerm.trim(),
      incomeAccountId,
      incomeAccount: form.incomeAccount.trim(),
      expenseAccountId,
      expenseAccount: form.expenseAccount.trim(),
      location: form.location.trim(),
      tags: normalizedTags,
      myInvoisControl: form.myInvoisControl.trim(),
    };

    setConfirmState({
      title: editingCustomerId ? "Update contact" : "Create contact",
      description: editingCustomerId
        ? `Update ${payload.legalName || "this contact"}?`
        : `Create ${payload.legalName || "this contact"}?`,
      action: async () => {
        try {
          if (editingCustomerId) {
            await api.put(`/customers/${editingCustomerId}`, payload);
          } else {
            await api.post("/customers", payload);
          }

          navigate("/customers", {
            replace: true,
            state: { flashMessage: editingCustomerId ? `Contact updated: ${payload.legalName || "Contact"}.` : `Contact created: ${payload.legalName || "Contact"}.` },
          });
        } catch (submitError) {
          const nextError = submitError instanceof Error ? submitError.message : "Unable to save contact.";
          setError(nextError);
          throw new Error(nextError);
        }
      },
    });
  }

  return (
    <div className="page contact-create-page">
      <StandardFormLayout className="contact-create-content standard-form-page">
      <FormPageHeader backLabel="Back to Contacts" backHref="/customers" breadcrumbs={<><span>Contacts</span><span>/</span><span>{editingCustomerId ? "Edit Contact" : "New Contact"}</span></>} />
        <form id="customer-create-form" className="form-stack contact-create-form" onSubmit={submit}>
          <FormPageBody>
          <div className="form-page-content">
          <section className="contact-form-section" aria-labelledby="contact-basic-information-title">
            <div className="contact-form-section-header"><div className="contact-form-section-number" aria-hidden="true">01</div><div><h3 id="contact-basic-information-title">Basic information</h3><p>Identity, registration and tax details.</p></div>
            </div>
            <div className="company-profile-fields-grid">
              <label className="form-label company-profile-field company-profile-field-wide">
                Entity Type
                <select value={form.entityType} onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value as Customer["entityType"] }))}>
                  {entityTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="form-label company-profile-field">
                <span className="form-label-inline">Legal Name {requiredMark}</span>
                <input className="text-input" value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Other Name
                <input className="text-input" value={form.otherName} onChange={(event) => setForm((current) => ({ ...current, otherName: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Registration No. Type
                <select value={form.registrationNumberType} onChange={(event) => setForm((current) => ({ ...current, registrationNumberType: event.target.value, registrationNumber: event.target.value ? current.registrationNumber : "" }))}>
                  {availableRegistrationNumberTypeOptions.map((option) => (
                    <option key={option.value || "none"} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="form-label company-profile-field">
                Registration No.
                <input
                  className="text-input"
                  value={form.registrationNumber}
                  onChange={(event) => setForm((current) => ({ ...current, registrationNumber: event.target.value }))}
                  placeholder={registrationNumberPlaceholder}
                  disabled={!form.registrationNumberType}
                />
              </label>
              {showTin ? (
                <label className="form-label company-profile-field">
                  TIN
                  <input className="text-input" value={form.tin} onChange={(event) => setForm((current) => ({ ...current, tin: event.target.value }))} />
                </label>
              ) : null}
              {showTin ? (
                <label className="form-label company-profile-field">
                  SST Registration No.
                  <input className="text-input" value={form.sstRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, sstRegistrationNumber: event.target.value }))} />
                </label>
              ) : null}
              {showOldRegistrationNumber ? (
                <label className="form-label company-profile-field company-profile-field-wide">
                  Old Registration No.
                  <input className="text-input" value={form.oldRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, oldRegistrationNumber: event.target.value }))} />
                </label>
              ) : null}
            </div>
          </section>

          <section className="contact-form-section" aria-labelledby="contact-contact-information-title">
            <div className="contact-form-section-header"><div className="contact-form-section-number" aria-hidden="true">02</div><div><h3 id="contact-contact-information-title">Contact details</h3><p>Phone numbers and email addresses used for billing.</p></div>
            </div>
            <div className="company-profile-fields-grid">
              <div className="form-label company-profile-field company-profile-field-wide">
                Contact Number(s)
                <div className="contact-editor-list">
                  {form.phoneNumbers.map((phoneNumber, index) => {
                    const parsedPhoneNumber = splitStoredPhoneNumber(phoneNumber);

                    return (
                      <div key={`phone-${index}`} className="contact-editor-row">
                        <PhoneNumberField
                          countryCodeId={`contact-phone-country-code-${index}`}
                          phoneNumberId={`contact-phone-number-${index}`}
                          countryCodeValue={parsedPhoneNumber.countryCode}
                          phoneNumberValue={parsedPhoneNumber.phoneNumber}
                          onCountryCodeChange={(value) => updateStringList("phoneNumbers", index, parsedPhoneNumber.phoneNumber ? combinePhoneNumber(value, parsedPhoneNumber.phoneNumber) : value)}
                          onPhoneNumberChange={(value) => updateStringList("phoneNumbers", index, combinePhoneNumber(parsedPhoneNumber.countryCode, value))}
                          countryCodeLabel={`Country Code ${index + 1}`}
                          phoneNumberLabel={`Contact Number ${index + 1}`}
                          phoneNumberPlaceholder="123456789"
                        />
                        <button type="button" className="button button-secondary button-small" onClick={() => removeStringListItem("phoneNumbers", index)} disabled={form.phoneNumbers.length === 1}>Delete</button>
                      </div>
                    );
                  })}
                  <button type="button" className="contact-secondary-action" onClick={() => addStringListItem("phoneNumbers")}><span aria-hidden="true">+</span>Add phone number</button>
                </div>
              </div>
              <div className="form-label company-profile-field company-profile-field-wide">
                <span className="form-label-inline">Email Address(es) {requiredMark}</span>
                <div className="contact-editor-list">
                  {form.emailAddresses.map((emailAddress, index) => (
                    <div key={`email-${index}`} className="contact-editor-row">
                      <input className="text-input" type="email" value={emailAddress} onChange={(event) => updateStringList("emailAddresses", index, event.target.value)} placeholder={`Email Address ${index + 1}`} />
                      <button type="button" className="button button-secondary button-small" onClick={() => removeStringListItem("emailAddresses", index)} disabled={form.emailAddresses.length === 1}>Delete</button>
                    </div>
                  ))}
                  <button type="button" className="contact-secondary-action" onClick={() => addStringListItem("emailAddresses")}><span aria-hidden="true">+</span>Add email address</button>
                </div>
              </div>
            </div>
          </section>

          <section className="contact-form-section contact-addresses-section" aria-labelledby="contact-addresses-title">
            <div className="contact-form-section-header"><div className="contact-form-section-number" aria-hidden="true">03</div><div><h3 id="contact-addresses-title">Addresses</h3><p>Billing, shipping and operating locations.</p></div><button type="button" className="contact-secondary-action" onClick={addAddress}><span aria-hidden="true">+</span>Add address</button>
            </div>
            <div className="company-profile-address-list">
              {form.addresses.map((address, index) => {
                const isMalaysiaAddress = address.country.trim().toLowerCase() === "malaysia";
                const summaryLines = getAddressSummary(address);
                const isExpanded = expandedAddressIndexes.includes(index);

                return (
                  <article key={`address-${index}`} className={`company-profile-address-card ${isExpanded ? "company-profile-address-card-expanded" : "company-profile-address-card-collapsed"}`}>
                    <div className="company-profile-address-card-header">
                      <div className="company-profile-address-card-heading">
                        <div className="company-profile-address-title-row">
                          <h4>{address.addressName || `Address ${index + 1}`}</h4>
                          {address.isDefaultBilling ? <span className="status-pill status-pill-active status-pill-compact">Billing Default</span> : null}
                          {address.isDefaultShipping ? <span className="status-pill status-pill-active status-pill-compact">Shipping Default</span> : null}
                        </div>
                        {!isExpanded ? (
                          <div className="company-profile-address-summary">
                            {summaryLines.length > 0 ? summaryLines.map((line) => <p key={line}>{line}</p>) : <p className="muted">No address details entered yet.</p>}
                          </div>
                        ) : null}
                      </div>
                      <div className="company-profile-address-card-actions">
                        {!address.isDefaultBilling ? (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(index, "billing")}>Set as billing default</button>
                        ) : null}
                        {!address.isDefaultShipping ? (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(index, "shipping")}>Set as shipping default</button>
                        ) : null}
                        <button type="button" className="button button-secondary button-small" onClick={() => toggleAddressExpanded(index)} aria-expanded={isExpanded}>
                          {isExpanded ? "Collapse ▲" : "Expand ▼"}
                        </button>
                        <button type="button" className="button button-secondary button-small" onClick={() => removeAddress(index)} disabled={form.addresses.length === 1}>{`Delete address ${index + 1}`}</button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <div className="company-profile-address-card-grid">
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressName} onChange={(event) => updateAddress(index, { addressName: event.target.value })} placeholder="Address Name *" aria-label="Address Name" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.streetAddress} onChange={(event) => updateAddress(index, { streetAddress: event.target.value })} placeholder="Address Line 1 *" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine2} onChange={(event) => updateAddress(index, { addressLine2: event.target.value })} placeholder="Address Line 2" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine3} onChange={(event) => updateAddress(index, { addressLine3: event.target.value })} placeholder="Address Line 3" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.city} onChange={(event) => updateAddress(index, { city: event.target.value })} placeholder="City *" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.postcode} onChange={(event) => updateAddress(index, { postcode: event.target.value })} placeholder="Postal Code *" />
                        </div>
                        <div className="company-profile-field company-profile-address-card-wide">
                          <SearchableSelect
                            value={address.country}
                            onChange={(value) => updateAddress(index, { country: value })}
                            options={countryOptions}
                            placeholder="Country *"
                            searchPlaceholder="Search countries"
                            ariaLabel={`Address ${index + 1} Country`}
                            clearable
                          />
                        </div>
                        <div className="company-profile-field">
                          {isMalaysiaAddress ? (
                            <select value={address.state} onChange={(event) => updateAddress(index, { state: event.target.value })}>
                              <option value="">State *</option>
                              {malaysiaStateOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input className="text-input" value={address.state} onChange={(event) => updateAddress(index, { state: event.target.value })} placeholder="State *" />
                          )}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="contact-form-section" aria-labelledby="contact-contact-persons-title">
            <div className="contact-form-section-header"><div className="contact-form-section-number" aria-hidden="true">04</div><div><h3 id="contact-contact-persons-title">Contact persons</h3><p>People associated with this contact record.</p></div><button type="button" className="contact-secondary-action" onClick={addContactPerson}><span aria-hidden="true">+</span>Add contact person</button>
            </div>
            <div className="company-profile-address-list">
              {form.contactPersons.map((person, index) => {
                const isExpanded = expandedContactPersonIndexes.includes(index);

                return (
                <article key={`person-${index}`} className={`company-profile-address-card contact-person-card ${isExpanded ? "company-profile-address-card-expanded" : "company-profile-address-card-collapsed"}`}>
                  <div className="company-profile-address-card-header">
                    <div className="company-profile-address-card-heading company-profile-address-card-heading-nowrap">
                      <h4>{person.name || `Contact Person ${index + 1}`}</h4>
                      {!isExpanded && (person.role || person.email || person.phoneNumber) ? <p className="contact-person-summary">{[person.role, person.email, person.phoneNumber].filter(Boolean).join(" · ")}</p> : null}
                    </div>
                    <div className="company-profile-address-card-actions">
                      <button type="button" className="button button-secondary button-small" onClick={() => toggleContactPersonExpanded(index)} aria-expanded={isExpanded}>{isExpanded ? "Collapse" : "Expand"}</button>
                      <button type="button" className="button button-secondary button-small" onClick={() => removeContactPerson(index)} disabled={form.contactPersons.length === 1}>Delete</button>
                    </div>
                  </div>
                  {isExpanded ? <div className="company-profile-address-card-grid">
                    <div className="company-profile-field">
                      <input className="text-input" value={person.name} onChange={(event) => updateContactPerson(index, { name: event.target.value })} placeholder="Name" />
                    </div>
                    <div className="company-profile-field">
                      <input className="text-input" value={person.role} onChange={(event) => updateContactPerson(index, { role: event.target.value })} placeholder="Role" />
                    </div>
                    <div className="company-profile-field">
                      <input className="text-input" type="email" value={person.email} onChange={(event) => updateContactPerson(index, { email: event.target.value })} placeholder="Email" />
                    </div>
                    <div className="company-profile-field">
                      <input className="text-input" value={person.phoneNumber} onChange={(event) => updateContactPerson(index, { phoneNumber: event.target.value })} placeholder="Phone Number" />
                    </div>
                  </div> : null}
                </article>
                );
              })}
            </div>
          </section>

          <section className="contact-form-section" aria-labelledby="contact-type-grouping-title">
            <div className="contact-form-section-header"><div className="contact-form-section-number" aria-hidden="true">05</div><div><h3 id="contact-type-grouping-title">Type and grouping</h3><p>Customer, supplier, employee and commercial settings.</p></div>
            </div>
            <div className="company-profile-fields-grid">
              <div className="form-label company-profile-field company-profile-field-wide">
                Contact Type
                <div className="contact-checkbox-group">
                  {contactTypeOptions.map((type) => (
                    <label key={type} className="contact-checkbox-card">
                      <input type="checkbox" checked={form.contactTypes.includes(type)} onChange={(event) => updateContactType(type, event.target.checked)} />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </div>
                {showReceivableAccount ? (
                  <label className="form-label company-profile-field">
                    <span className="form-label-inline">Receivable Account {requiredMark}</span>
                    <SearchableSelect
                      value={form.receivableAccount}
                      onChange={(value) => setForm((current) => ({ ...current, receivableAccount: value }))}
                      options={receivableAccountOptions}
                      placeholder="Select receivable account"
                      searchPlaceholder="Search asset accounts"
                      ariaLabel="Receivable Account"
                    />
                  </label>
                ) : null}
                {showCreditLimit ? (
                  <label className="form-label company-profile-field">
                    Credit Limit
                    <input className="text-input" inputMode="decimal" value={form.creditLimit} onChange={(event) => setForm((current) => ({ ...current, creditLimit: event.target.value }))} />
                  </label>
                ) : null}
                {showPayableAccount ? (
                  <label className="form-label company-profile-field">
                    <span className="form-label-inline">Payable Account {isSupplierSelected ? requiredMark : null}</span>
                    <SearchableSelect
                      value={form.payableAccount}
                      onChange={(value) => setForm((current) => ({ ...current, payableAccount: value }))}
                      options={payableAccountOptions}
                      placeholder="Select payable account"
                      searchPlaceholder="Search liability accounts"
                      ariaLabel="Payable Account"
                    />
                  </label>
                ) : null}
              <div className="form-label company-profile-field company-profile-field-wide">
                Contact Groups
                <MultiValueLookup
                  values={form.groups}
                  options={availableGroupOptions}
                  placeholder="Select contact groups"
                  searchPlaceholder="Search contact groups"
                  addLabel="Add Contact Group"
                  emptyText="No matching groups."
                  ariaLabel="Contact Groups"
                  onChange={(values) => setForm((current) => ({ ...current, groups: values }))}
                  onCreate={createContactGroup}
                />
              </div>
              <label className="form-label company-profile-field">
                Price Level
                <SearchableSelect
                  value={form.priceLevel}
                  onChange={(value) => setForm((current) => ({ ...current, priceLevel: value }))}
                  options={priceLevelOptions}
                  placeholder="Select price level"
                  searchPlaceholder="Search price levels"
                  ariaLabel="Price Level"
                  clearable
                />
              </label>
            </div>
          </section>

          <details className="contact-form-section contact-advanced-section">
            <summary><span className="contact-form-section-number" aria-hidden="true">06</span><span><strong>Advanced settings</strong><small>Currency, payment terms, accounts, tags and status.</small></span><span aria-hidden="true">⌄</span></summary>
            <div className="company-profile-fields-grid">
              <label className="form-label company-profile-field">
                Currency
                <SearchableSelect
                  value={form.currency}
                  onChange={(value) => setForm((current) => ({ ...current, currency: value || "MYR" }))}
                  options={masterCurrencyOptions}
                  placeholder="Select currency"
                  searchPlaceholder="Search currencies"
                  ariaLabel="Currency"
                />
              </label>
              <label className="form-label company-profile-field">
                Payment Term
                <SearchableSelect
                  value={form.paymentTerm}
                  onChange={(value) => setForm((current) => ({ ...current, paymentTerm: value }))}
                  options={paymentTermOptions}
                  placeholder="Select payment term"
                  searchPlaceholder="Search payment terms"
                  ariaLabel="Payment Term"
                  clearable
                />
              </label>
              <label className="form-label company-profile-field">
                Location
                <input className="text-input" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Income Account
                <AccountSelect
                  value={form.incomeAccount}
                  onChange={(value) => setForm((current) => ({ ...current, incomeAccount: value }))}
                  kind="income"
                  placeholder="Select income account"
                  searchPlaceholder="Search revenue accounts"
                  ariaLabel="Income Account"
                  clearable
                />
              </label>
              <label className="form-label company-profile-field">
                Expense Account
                <AccountSelect
                  value={form.expenseAccount}
                  onChange={(value) => setForm((current) => ({ ...current, expenseAccount: value }))}
                  kind="expense"
                  placeholder="Select expense account"
                  searchPlaceholder="Search expense accounts"
                  ariaLabel="Expense Account"
                  clearable
                />
              </label>
              <label className="form-label company-profile-field">
                Status
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Customer["status"] }))}>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="form-label company-profile-field">
                External Reference
                <input className="text-input" value={form.externalReference} onChange={(event) => setForm((current) => ({ ...current, externalReference: event.target.value }))} />
              </label>
              <div className="form-label company-profile-field company-profile-field-wide">
                Tags
                <MultiValueLookup
                  values={form.tags}
                  options={availableTagOptions}
                  placeholder="Select tags"
                  searchPlaceholder="Search tags"
                  addLabel="Add Tag"
                  emptyText="No matching tags."
                  ariaLabel="Tags"
                  onChange={(values) => setForm((current) => ({ ...current, tags: values }))}
                  onCreate={(value) => {
                    setContactTagOptions((current) => mergeLookupOptions(current, [value]));
                    return value;
                  }}
                />
              </div>
              <label className="form-label company-profile-field">
                MyInvois Control
                <select value={form.myInvoisControl} onChange={(event) => setForm((current) => ({ ...current, myInvoisControl: event.target.value }))}>
                  {myInvoisControlOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          {error ? <HelperText tone="error">{error}</HelperText> : null}
          </div>
          <FormActionSection className="contact-create-actions"><p>{editingCustomerId ? "Review your changes before updating." : "Complete the required fields before creating this record."}</p><div><button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Cancel</button><button type="submit" className="button button-primary">{editingCustomerId ? "Update contact" : "Create contact"}</button></div>
          </FormActionSection>
          </FormPageBody>
        </form>
      </StandardFormLayout>
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function buildAccountOptions(accounts?: MasterDataSnapshot["accounts"]): SearchableSelectOption[] {
  return (accounts ?? [])
    .filter((account) => account.isActive)
    .map((account) => ({
      value: account.code,
      label: `${account.code} - ${account.name}`,
      keywords: [account.name, account.type, account.currencyCode],
    }));
}

function resolveAccountIdByCode(accounts: MasterDataSnapshot["accounts"] | undefined, selectedCode: string) {
  const normalized = selectedCode.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return accounts?.find((account) => account.code.toUpperCase() === normalized)?.id ?? null;
}

function buildCurrencyOptions(
  currencies: MasterDataSnapshot["currencies"] | undefined,
  selectedValue: string,
  fallbackOptions: { value: string; label: string }[],
): SearchableSelectOption[] {
  const activeOptions = (currencies ?? [])
    .filter((currency) => currency.isActive)
    .map((currency) => ({
      value: currency.code,
      label: `${currency.code} - ${currency.name}`,
      keywords: [currency.name, currency.symbol],
    }));

  return mergeMissingSelection(activeOptions, selectedValue, fallbackOptions);
}

function buildPaymentTermOptions(paymentTerms?: MasterDataSnapshot["paymentTerms"], selectedValue = ""): SearchableSelectOption[] {
  const activeOptions = (paymentTerms ?? [])
    .filter((paymentTerm) => paymentTerm.isActive)
    .map((paymentTerm) => ({
      value: paymentTerm.code,
      label: `${paymentTerm.code} - ${paymentTerm.name}`,
      keywords: [paymentTerm.name, String(paymentTerm.days)],
    }));

  return mergeMissingSelection(activeOptions, selectedValue);
}

function buildPriceLevelOptions(priceLevels?: MasterDataSnapshot["priceLevels"], selectedValue = ""): SearchableSelectOption[] {
  const activeOptions = (priceLevels ?? [])
    .filter((priceLevel) => priceLevel.isActive)
    .map((priceLevel) => ({
      value: priceLevel.code,
      label: `${priceLevel.code} - ${priceLevel.name}`,
      keywords: [priceLevel.name, String(priceLevel.adjustmentPercent)],
    }));

  return mergeMissingSelection(activeOptions, selectedValue);
}

function mergeMissingSelection(
  options: SearchableSelectOption[],
  selectedValue: string,
  fallbackOptions: { value: string; label: string }[] = [],
): SearchableSelectOption[] {
  const merged = new Map<string, SearchableSelectOption>();

  options.forEach((option) => {
    merged.set(option.value, option);
  });

  fallbackOptions.forEach((option) => {
    if (!merged.has(option.value)) {
      merged.set(option.value, option);
    }
  });

  if (selectedValue && !merged.has(selectedValue)) {
    merged.set(selectedValue, { value: selectedValue, label: selectedValue });
  }

  return Array.from(merged.values());
}
