import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MsicCodeModal } from "../components/MsicCodeModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api, buildApiUrl } from "../lib/api";
import { getAuth, setAuth } from "../lib/auth";
import { formatCompanyAddress, getCompanyAddressTitle, parseLegacyCompanyAddress, type CompanyAddress } from "../lib/companyAddresses";
import { countryOptions, currencyOptions, malaysiaStateOptions, registrationNumberTypeOptions } from "../lib/localeOptions";
import { msicEntryByCode } from "../lib/msicOfficial";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { CompanyLookup, PlatformUploadPolicy } from "../types";

const FACTORY_RESET_CONFIRMATION = "RESET COMPANY DATA";

type EditableCompanyAddress = {
  clientId: string;
  persistedId?: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
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
    addressLine1: overrides.addressLine1 ?? "",
    addressLine2: overrides.addressLine2 ?? "",
    addressLine3: overrides.addressLine3 ?? "",
    postcode: overrides.postcode ?? "",
    city: overrides.city ?? "",
    state: overrides.state ?? "",
    country: overrides.country ?? "",
    isDefault: overrides.isDefault ?? false,
  };
}

function mapCompanyAddressToEditable(address: CompanyAddress, persisted = true): EditableCompanyAddress {
  return createEditableAddress({
    clientId: address.id,
    persistedId: persisted ? address.id : undefined,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? "",
    addressLine3: address.addressLine3 ?? "",
    postcode: address.postcode ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    country: address.country,
    isDefault: address.isDefault,
  });
}

function ensureSingleDefault(addresses: EditableCompanyAddress[]) {
  if (addresses.length === 0) {
    return [createEditableAddress({ isDefault: true })];
  }

  let defaultIndex = addresses.findIndex((address) => address.isDefault);
  if (defaultIndex < 0) {
    defaultIndex = 0;
  }

  return addresses.map((address, index) => ({
    ...address,
    isDefault: index === defaultIndex,
  }));
}

function getInitialAddresses(company?: CompanyLookup | null) {
  if (company?.addresses.length) {
    return ensureSingleDefault(company.addresses.map((address) => mapCompanyAddressToEditable(address)));
  }

  const legacyAddress = company?.address ? parseLegacyCompanyAddress(company.address) : null;
  if (legacyAddress) {
    return [mapCompanyAddressToEditable(legacyAddress, false)];
  }

  return [createEditableAddress({ isDefault: true })];
}

