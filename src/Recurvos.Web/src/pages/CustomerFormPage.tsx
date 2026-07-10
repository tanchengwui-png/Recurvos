import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { api } from "../lib/api";
import { countryOptions, currencyOptions, malaysiaStateOptions, registrationNumberTypeOptions } from "../lib/localeOptions";
import type { ContactAddress, ContactGroup, ContactPerson, Customer } from "../types";

const contactTypeOptions = ["Customer", "Supplier", "Employee"] as const;
const entityTypeOptions = ["Company", "Individual", "General Public", "Foreign Company", "Foreign Individual", "Exempted Person"] as const;
const statusOptions = ["Active", "Inactive", "Archived"] as const;
const myInvoisControlOptions = ["Default", "Enabled", "Disabled"] as const;

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
  addresses: [{ ...emptyAddress(), addressName: "Primary", isDefaultBilling: true, isDefaultShipping: true }],
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
    return [{ ...emptyAddress(), addressName: "Primary", isDefaultBilling: true, isDefaultShipping: true }];
  }

  const next = addresses.map((address) => ({
    ...address,
    addressName: address.addressName || "Address",
  }));

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

function isCompanyLikeEntity(entityType: Customer["entityType"]) {
  return entityType === "Company" || entityType === "Foreign Company";
}

function splitPhoneNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return { countryCode: "", number: "" };
  }

  const match = normalized.match(/^(\+\d{1,4})(?:[\s-]*(.*))?$/);
  if (!match) {
    return { countryCode: "", number: normalized };
  }

  return {
    countryCode: match[1],
    number: (match[2] ?? "").trim(),
  };
}

