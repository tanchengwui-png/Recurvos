import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MsicCodeModal } from "../components/MsicCodeModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { PhoneNumberField } from "../components/ui/PhoneNumberField";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { api, buildApiUrl } from "../lib/api";
import { getAuth, setAuth } from "../lib/auth";
import { formatCompanyAddress, getCompanyAddressTitle, parseLegacyCompanyAddress, type CompanyAddress } from "../lib/companyAddresses";
import { countryOptions, currencyOptions, malaysiaStateOptions, registrationNumberTypeOptions } from "../lib/localeOptions";
import { msicEntryByCode } from "../lib/msicOfficial";
import { combinePhoneNumber, DEFAULT_PHONE_COUNTRY_CODE, splitStoredPhoneNumber } from "../lib/phoneNumbers";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { CompanyLookup, PlatformUploadPolicy } from "../types";

const FACTORY_RESET_CONFIRMATION = "RESET COMPANY DATA";

type EditableCompanyAddress = {
  clientId: string;
  persistedId?: string;
  addressName: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
};

const emptyForm = {
  name: "",
  legalName: "",
  registrationNumberType: "",
  registrationNumber: "",
  oldRegistrationNumber: "",
  tin: "",
  msicCode: "",
  tourismTaxRegistrationNumber: "",
  homeCountry: "",
  homeCurrency: "MYR",
  email: "",
  phone: "",
  industry: "",
  natureOfBusiness: "",
  isActive: true,
};

function createLocalAddressId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `address-${Math.random().toString(36).slice(2, 10)}`;
}

function createEditableAddress(overrides: Partial<EditableCompanyAddress> = {}): EditableCompanyAddress {
  return {
    clientId: overrides.clientId ?? createLocalAddressId(),
    persistedId: overrides.persistedId,
    addressName: overrides.addressName ?? "",
    addressLine1: overrides.addressLine1 ?? "",
    addressLine2: overrides.addressLine2 ?? "",
    addressLine3: overrides.addressLine3 ?? "",
    postcode: overrides.postcode ?? "",
    city: overrides.city ?? "",
    state: overrides.state ?? "",
    country: overrides.country ?? "",
    isDefaultBilling: overrides.isDefaultBilling ?? false,
    isDefaultShipping: overrides.isDefaultShipping ?? false,
  };
}

function isMalaysiaCountry(country: string) {
  return country.trim().toLowerCase() === "malaysia";
}

function findMalaysiaStateOption(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  return malaysiaStateOptions.find((option) => option.value.trim().toLowerCase() === normalizedValue) ?? null;
}

function normalizeAddressForCountry(address: EditableCompanyAddress): EditableCompanyAddress {
  if (!isMalaysiaCountry(address.country)) {
    return address;
  }

  const matchingStateOption = findMalaysiaStateOption(address.state);
  return {
    ...address,
    state: matchingStateOption?.value ?? "",
  };
}

function mapCompanyAddressToEditable(address: CompanyAddress, persisted = true): EditableCompanyAddress {
  return normalizeAddressForCountry(createEditableAddress({
    clientId: address.id,
    persistedId: persisted ? address.id : undefined,
    addressName: address.addressName || "",
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? "",
    addressLine3: address.addressLine3 ?? "",
    postcode: address.postcode ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    country: address.country,
    isDefaultBilling: address.isDefaultBilling || (!address.isDefaultBilling && !address.isDefaultShipping && address.isDefault),
    isDefaultShipping: address.isDefaultShipping || (!address.isDefaultBilling && !address.isDefaultShipping && address.isDefault),
  }));
}

function ensureAddressDefaults(addresses: EditableCompanyAddress[]) {
  if (addresses.length === 0) {
    return [createEditableAddress({ isDefaultBilling: true, isDefaultShipping: true })];
  }

  let billingDefaultIndex = addresses.findIndex((address) => address.isDefaultBilling);
  if (billingDefaultIndex < 0) {
    billingDefaultIndex = 0;
  }

  let shippingDefaultIndex = addresses.findIndex((address) => address.isDefaultShipping);
  if (shippingDefaultIndex < 0) {
    shippingDefaultIndex = 0;
  }

  return addresses.map((address, index) => ({
    ...address,
    isDefaultBilling: index === billingDefaultIndex,
    isDefaultShipping: index === shippingDefaultIndex,
  }));
}