export function CompanyFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingCompanyId = id ?? null;
  const [items, setItems] = useState<CompanyLookup[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [addresses, setAddresses] = useState<EditableCompanyAddress[]>(() => [createEditableAddress({ isDefault: true })]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoInsight, setLogoInsight] = useState("");
  const [logoMeta, setLogoMeta] = useState<{ width: number; height: number; warning: string; recommendation: string } | null>(null);
  const [error, setError] = useState("");
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [isMsicModalOpen, setIsMsicModalOpen] = useState(false);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [factoryResetState, setFactoryResetState] = useState<{ step: "warning" | "final"; confirmationText: string; error: string; isSubmitting: boolean } | null>(null);

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
        setAddresses([createEditableAddress({ isDefault: true })]);
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
      setAddresses(getInitialAddresses(company));
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
      let recommendation = "Best choice: a simple wide logo with large readable text.";

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

      if (ratio >= 2.2 && ratio <= 5.5 && smallestSide >= 120 && image.width >= 280 && image.height >= 88) {
        recommendation = "Looks good. Customers will see the logo close to this size on invoices.";
      }

      setLogoInsight(insight);
      setLogoMeta({
        width: image.width,
        height: image.height,
        warning,
        recommendation,
      });
    };
    image.src = logoPreviewUrl;
  }, [logoPreviewUrl]);

  function updateAddress(clientId: string, patch: Partial<EditableCompanyAddress>) {
    setAddresses((current) => ensureSingleDefault(current.map((address) => (
      address.clientId === clientId ? { ...address, ...patch } : address
    ))));
  }

  function addAddress() {
    setAddresses((current) => [
      ...current,
      createEditableAddress({
        country: current.find((address) => address.isDefault)?.country ?? "",
      }),
    ]);
  }

  function deleteAddress(clientId: string) {
    setAddresses((current) => {
      if (current.length === 1) {
        setError("Add a replacement address before deleting the last address.");
        return current;
      }

      const remaining = current.filter((address) => address.clientId !== clientId);
      setError("");
      return ensureSingleDefault(remaining);
    });
  }

  function setDefaultAddress(clientId: string) {
    setAddresses((current) => current.map((address) => ({
      ...address,
      isDefault: address.clientId === clientId,
    })));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const normalizedLegalName = form.legalName.trim();
    const normalizedAddresses = ensureSingleDefault(addresses);
    const defaultAddress = normalizedAddresses.find((address) => address.isDefault) ?? normalizedAddresses[0];
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
      phone: form.phone,
      address: defaultAddress ? formatCompanyAddress(defaultAddress) : "",
      addresses: normalizedAddresses.map((address) => ({
        id: address.persistedId ?? null,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        addressLine3: address.addressLine3,
        postcode: address.postcode,
        city: address.city,
        state: address.state,
        country: address.country,
        isDefault: address.isDefault,
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

  const availableCountryOptions = form.homeCountry && !countryOptions.some((option) => option.value === form.homeCountry)
    ? [{ value: form.homeCountry, label: form.homeCountry }, ...countryOptions]
    : countryOptions;

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
            <div className="company-profile-split">
              <div className="company-profile-column">
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
                  TIN
                  <input className="text-input" value={form.tin} onChange={(event) => setForm((current) => ({ ...current, tin: event.target.value }))} />
                </label>
                <label className="form-label company-profile-field">
                  <span className="form-label-inline">Home Country {requiredMark}</span>
                  <select value={form.homeCountry} onChange={(event) => setForm((current) => ({ ...current, homeCountry: event.target.value }))}>
                    <option value="">Select country</option>
                    {availableCountryOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="company-profile-column">
                <label className="form-label company-profile-field">
                  <span className="form-label-inline">Legal Name {requiredMark}</span>
                  <input className="text-input" value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value, name: event.target.value }))} />
                </label>
                <label className="form-label company-profile-field">
                  Old Registration Number
                  <input className="text-input" value={form.oldRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, oldRegistrationNumber: event.target.value }))} />
                </label>
                <label className="form-label company-profile-field">
                  Tourism Tax Registration Number
                  <input className="text-input" value={form.tourismTaxRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, tourismTaxRegistrationNumber: event.target.value }))} />
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
            </div>
          </section>
          <section className="company-profile-section" aria-labelledby="company-business-information-title">
            <div className="company-profile-address-header">
              <h3 id="company-business-information-title" className="section-title">Business Information</h3>
            </div>
            <div className="company-profile-split">
              <div className="company-profile-column">
                <label className="form-label company-profile-field">
                  MSIC Code
                  <button type="button" className="text-input msic-picker-trigger" onClick={() => setIsMsicModalOpen(true)}>
                    <span className={selectedMsicEntry ? "msic-picker-trigger-value" : "msic-picker-trigger-placeholder"}>
                      {selectedMsicEntry ? `${selectedMsicEntry.code} - ${selectedMsicEntry.item}` : "Select official 5-digit MSIC code"}
                    </span>
                  </button>
                  {selectedMsicEntry ? <span className="muted msic-picker-caption">{`${selectedMsicEntry.division} | ${selectedMsicEntry.group}`}</span> : null}
                </label>
                <label className="form-label company-profile-field">
                  Industry
                  <input className="text-input" value={form.industry} readOnly placeholder="Selected from official MSIC code" />
                </label>
              </div>
              <div className="company-profile-column">
                <label className="form-label company-profile-field">
                  Nature of Business
                  <input className="text-input" value={form.natureOfBusiness} readOnly placeholder="Selected from official MSIC code" />
                </label>
              </div>
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
                <label className="form-label company-profile-field">
                  <span className="form-label-inline">Phone {requiredMark}</span>
                  <input className="text-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
              </div>
            </div>
          </section>
          <section className="company-profile-address-section" aria-labelledby="company-address-information-title">
            <div className="company-profile-address-header">
              <h3 id="company-address-information-title" className="section-title">Address List</h3>
              <p className="muted">Add one or more company addresses. The default address is used automatically unless another address is selected elsewhere.</p>
            </div>
            <div className="company-profile-address-list">
              {addresses.map((address, index) => {
                const availableAddressCountryOptions = address.country && !countryOptions.some((option) => option.value === address.country)
                  ? [{ value: address.country, label: address.country }, ...countryOptions]
                  : countryOptions;
                const availableStateOptions = address.state && !malaysiaStateOptions.some((option) => option.value === address.state)
                  ? [{ value: address.state, label: address.state }, ...malaysiaStateOptions]
                  : malaysiaStateOptions;

                return (
                  <article key={address.clientId} className="company-profile-address-card">
                    <div className="company-profile-address-card-header">
                      <div className="company-profile-address-card-heading">
                        <h4>{getCompanyAddressTitle(address, index)}</h4>
                        <div className="company-profile-address-card-badges">
                          <span className={`status-pill ${address.isDefault ? "status-pill-active" : "status-pill-inactive"}`}>
                            {address.isDefault ? "Default" : `Address ${index + 1}`}
                          </span>
                        </div>
                      </div>
                      <div className="company-profile-address-card-actions">
                        {!address.isDefault ? (
                          <button type="button" className="button button-secondary button-small" onClick={() => setDefaultAddress(address.clientId)}>
                            Set as default
                          </button>
                        ) : null}
                        <button type="button" className="button button-secondary button-small" onClick={() => deleteAddress(address.clientId)} disabled={addresses.length === 1}>
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="company-profile-address-card-grid">
                      <label className="form-label company-profile-field">
                        Address Line 1
                        <input className="text-input" value={address.addressLine1} onChange={(event) => updateAddress(address.clientId, { addressLine1: event.target.value })} autoComplete="address-line1" />
                      </label>
                      <label className="form-label company-profile-field">
                        Address Line 2
                        <input className="text-input" value={address.addressLine2} onChange={(event) => updateAddress(address.clientId, { addressLine2: event.target.value })} autoComplete="address-line2" />
                      </label>
                      <label className="form-label company-profile-field">
                        Address Line 3
                        <input className="text-input" value={address.addressLine3} onChange={(event) => updateAddress(address.clientId, { addressLine3: event.target.value })} autoComplete="address-line3" />
                      </label>
                      <label className="form-label company-profile-field">
                        Postcode
                        <input className="text-input" value={address.postcode} onChange={(event) => updateAddress(address.clientId, { postcode: event.target.value })} autoComplete="postal-code" />
                      </label>
                      <label className="form-label company-profile-field">
                        City
                        <input className="text-input" value={address.city} onChange={(event) => updateAddress(address.clientId, { city: event.target.value })} autoComplete="address-level2" />
                      </label>
                      <label className="form-label company-profile-field">
                        State
                        <input className="text-input" list={`company-state-options-${address.clientId}`} value={address.state} onChange={(event) => updateAddress(address.clientId, { state: event.target.value })} autoComplete="address-level1" />
                        <datalist id={`company-state-options-${address.clientId}`}>
                          {availableStateOptions.map((option) => (
                            <option key={option.value} value={option.value} />
                          ))}
                        </datalist>
                      </label>
                      <label className="form-label company-profile-field company-profile-address-card-wide">
                        Country
                        <input className="text-input" list={`company-address-country-options-${address.clientId}`} value={address.country} onChange={(event) => updateAddress(address.clientId, { country: event.target.value })} autoComplete="country-name" />
                        <datalist id={`company-address-country-options-${address.clientId}`}>
                          {availableAddressCountryOptions.map((option) => (
                            <option key={option.value} value={option.value} />
                          ))}
                        </datalist>
                      </label>
                    </div>
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
                      <p className="muted">{`Image size: ${logoMeta.width} x ${logoMeta.height}px`}</p>
                      <p className="muted">{logoMeta.recommendation}</p>
                      {logoMeta.warning ? <HelperText>{logoMeta.warning}</HelperText> : null}
                    </>
                  ) : (
                    <p className="muted">Recommended size: a wide logo around 600 x 200 pixels.</p>
                  )}
                </div>
              </div>
              <div className="company-profile-logo-controls">
                <label className="form-label">
                  Logo file
                  <input
                    className="text-input"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
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
                  <span className="muted">
                    {logoFile
                      ? `Selected: ${logoFile.name}`
                      : logoRemoved
                        ? "Current logo will be removed when you save."
                        : `Current: ${activeCompany?.hasLogo ? "Logo uploaded" : "No logo uploaded"} | PNG, JPG, JPEG, or WEBP up to ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)}.`}
                  </span>
                </label>
                <HelperText>Choose a clear logo that is easy to read. Wide logos usually fit invoices better than tall ones.</HelperText>
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
                <p className="muted">Permanently deletes all company profiles, logos, contact data, address data, settings, metadata, and related cached company data for this account. This action cannot be undone.</p>
              </div>
              <div className="company-profile-danger-actions">
                <button type="button" className="button button-danger" onClick={() => setFactoryResetState({ step: "warning", confirmationText: "", error: "", isSubmitting: false })}>
                  Factory Reset
                </button>
              </div>
            </section>
          ) : null}
          {error ? <HelperText tone="error">{error}</HelperText> : null}
          <div className="subscription-create-actions">
            <button type="submit" className="button button-primary">{editingCompanyId ? "Update company" : "Create company"}</button>
            <button type="button" className="button button-secondary" onClick={() => navigate("/companies")}>Cancel</button>
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
                <p className="muted">This will permanently delete all company records, logos, contact information, address information, company settings, cached company data, and related metadata for this account.</p>
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
                <p className="muted">Final confirmation: the company reset will start immediately and remove all related billing profile data for this account.</p>
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
                      state: { flashMessage: "Factory reset complete. Company data has been cleared." },
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