function combinePhoneNumber(countryCode: string, number: string) {
  const normalizedCode = countryCode.trim();
  const normalizedNumber = number.trim();

  if (!normalizedCode) {
    return normalizedNumber;
  }

  if (!normalizedNumber) {
    return normalizedCode;
  }

  return `${normalizedCode} ${normalizedNumber}`;
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

export function CustomerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingCustomerId = id ?? null;
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [expandedAddressIndex, setExpandedAddressIndex] = useState(0);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);

  useEffect(() => {
    async function loadGroups() {
      try {
        setContactGroups(await api.get<ContactGroup[]>("/contact-groups"));
      } catch {
        setContactGroups([]);
      }
    }

    void loadGroups();
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
          ? [{ ...emptyAddress(), addressName: "Primary", streetAddress: customer.billingAddress, isDefaultBilling: true, isDefaultShipping: true }]
          : [{ ...emptyAddress(), addressName: "Primary", isDefaultBilling: true, isDefaultShipping: true }]);

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
    }

    void load();
  }, [editingCustomerId]);

  const isCustomerSelected = form.contactTypes.includes("Customer");
  const isSupplierSelected = form.contactTypes.includes("Supplier");
  const showReceivableAccount = isCustomerSelected;
  const showCreditLimit = isCustomerSelected;
  const showPayableAccount = isSupplierSelected;
  const showCompanyRegistrationFields = isCompanyLikeEntity(form.entityType);
  const showRegistrationNumber = form.entityType !== "General Public";
  const showTin = form.entityType !== "General Public";

  const availableRegistrationNumberTypeOptions = form.registrationNumberType && !registrationNumberTypeOptions.some((option) => option.value === form.registrationNumberType)
    ? [{ value: form.registrationNumberType, label: form.registrationNumberType }, ...registrationNumberTypeOptions]
    : registrationNumberTypeOptions;

  const availableCurrencyOptions = form.currency && !currencyOptions.some((option) => option.value === form.currency)
    ? [{ value: form.currency, label: form.currency }, ...currencyOptions]
    : currencyOptions;
  const availableGroupOptions = mergeGroupOptions(contactGroups, form.groups);

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

  function updateStringList(key: "phoneNumbers" | "emailAddresses" | "tags", index: number, value: string) {
    setForm((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function addStringListItem(key: "phoneNumbers" | "emailAddresses" | "tags") {
    setForm((current) => ({
      ...current,
      [key]: [...current[key], ""],
    }));
  }

  function removeStringListItem(key: "phoneNumbers" | "emailAddresses" | "tags", index: number) {
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
    setForm((current) => ({
      ...current,
      contactPersons: [...current.contactPersons, emptyContactPerson()],
    }));
  }

  function removeContactPerson(index: number) {
    setForm((current) => ({
      ...current,
      contactPersons: current.contactPersons.length === 1 ? [emptyContactPerson()] : current.contactPersons.filter((_, personIndex) => personIndex !== index),
    }));
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
    setForm((current) => ({
      ...current,
      addresses: ensureDefaultAddresses([...current.addresses, { ...emptyAddress(), addressName: `Address ${current.addresses.length + 1}` }]),
    }));
    setExpandedAddressIndex(form.addresses.length);
  }

  function removeAddress(index: number) {
    setForm((current) => ({
      ...current,
      addresses: ensureDefaultAddresses(current.addresses.filter((_, addressIndex) => addressIndex !== index)),
    }));
    setExpandedAddressIndex((current) => Math.max(0, Math.min(current, form.addresses.length - 2)));
  }

  function toggleGroup(groupName: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      groups: checked
        ? [...current.groups, groupName].filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
        : current.groups.filter((group) => group.toLowerCase() !== groupName.toLowerCase()),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const normalizedPhoneNumbers = normalizeUniqueStrings(form.phoneNumbers);
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

    if (showPayableAccount && !form.payableAccount.trim()) {
      setError("Payable Account is required when Supplier is selected.");
      return;
    }

    const invalidAddress = normalizedAddresses.find((address) => address.streetAddress && !address.country);
    if (invalidAddress) {
      setError(`Address "${invalidAddress.addressName || "Unnamed address"}" must include Country when Street Address is entered.`);
      return;
    }

    const payload = {
      name: form.legalName.trim(),
      legalName: form.legalName.trim(),
      otherName: form.otherName.trim(),
      entityType: form.entityType,
      registrationNumberType: showCompanyRegistrationFields ? form.registrationNumberType.trim() : "",
      registrationNumber: showRegistrationNumber ? form.registrationNumber.trim() : "",
      oldRegistrationNumber: showCompanyRegistrationFields ? form.oldRegistrationNumber.trim() : "",
      tin: showTin ? form.tin.trim() : "",
      sstRegistrationNumber: showCompanyRegistrationFields ? form.sstRegistrationNumber.trim() : "",
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
      receivableAccount: showReceivableAccount ? form.receivableAccount.trim() : "",
      creditLimit: showCreditLimit && form.creditLimit.trim() ? Number(form.creditLimit) : null,
      payableAccount: showPayableAccount ? form.payableAccount.trim() : "",
      groups: normalizedGroups,
      priceLevel: form.priceLevel.trim(),
      currency: form.currency.trim(),
      paymentTerm: form.paymentTerm.trim(),
      incomeAccount: form.incomeAccount.trim(),
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
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{editingCustomerId ? "Update contact profile" : "Create contact profile"}</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Back to contacts</button>
      </header>
      <section className="card company-profile-card">
        <form id="customer-create-form" className="form-stack company-profile-form" onSubmit={submit}>
          <section className="company-profile-section" aria-labelledby="contact-basic-information-title">
            <div className="company-profile-address-header">
              <h3 id="contact-basic-information-title" className="section-title">Basic Information</h3>
            </div>
            <div className="company-profile-fields-grid">
              <label className="form-label company-profile-field">
                Entity Type
                <select value={form.entityType} onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value as Customer["entityType"] }))}>
                  {entityTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="form-label company-profile-field">
                Legal Name
                <input className="text-input" value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Other Name
                <input className="text-input" value={form.otherName} onChange={(event) => setForm((current) => ({ ...current, otherName: event.target.value }))} />
              </label>
              {showCompanyRegistrationFields ? (
                <label className="form-label company-profile-field">
                  Registration No. Type
                  <select value={form.registrationNumberType} onChange={(event) => setForm((current) => ({ ...current, registrationNumberType: event.target.value }))}>
                    <option value="">Select registration type</option>
                    {availableRegistrationNumberTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {showRegistrationNumber ? (
                <label className="form-label company-profile-field">
                  Registration No.
                  <input className="text-input" value={form.registrationNumber} onChange={(event) => setForm((current) => ({ ...current, registrationNumber: event.target.value }))} />
                </label>
              ) : null}
              {showCompanyRegistrationFields ? (
                <label className="form-label company-profile-field">
                  Old Registration No.
                  <input className="text-input" value={form.oldRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, oldRegistrationNumber: event.target.value }))} />
                </label>
              ) : null}
              {showTin ? (
                <label className="form-label company-profile-field">
                  TIN
                  <input className="text-input" value={form.tin} onChange={(event) => setForm((current) => ({ ...current, tin: event.target.value }))} />
                </label>
              ) : null}
              {showCompanyRegistrationFields ? (
                <label className="form-label company-profile-field">
                  SST Registration No.
                  <input className="text-input" value={form.sstRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, sstRegistrationNumber: event.target.value }))} />
                </label>
              ) : null}
            </div>
          </section>

          <section className="company-profile-section" aria-labelledby="contact-contact-information-title">
            <div className="company-profile-address-header">
              <h3 id="contact-contact-information-title" className="section-title">Contact Information</h3>
              <p className="muted">The first email address is used as the primary contact for existing billing workflows.</p>
            </div>
            <div className="company-profile-fields-grid">
              <div className="form-label company-profile-field company-profile-field-wide">
                Contact Number(s)
                <div className="contact-editor-list">
                  {form.phoneNumbers.map((phoneNumber, index) => (
                    <div key={`phone-${index}`} className="contact-editor-row">
                      <div className="contact-phone-input-row">
                        <input
                          className="text-input contact-phone-country-code"
                          value={splitPhoneNumber(phoneNumber).countryCode}
                          onChange={(event) => updateStringList("phoneNumbers", index, combinePhoneNumber(event.target.value, splitPhoneNumber(phoneNumber).number))}
                          placeholder="+60"
                          aria-label={`Contact Number ${index + 1} Country Code`}
                        />
                        <input
                          className="text-input"
                          value={splitPhoneNumber(phoneNumber).number}
                          onChange={(event) => updateStringList("phoneNumbers", index, combinePhoneNumber(splitPhoneNumber(phoneNumber).countryCode, event.target.value))}
                          placeholder={`Contact Number ${index + 1}`}
                          aria-label={`Contact Number ${index + 1}`}
                        />
                      </div>
                      <button type="button" className="button button-secondary button-small" onClick={() => removeStringListItem("phoneNumbers", index)} disabled={form.phoneNumbers.length === 1}>Delete</button>
                    </div>
                  ))}
                  <button type="button" className="button button-secondary" onClick={() => addStringListItem("phoneNumbers")}>+ Add Contact Number</button>
                </div>
              </div>
              <div className="form-label company-profile-field company-profile-field-wide">
                Email Address(es)
                <div className="contact-editor-list">
                  {form.emailAddresses.map((emailAddress, index) => (
                    <div key={`email-${index}`} className="contact-editor-row">
                      <input className="text-input" type="email" value={emailAddress} onChange={(event) => updateStringList("emailAddresses", index, event.target.value)} placeholder={`Email Address ${index + 1}`} />
                      <button type="button" className="button button-secondary button-small" onClick={() => removeStringListItem("emailAddresses", index)} disabled={form.emailAddresses.length === 1}>Delete</button>
                    </div>
                  ))}
                  <button type="button" className="button button-secondary" onClick={() => addStringListItem("emailAddresses")}>+ Add Email Address</button>
                </div>
              </div>
            </div>
          </section>

          <section className="company-profile-address-section" aria-labelledby="contact-addresses-title">
            <div className="company-profile-address-header">
              <h3 id="contact-addresses-title" className="section-title">Addresses</h3>
            </div>
            <div className="company-profile-address-list">
              {form.addresses.map((address, index) => {
                const isMalaysiaAddress = address.country.trim().toLowerCase() === "malaysia";
                const summaryLines = getAddressSummary(address);

                return (
                  <article key={`${address.addressName}-${index}`} className="company-profile-address-card">
                    <div className="company-profile-address-card-header">
                      <div className="company-profile-address-card-heading">
                        <h4>{address.addressName || `Address ${index + 1}`}</h4>
                        <div className="company-profile-address-summary">
                          {summaryLines.length > 0 ? summaryLines.map((line) => <p key={line}>{line}</p>) : <p className="muted">No address details entered yet.</p>}
                        </div>
                      </div>
                      <div className="company-profile-address-card-actions">
                        {address.isDefaultBilling ? (
                          <button type="button" className="button button-small company-profile-address-status-button" disabled>Default Billing</button>
                        ) : (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(index, "billing")}>Set Default Billing</button>
                        )}
                        {address.isDefaultShipping ? (
                          <button type="button" className="button button-small company-profile-address-status-button" disabled>Default Shipping</button>
                        ) : (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(index, "shipping")}>Set Default Shipping</button>
                        )}
                        <button type="button" className="button button-secondary button-small" onClick={() => setExpandedAddressIndex((current) => current === index ? -1 : index)}>
                          {expandedAddressIndex === index ? "Hide Details" : "Edit Address"}
                        </button>
                        <button type="button" className="button button-secondary button-small" onClick={() => removeAddress(index)} disabled={form.addresses.length === 1}>Delete</button>
                      </div>
                    </div>
                    {expandedAddressIndex === index ? (
                      <div className="company-profile-address-card-grid">
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressName} onChange={(event) => updateAddress(index, { addressName: event.target.value })} placeholder="Address Name" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.streetAddress} onChange={(event) => updateAddress(index, { streetAddress: event.target.value })} placeholder="Address Line 1" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine2} onChange={(event) => updateAddress(index, { addressLine2: event.target.value })} placeholder="Address Line 2" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine3} onChange={(event) => updateAddress(index, { addressLine3: event.target.value })} placeholder="Address Line 3" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.city} onChange={(event) => updateAddress(index, { city: event.target.value })} placeholder="City" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.postcode} onChange={(event) => updateAddress(index, { postcode: event.target.value })} placeholder="Postcode" />
                        </div>
                        <div className="company-profile-field company-profile-address-card-wide">
                          <SearchableSelect
                            value={address.country}
                            onChange={(value) => updateAddress(index, { country: value })}
                            options={countryOptions}
                            placeholder="Country"
                            searchPlaceholder="Search countries"
                            ariaLabel={`Address ${index + 1} Country`}
                            clearable
                          />
                        </div>
                        <div className="company-profile-field">
                          {isMalaysiaAddress ? (
                            <select value={address.state} onChange={(event) => updateAddress(index, { state: event.target.value })}>
                              <option value="">State</option>
                              {malaysiaStateOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input className="text-input" value={address.state} onChange={(event) => updateAddress(index, { state: event.target.value })} placeholder="State" />
                          )}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="company-profile-address-actions">
              <button type="button" className="button button-secondary" onClick={addAddress}>+ Add Address</button>
            </div>
          </section>

          <section className="company-profile-section" aria-labelledby="contact-contact-persons-title">
            <div className="company-profile-address-header">
              <h3 id="contact-contact-persons-title" className="section-title">Contact Persons</h3>
            </div>
            <div className="company-profile-address-list">
              {form.contactPersons.map((person, index) => (
                <article key={`person-${index}`} className="company-profile-address-card">
                  <div className="company-profile-address-card-header">
                    <div className="company-profile-address-card-heading company-profile-address-card-heading-nowrap">
                      <h4>{person.name || `Contact Person ${index + 1}`}</h4>
                    </div>
                    <div className="company-profile-address-card-actions">
                      <button type="button" className="button button-secondary button-small" onClick={() => removeContactPerson(index)} disabled={form.contactPersons.length === 1}>Delete</button>
                    </div>
                  </div>
                  <div className="company-profile-address-card-grid">
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
                  </div>
                </article>
              ))}
            </div>
            <div className="company-profile-address-actions">
              <button type="button" className="button button-secondary" onClick={addContactPerson}>+ Add Contact Person</button>
            </div>
          </section>

          <section className="company-profile-section" aria-labelledby="contact-financial-settings-title">
            <div className="company-profile-address-header">
              <h3 id="contact-financial-settings-title" className="section-title">Financial Settings</h3>
              <p className="muted">Only fields relevant to the selected contact type are shown.</p>
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
                    Receivable Account
                    <input className="text-input" value={form.receivableAccount} onChange={(event) => setForm((current) => ({ ...current, receivableAccount: event.target.value }))} />
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
                    Payable Account
                    <input className="text-input" value={form.payableAccount} onChange={(event) => setForm((current) => ({ ...current, payableAccount: event.target.value }))} />
                  </label>
                ) : null}
                <label className="form-label company-profile-field">
                  Income Account
                  <input className="text-input" value={form.incomeAccount} onChange={(event) => setForm((current) => ({ ...current, incomeAccount: event.target.value }))} />
                </label>
                <label className="form-label company-profile-field">
                  Expense Account
                  <input className="text-input" value={form.expenseAccount} onChange={(event) => setForm((current) => ({ ...current, expenseAccount: event.target.value }))} />
                </label>
            </div>
          </section>

          <section className="company-profile-section" aria-labelledby="contact-commercial-settings-title">
            <div className="company-profile-address-header">
              <h3 id="contact-commercial-settings-title" className="section-title">Commercial Settings</h3>
            </div>
            <div className="company-profile-fields-grid">
              <div className="form-label company-profile-field company-profile-field-wide">
                Groups
                <div className="contact-group-selector">
                  <div className="button-stack contact-group-selector-actions">
                    <button type="button" className="button button-secondary" onClick={() => navigate("/contact-groups")}>Manage Contact Groups</button>
                  </div>
                  {availableGroupOptions.length > 0 ? (
                    <div className="contact-checkbox-group">
                      {availableGroupOptions.map((groupName) => (
                        <label key={groupName} className="contact-checkbox-card">
                          <input
                            type="checkbox"
                            checked={form.groups.some((group) => group.toLowerCase() === groupName.toLowerCase())}
                            onChange={(event) => toggleGroup(groupName, event.target.checked)}
                          />
                          <span>{groupName}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No contact groups yet. Create groups first, then assign them here.</p>
                  )}
                </div>
              </div>
              <label className="form-label company-profile-field">
                Price Level
                <input className="text-input" value={form.priceLevel} onChange={(event) => setForm((current) => ({ ...current, priceLevel: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Currency
                <select value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}>
                  {availableCurrencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="form-label company-profile-field">
                Payment Term
                <input className="text-input" value={form.paymentTerm} onChange={(event) => setForm((current) => ({ ...current, paymentTerm: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Location
                <input className="text-input" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
              </label>
            </div>
          </section>

          <details className="contact-advanced-section">
            <summary>Advanced Settings</summary>
            <div className="company-profile-fields-grid">
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
                <div className="contact-editor-list">
                  {form.tags.map((tag, index) => (
                    <div key={`tag-${index}`} className="contact-editor-row">
                      <input className="text-input" value={tag} onChange={(event) => updateStringList("tags", index, event.target.value)} placeholder={`Tag ${index + 1}`} />
                      <button type="button" className="button button-secondary button-small" onClick={() => removeStringListItem("tags", index)} disabled={form.tags.length === 1}>Delete</button>
                    </div>
                  ))}
                  <button type="button" className="button button-secondary" onClick={() => addStringListItem("tags")}>+ Add Tag</button>
                </div>
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
          <div className="subscription-create-actions">
            <button type="submit" className="button button-primary">{editingCustomerId ? "Update contact" : "Save contact"}</button>
            <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Cancel</button>
          </div>
        </form>
      </section>
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