function getInitialAddresses(company?: CompanyLookup | null) {
  if (company?.addresses.length) {
    return ensureAddressDefaults(company.addresses.map((address) => mapCompanyAddressToEditable(address)));
  }

  const legacyAddress = company?.address ? parseLegacyCompanyAddress(company.address) : null;
  if (legacyAddress) {
    return [mapCompanyAddressToEditable(legacyAddress, false)];
  }

  return [createEditableAddress({ isDefaultBilling: true, isDefaultShipping: true })];
}

function hasAddressBodyContent(address: EditableCompanyAddress) {
  return Boolean(
    address.addressLine1.trim()
    || address.addressLine2.trim()
    || address.addressLine3.trim()
    || address.postcode.trim()
    || address.city.trim()
    || address.state.trim(),
  );
}

function shouldPersistAddress(address: EditableCompanyAddress) {
  return Boolean(address.addressName.trim()) || hasAddressBodyContent(address) || Boolean(address.addressLine1.trim() && address.country.trim());
}

function getAddressSummaryLines(address: EditableCompanyAddress) {
  const firstLine = [address.addressLine1.trim(), address.addressLine2.trim()].filter(Boolean).join(", ");
  const secondLine = [address.city.trim(), address.state.trim(), address.postcode.trim()].filter(Boolean).join(", ");
  const thirdLine = address.country.trim();

  return [firstLine, secondLine, thirdLine].filter(Boolean);
}

export function CompanyFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingCompanyId = id ?? null;
  const [items, setItems] = useState<CompanyLookup[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [addresses, setAddresses] = useState<EditableCompanyAddress[]>(() => [createEditableAddress({ isDefaultBilling: true, isDefaultShipping: true })]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoInsight, setLogoInsight] = useState("");
  const [logoMeta, setLogoMeta] = useState<{ width: number; height: number; warning: string } | null>(null);
  const [error, setError] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [isMsicModalOpen, setIsMsicModalOpen] = useState(false);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [factoryResetState, setFactoryResetState] = useState<{ step: "warning" | "final"; confirmationText: string; error: string; isSubmitting: boolean } | null>(null);
  const [expandedAddressIds, setExpandedAddressIds] = useState<string[]>(() => editingCompanyId ? [] : addresses.map((address) => address.clientId));

  const activeCompany = items.find((item) => item.id === editingCompanyId);
  const selectedMsicEntry = form.msicCode ? msicEntryByCode.get(form.msicCode) ?? null : null;

  useEffect(() => {
    async function load() {
      const [companies, policy] = await Promise.all([
        api.get<CompanyLookup[]>("/companies"),
        api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
      ]);

      setItems(companies);
      setUploadPolicy(policy);

      if (!editingCompanyId) {
        const initialAddress = createEditableAddress({ isDefaultBilling: true, isDefaultShipping: true });
        setAddresses([initialAddress]);
        setExpandedAddressIds([initialAddress.clientId]);
        setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
        setPhoneNumber("");
        return;
      }

      const company = companies.find((item) => item.id === editingCompanyId);
      if (!company) {
        setError("Company not found.");
        return;
      }

      setForm({
        name: company.name,
        legalName: company.legalName ?? company.name,
        registrationNumberType: company.registrationNumberType ?? "",
        registrationNumber: company.registrationNumber,
        oldRegistrationNumber: company.oldRegistrationNumber ?? "",
        tin: company.tin ?? "",
        msicCode: company.msicCode ?? "",
        tourismTaxRegistrationNumber: company.tourismTaxRegistrationNumber ?? "",
        homeCountry: company.homeCountry ?? "",
        homeCurrency: company.homeCurrency ?? "MYR",
        email: company.email,
        phone: company.phone,
        industry: company.industry ?? "",
        natureOfBusiness: company.natureOfBusiness ?? "",
        isActive: company.isActive,
      });
      const parsedPhone = splitStoredPhoneNumber(company.phone);
      setPhoneCountryCode(parsedPhone.countryCode);
      setPhoneNumber(parsedPhone.phoneNumber);
      setAddresses(getInitialAddresses(company));
      setExpandedAddressIds([]);
    }

    void load();
  }, [editingCompanyId]);

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    async function loadLogoPreview() {
      if (logoFile) {
        objectUrl = URL.createObjectURL(logoFile);
        if (isActive) {
          setLogoPreviewUrl(objectUrl);
        }
        return;
      }

      if (logoRemoved || !editingCompanyId || !activeCompany?.hasLogo) {
        if (isActive) {
          setLogoPreviewUrl("");
        }
        return;
      }

      const session = getAuth();
      const response = await fetch(buildApiUrl(`/companies/${editingCompanyId}/logo`), {
        headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
      });

      if (!response.ok) {
        if (isActive) {
          setLogoPreviewUrl("");
        }
        return;
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      if (isActive) {
        setLogoPreviewUrl(objectUrl);
      }
    }

    void loadLogoPreview();

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeCompany?.hasLogo, editingCompanyId, logoFile, logoRemoved]);

  useEffect(() => {
    if (!logoPreviewUrl) {
      setLogoInsight("");
      setLogoMeta(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      const ratio = image.width / image.height;
      const smallestSide = Math.min(image.width, image.height);
      let warning = "";
      let insight = "Looks good for invoices";
      if (ratio < 2.2) {
        insight = "This logo is a bit tall and may feel cramped";
        warning = "Wide logos usually fit invoices better than tall ones.";
      } else if (smallestSide < 120) {
        insight = "This logo may look too small on invoices";
        warning = "Use a larger image if you can. Small logos can look blurry or hard to read.";
      } else if (ratio > 5.5) {
        insight = "This logo is very wide";
        warning = "Check the invoice preview to make sure it still feels balanced.";
      }

      if (image.width < 280 || image.height < 88) {
        warning = "This file is smaller than recommended. Around 600 x 200 pixels usually works well.";
      }

      setLogoInsight(insight);
      setLogoMeta({
        width: image.width,
        height: image.height,
        warning,
      });
    };
    image.src = logoPreviewUrl;
  }, [logoPreviewUrl]);

  function updateAddress(clientId: string, patch: Partial<EditableCompanyAddress>) {
    setAddresses((current) => ensureAddressDefaults(current.map((address) => (
      address.clientId === clientId ? { ...address, ...patch } : address
    ))));
  }

  function updateAddressCountry(clientId: string, country: string) {
    setAddresses((current) => ensureAddressDefaults(current.map((address) => {
      if (address.clientId !== clientId) {
        return address;
      }

      const nextAddress = { ...address, country };
      return normalizeAddressForCountry(nextAddress);
    })));
  }

  function addAddress() {
    const nextAddress = createEditableAddress();
    setAddresses((current) => [
      ...current,
      nextAddress,
    ]);
    setExpandedAddressIds((current) => current.includes(nextAddress.clientId) ? current : [...current, nextAddress.clientId]);
  }

  function deleteAddress(clientId: string) {
    setAddresses((current) => {
      if (current.length === 1) {
        setError("Add a replacement address before deleting the last address.");
        return current;
      }

      const remaining = current.filter((address) => address.clientId !== clientId);
      setError("");
      return ensureAddressDefaults(remaining);
    });
    setExpandedAddressIds((current) => current.filter((addressId) => addressId !== clientId));
  }

  function setDefaultAddress(clientId: string, type: "billing" | "shipping") {
    setAddresses((current) => ensureAddressDefaults(current.map((address) => ({
      ...address,
      isDefaultBilling: type === "billing" ? address.clientId === clientId : address.isDefaultBilling,
      isDefaultShipping: type === "shipping" ? address.clientId === clientId : address.isDefaultShipping,
    }))));
  }

  function toggleAddressExpanded(clientId: string) {
    setExpandedAddressIds((current) => current.includes(clientId)
      ? current.filter((addressId) => addressId !== clientId)
      : [...current, clientId]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const normalizedLegalName = form.legalName.trim();
    const normalizedAddresses = ensureAddressDefaults(addresses.map((address) => normalizeAddressForCountry({
      ...address,
      addressName: address.addressName.trim(),
      addressLine1: address.addressLine1.trim(),
      addressLine2: address.addressLine2.trim(),
      addressLine3: address.addressLine3.trim(),
      postcode: address.postcode.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      country: address.country.trim(),
    })));
    const populatedAddresses = normalizedAddresses.filter(shouldPersistAddress);
    const invalidAddress = populatedAddresses.find((address) => !address.addressName.trim() || !address.addressLine1.trim() || !address.country.trim());
    const defaultAddress = populatedAddresses.find((address) => address.isDefaultBilling) ?? populatedAddresses[0];
    const normalizedPhone = combinePhoneNumber(phoneCountryCode, phoneNumber);

    if (!normalizedPhone) {
      setError("Enter a country code and phone number.");
      return;
    }

    if (invalidAddress) {
      const invalidIndex = populatedAddresses.findIndex((address) => address.clientId === invalidAddress.clientId);
      setError(`Address ${invalidIndex + 1} must include Address Name, Address Line 1, and Country.`);
      return;
    }

    const payload = {
      name: normalizedLegalName || form.name.trim(),
      legalName: normalizedLegalName,
      registrationNumberType: form.registrationNumberType,
      registrationNumber: form.registrationNumber,
      oldRegistrationNumber: form.oldRegistrationNumber,
      tin: form.tin,
      msicCode: form.msicCode,
      tourismTaxRegistrationNumber: form.tourismTaxRegistrationNumber,
      homeCountry: form.homeCountry,
      homeCurrency: form.homeCurrency,
      email: form.email,
      phone: normalizedPhone,
      address: defaultAddress ? formatCompanyAddress(defaultAddress) : "",
      addresses: populatedAddresses.map((address) => ({
        id: address.persistedId ?? null,
        addressName: address.addressName,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        addressLine3: address.addressLine3,
        postcode: address.postcode,
        city: address.city,
        state: address.state,
        country: address.country,
        isDefault: address.isDefaultBilling,
        isDefaultBilling: address.isDefaultBilling,
        isDefaultShipping: address.isDefaultShipping,
      })),
      industry: form.industry,
      natureOfBusiness: form.natureOfBusiness,
      isActive: form.isActive,
    };

    setConfirmState({
      title: editingCompanyId ? "Update company" : "Create company",
      description: editingCompanyId
        ? `Save changes to ${form.name || "this company"}?`
        : `Create ${form.name || "this company"} under your subscriber account?`,
      action: async () => {
        try {
          const company = editingCompanyId
            ? await api.put<CompanyLookup>(`/companies/${editingCompanyId}`, payload)
            : await api.post<CompanyLookup>("/companies", payload);

          if (logoFile) {
            const body = new FormData();
            body.append("file", logoFile);
            await api.postForm<CompanyLookup>(`/companies/${company.id}/logo`, body);
          } else if (logoRemoved && editingCompanyId && activeCompany?.hasLogo) {
            await api.delete(`/companies/${editingCompanyId}/logo`);
          }

          navigate("/companies", {
            replace: true,
            state: { flashMessage: editingCompanyId ? `Company updated: ${payload.name || "Company"}.` : `Company created: ${payload.name || "Company"}.` },
          });
        } catch (submitError) {
          const nextError = submitError instanceof Error ? submitError.message : "Unable to save company.";
          setError(nextError);
          throw new Error(nextError);
        }
      },
    });
  }

  async function clearCompanyClientState() {
    const auth = getAuth();
    if (auth) {
      setAuth({ ...auth, companyName: "Account" });
    }

    const localKeysToRemove = Object.keys(localStorage).filter((key) => key.startsWith("recurvos.") && key !== "recurvos.auth");
    for (const key of localKeysToRemove) {
      localStorage.removeItem(key);
    }

    try {
      sessionStorage.clear();
    } catch {
      // Best-effort cleanup only.
    }

    try {
      if (typeof caches !== "undefined") {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    } catch {
      // Best-effort cleanup only.
    }

    try {
      if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
        const databases = await indexedDB.databases();
        await Promise.all(
          databases
            .map((database) => database.name)
            .filter((name): name is string => Boolean(name))
            .map((name) => new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            })),
        );
      }
    } catch {
      // Best-effort cleanup only.
    }
  }

  const auth = getAuth();
  const canFactoryReset = Boolean(editingCompanyId && auth && !auth.isPlatformOwner && ["Owner", "Admin"].includes(auth.role));

  const availableRegistrationNumberTypeOptions = form.registrationNumberType && !registrationNumberTypeOptions.some((option) => option.value === form.registrationNumberType)
    ? [{ value: form.registrationNumberType, label: form.registrationNumberType }, ...registrationNumberTypeOptions]
    : registrationNumberTypeOptions;

  const availableCurrencyOptions = form.homeCurrency && !currencyOptions.some((option) => option.value === form.homeCurrency)
    ? [{ value: form.homeCurrency, label: form.homeCurrency }, ...currencyOptions]
    : currencyOptions;

  const requiredMark = <span className="form-required-indicator" aria-hidden="true">*</span>;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{editingCompanyId ? "Update billing profile" : "Create billing profile"}</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/companies")}>Back to companies</button>
      </header>
      <section className="card company-profile-card">
        <form id="company-form" className="form-stack company-profile-form" onSubmit={submit}>
          <section className="company-profile-section" aria-labelledby="company-information-title">
            <div className="company-profile-address-header">
              <h3 id="company-information-title" className="section-title">Company Information</h3>
            </div>
            <div className="company-profile-fields-grid">
              <label className="form-label company-profile-field">
                <span className="form-label-inline">Legal Name {requiredMark}</span>
                <input className="text-input" value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value, name: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Registration Number Type
                <select value={form.registrationNumberType} onChange={(event) => setForm((current) => ({ ...current, registrationNumberType: event.target.value }))}>
                  <option value="">Select registration type</option>
                  {availableRegistrationNumberTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="form-label company-profile-field">
                <span className="form-label-inline">Registration Number {requiredMark}</span>
                <input className="text-input" value={form.registrationNumber} onChange={(event) => setForm((current) => ({ ...current, registrationNumber: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Old Registration Number
                <input className="text-input" value={form.oldRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, oldRegistrationNumber: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                TIN
                <input className="text-input" value={form.tin} onChange={(event) => setForm((current) => ({ ...current, tin: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                Tourism Tax Registration Number
                <input className="text-input" value={form.tourismTaxRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, tourismTaxRegistrationNumber: event.target.value }))} />
              </label>
              <label className="form-label company-profile-field">
                <span className="form-label-inline">Home Country {requiredMark}</span>
                <SearchableSelect
                  value={form.homeCountry}
                  onChange={(value) => setForm((current) => ({ ...current, homeCountry: value }))}
                  options={countryOptions}
                  placeholder="Select a Country"
                  searchPlaceholder="Search countries"
                  ariaLabel="Home Country"
                />
              </label>
              <label className="form-label company-profile-field">
                <span className="form-label-inline">Home Currency {requiredMark}</span>
                <select value={form.homeCurrency} onChange={(event) => setForm((current) => ({ ...current, homeCurrency: event.target.value }))}>
                  {availableCurrencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="company-profile-section" aria-labelledby="company-business-information-title">
            <div className="company-profile-address-header">
              <h3 id="company-business-information-title" className="section-title">Business Information</h3>
            </div>
            <div className="company-profile-fields-grid">
              <label className="form-label company-profile-field company-profile-field-wide">
                MSIC Code
                <button type="button" className="text-input msic-picker-trigger" onClick={() => setIsMsicModalOpen(true)}>
                  <span className={selectedMsicEntry ? "msic-picker-trigger-value" : "msic-picker-trigger-placeholder"}>
                    {selectedMsicEntry ? `${selectedMsicEntry.code} - ${selectedMsicEntry.item}` : "Select official 5-digit MSIC code"}
                  </span>
                </button>
              </label>
              <label className="form-label company-profile-field">
                Industry
                <input className="text-input" value={form.industry} readOnly placeholder="Selected from official MSIC code" />
              </label>
              <label className="form-label company-profile-field">
                Nature of Business
                <input className="text-input" value={form.natureOfBusiness} readOnly placeholder="Selected from official MSIC code" />
              </label>
            </div>
          </section>
          <section className="company-profile-section" aria-labelledby="company-contact-title">
            <div className="company-profile-address-header">
              <h3 id="company-contact-title" className="section-title">Contact</h3>
            </div>
            <div className="company-profile-split">
              <div className="company-profile-column">
                <label className="form-label company-profile-field">
                  <span className="form-label-inline">Email {requiredMark}</span>
                  <input className="text-input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
              </div>
              <div className="company-profile-column">
                <PhoneNumberField
                  countryCodeId="company-phone-country-code"
                  phoneNumberId="company-phone-number"
                  countryCodeValue={phoneCountryCode}
                  phoneNumberValue={phoneNumber}
                  onCountryCodeChange={setPhoneCountryCode}
                  onPhoneNumberChange={setPhoneNumber}
                  phoneNumberLabel={<span className="form-label-inline">Phone Number {requiredMark}</span>}
                />
              </div>
            </div>
          </section>
          <section className="company-profile-address-section" aria-labelledby="company-address-information-title">
            <div className="company-profile-address-header">
              <h3 id="company-address-information-title" className="section-title">Address List</h3>
              <p className="muted">Add one or more company addresses. Choose separate billing and shipping defaults for downstream workflows.</p>
            </div>
            <div className="company-profile-address-list">
              {addresses.map((address, index) => {
                const isMalaysiaAddress = isMalaysiaCountry(address.country);
                const summaryLines = getAddressSummaryLines(address);
                const isExpanded = expandedAddressIds.includes(address.clientId);

                return (
                  <article key={address.clientId} className={`company-profile-address-card ${isExpanded ? "company-profile-address-card-expanded" : "company-profile-address-card-collapsed"}`}>
                    <div className="company-profile-address-card-header">
                      <div className="company-profile-address-card-heading">
                        <div className="company-profile-address-title-row">
                          <h4>{getCompanyAddressTitle(address, index)}</h4>
                          {address.isDefaultBilling ? <span className="status-pill status-pill-active status-pill-compact">Billing Default</span> : null}
                          {address.isDefaultShipping ? <span className="status-pill status-pill-active status-pill-compact">Shipping Default</span> : null}
                        </div>
                        {!isExpanded ? (
                          <div className="company-profile-address-summary">
                            {summaryLines.length > 0 ? (
                              summaryLines.map((line) => <p key={line}>{line}</p>)
                            ) : (
                              <p className="muted">No address details entered yet.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="company-profile-address-card-actions">
                        {!address.isDefaultBilling ? (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(address.clientId, "billing")}>
                            Set Billing
                          </button>
                        ) : null}
                        {!address.isDefaultShipping ? (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(address.clientId, "shipping")}>
                            Set Shipping
                          </button>
                        ) : null}
                        <button type="button" className="button button-secondary button-small" onClick={() => toggleAddressExpanded(address.clientId)} aria-expanded={isExpanded}>
                          {isExpanded ? "Collapse ▲" : "Expand ▼"}
                        </button>
                        <button type="button" className="button button-secondary button-small" onClick={() => deleteAddress(address.clientId)} disabled={addresses.length === 1}>
                          Delete
                        </button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <div className="company-profile-address-card-grid">
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressName} onChange={(event) => updateAddress(address.clientId, { addressName: event.target.value })} placeholder="Address Name *" aria-label="Address Name" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine1} onChange={(event) => updateAddress(address.clientId, { addressLine1: event.target.value })} autoComplete="address-line1" placeholder="Address Line 1 *" aria-label="Address Line 1" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine2} onChange={(event) => updateAddress(address.clientId, { addressLine2: event.target.value })} autoComplete="address-line2" placeholder="Address Line 2" aria-label="Address Line 2" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.addressLine3} onChange={(event) => updateAddress(address.clientId, { addressLine3: event.target.value })} autoComplete="address-line3" placeholder="Address Line 3" aria-label="Address Line 3" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.city} onChange={(event) => updateAddress(address.clientId, { city: event.target.value })} autoComplete="address-level2" placeholder="City *" aria-label="City" />
                        </div>
                        <div className="company-profile-field">
                          <input className="text-input" value={address.postcode} onChange={(event) => updateAddress(address.clientId, { postcode: event.target.value })} autoComplete="postal-code" placeholder="Postal Code *" aria-label="Postal Code" />
                        </div>
                        <div className="company-profile-field company-profile-address-card-wide">
                          <SearchableSelect
                            value={address.country}
                            onChange={(value) => updateAddressCountry(address.clientId, value)}
                            options={countryOptions}
                            placeholder="Country *"
                            searchPlaceholder="Search countries"
                            ariaLabel="Address Country"
                            clearable
                          />
                        </div>
                        <div className="company-profile-field">
                          {isMalaysiaAddress ? (
                            <select value={address.state} onChange={(event) => updateAddress(address.clientId, { state: event.target.value })} autoComplete="address-level1" required aria-label="State">
                              <option value="">State *</option>
                              {malaysiaStateOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input className="text-input" value={address.state} onChange={(event) => updateAddress(address.clientId, { state: event.target.value })} autoComplete="address-level1" placeholder="State *" aria-label="State" />
                          )}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="company-profile-address-actions">
              <button type="button" className="button button-secondary" onClick={addAddress}>+ Add New Address</button>
            </div>
          </section>
          <section className="company-profile-logo-section" aria-labelledby="company-logo-title">
            <div className="company-profile-address-header">
              <h3 id="company-logo-title" className="section-title">Company Logo</h3>
              <p className="muted">Upload the logo that appears on your invoice header. You can add, replace, or remove it here before saving.</p>
            </div>
            <div className="company-profile-logo-layout">
              <div className="company-profile-logo-preview">
                <div className="logo-preview-frame company-profile-logo-frame">
                  {logoPreviewUrl ? <img src={logoPreviewUrl} alt="Company logo preview" className="logo-preview-image" /> : <span className="muted">No logo selected</span>}
                </div>
                <div className="company-profile-logo-summary">
                  <span className={`status-pill ${logoInsight === "Looks good for invoices" ? "status-pill-active" : "status-pill-inactive"}`}>
                    {logoRemoved ? "Logo will be removed" : logoInsight || (activeCompany?.hasLogo ? "Current logo" : "Preview pending")}
                  </span>
                  {logoMeta ? (
                    <>
                      {logoMeta.warning ? <HelperText>{logoMeta.warning}</HelperText> : null}
                    </>
                  ) : (
                    <p className="muted">Recommended size: a wide logo around 600 x 200 pixels.</p>
                  )}
                </div>
              </div>
              <div className="company-profile-logo-controls">
                <div className="form-label">
                  <input
                    className="text-input"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    aria-label="Logo file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) {
                        setLogoFile(null);
                        return;
                      }

                      void (async () => {
                        try {
                          const prepared = await prepareImageUpload(file, uploadPolicy);
                          setError("");
                          setLogoRemoved(false);
                          setLogoFile(prepared);
                        } catch (uploadError) {
                          setError(uploadError instanceof Error ? uploadError.message : `Logo must be ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} or smaller.`);
                          event.target.value = "";
                          setLogoFile(null);
                        }
                      })();
                    }}
                  />
                </div>
                <div className="company-profile-logo-summary">
                  {logoRemoved ? <p className="muted">Current logo will be removed when you save.</p> : null}
                  {!logoRemoved && !logoFile ? <p className="muted">{`Current: ${activeCompany?.hasLogo ? "Logo uploaded" : "No logo uploaded"}`}</p> : null}
                  {logoMeta ? <p className="muted">{`Image size: ${logoMeta.width} x ${logoMeta.height}px`}</p> : null}
                  <p className="muted">{`Size limit: ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)}. PNG, JPG, JPEG, or WEBP.`}</p>
                </div>
                <div className="company-profile-logo-actions">
                  {(logoFile || activeCompany?.hasLogo) && !logoRemoved ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setLogoFile(null);
                        setLogoRemoved(Boolean(activeCompany?.hasLogo));
                        setError("");
                      }}
                    >
                      {logoFile && activeCompany?.hasLogo ? "Remove current logo" : logoFile ? "Clear selected logo" : "Remove logo"}
                    </button>
                  ) : null}
                  {logoRemoved && activeCompany?.hasLogo ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setLogoRemoved(false);
                        setError("");
                      }}
                    >
                      Keep current logo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
            Active
          </label>
          {canFactoryReset ? (
            <section className="company-profile-danger-zone" aria-labelledby="company-factory-reset-title">
              <div className="company-profile-address-header">
                <h3 id="company-factory-reset-title" className="section-title">Factory Reset</h3>
                <p className="muted">Permanently clears this company's logo, contact data, addresses, settings, products, subscriptions, invoices, payments, and related cached company data. This action cannot be undone.</p>
              </div>
            </section>
          ) : null}
          {error ? <HelperText tone="error">{error}</HelperText> : null}
          <div className="subscription-create-actions company-form-actions">
            <div className="company-form-actions-left">
              {canFactoryReset ? (
                <button type="button" className="button button-danger" onClick={() => setFactoryResetState({ step: "warning", confirmationText: "", error: "", isSubmitting: false })}>
                  Factory Reset
                </button>
              ) : null}
            </div>
            <div className="company-form-actions-right">
              <button type="button" className="button button-secondary" onClick={() => navigate("/companies")}>Cancel</button>
              <button type="submit" className="button button-primary">{editingCompanyId ? "Update company" : "Create company"}</button>
            </div>
          </div>
        </form>
      </section>
      {isMsicModalOpen ? (
        <MsicCodeModal
          initialCode={form.msicCode}
          onClose={() => setIsMsicModalOpen(false)}
          onSelect={(entry) => {
            setForm((current) => ({
              ...current,
              msicCode: entry.code,
              industry: entry.section,
              natureOfBusiness: entry.item,
            }));
            setIsMsicModalOpen(false);
          }}
        />
      ) : null}
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
      {factoryResetState && editingCompanyId ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !factoryResetState.isSubmitting && setFactoryResetState(null)}>
          <div className="modal-card card factory-reset-modal" role="dialog" aria-modal="true" aria-labelledby="factory-reset-modal-title" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">Danger zone</p>
            <h3 id="factory-reset-modal-title">Factory reset company data</h3>
            {factoryResetState.step === "warning" ? (
              <>
                <p className="muted">This will permanently clear all records, logos, contact information, address information, company settings, products, subscriptions, invoices, payments, cached company data, and related metadata for this company only.</p>
                <HelperText tone="error">This action cannot be undone.</HelperText>
                <label className="form-label factory-reset-modal-field">
                  Type <strong>{FACTORY_RESET_CONFIRMATION}</strong> to continue
                  <input
                    className="text-input"
                    value={factoryResetState.confirmationText}
                    onChange={(event) => setFactoryResetState((current) => current ? { ...current, confirmationText: event.target.value, error: "" } : current)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </>
            ) : (
              <>
                <p className="muted">Final confirmation: the reset will start immediately and remove all related billing profile data for this company only.</p>
                <HelperText tone="error">This action cannot be undone.</HelperText>
              </>
            )}
            {factoryResetState.error ? <HelperText tone="error">{factoryResetState.error}</HelperText> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={factoryResetState.isSubmitting}
                onClick={() => {
                  if (factoryResetState.step === "final") {
                    setFactoryResetState((current) => current ? { ...current, step: "warning", error: "" } : current);
                    return;
                  }

                  setFactoryResetState(null);
                }}
              >
                {factoryResetState.step === "final" ? "Back" : "Cancel"}
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={factoryResetState.isSubmitting || (factoryResetState.step === "warning" && factoryResetState.confirmationText !== FACTORY_RESET_CONFIRMATION)}
                onClick={async () => {
                  if (factoryResetState.isSubmitting) {
                    return;
                  }

                  if (factoryResetState.step === "warning") {
                    setFactoryResetState((current) => current ? { ...current, step: "final", error: "" } : current);
                    return;
                  }

                  try {
                    setFactoryResetState((current) => current ? { ...current, isSubmitting: true, error: "" } : current);
                    await api.post(`/companies/${editingCompanyId}/factory-reset`, { confirmationText: FACTORY_RESET_CONFIRMATION });
                    await clearCompanyClientState();
                    navigate("/companies", {
                      replace: true,
                      state: {
                        flashMessage: "Factory reset complete. Selected company data has been cleared.",
                        removedCompanyId: editingCompanyId,
                      },
                    });
                  } catch (resetError) {
                    setFactoryResetState((current) => current ? { ...current, isSubmitting: false, error: resetError instanceof Error ? resetError.message : "Unable to factory reset company data." } : current);
                    return;
                  }

                  setFactoryResetState(null);
                }}
              >
                {factoryResetState.isSubmitting ? "Resetting..." : factoryResetState.step === "warning" ? "Continue" : "Confirm reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
