import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { FormActionSection } from "../components/ui/FormActionSection";
import { FormPageBody } from "../components/ui/FormPageBody";
import { FormSection } from "../components/ui/FormSection";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { StandardFormLayout } from "../components/ui/StandardFormLayout";
import { api } from "../lib/api";
import { countryOptions, malaysiaStateOptions } from "../lib/localeOptions";
import { isMalaysiaCountry, parseWarehouseAddress, serializeWarehouseAddress, type WarehouseAddress } from "../lib/warehouseAddress";
import type { MasterDataSnapshot } from "../types";
import { foundationModules, type FoundationField, type FoundationModuleConfig, type FoundationRecord } from "./foundationModules";

type MyInvoisTaxType = { code: string; description: string };
type PriceAdjustmentType = "none" | "decrease" | "increase";

function getPriceAdjustmentType(value: unknown): PriceAdjustmentType {
  const adjustment = Number(value ?? 0);
  if (!Number.isFinite(adjustment) || adjustment === 0) return "none";
  return adjustment < 0 ? "decrease" : "increase";
}

function normalizeRecord(record: FoundationRecord, fields: FoundationField[]) {
  const nextValues: Record<string, unknown> = {};

  fields.forEach((field) => {
    const value = record[field.key];
    if (field.type === "checkbox") {
      nextValues[field.key] = Boolean(value);
      return;
    }

    if (field.type === "number") {
      nextValues[field.key] = typeof value === "number" ? value : Number(value ?? 0);
      return;
    }

    nextValues[field.key] = value ?? "";
  });

  return nextValues;
}

function buildPayload(values: Record<string, unknown>, fields: FoundationField[]) {
  const payload: Record<string, unknown> = {};

  fields.forEach((field) => {
    const value = values[field.key];

    if (field.type === "checkbox") {
      payload[field.key] = Boolean(value);
      return;
    }

    if (field.type === "number") {
      payload[field.key] = Number(value ?? 0);
      return;
    }

    payload[field.key] = typeof value === "string" ? value : String(value ?? "");
  });

  return payload;
}

function validateValues(values: Record<string, unknown>, fields: FoundationField[]) {
  for (const field of fields) {
    const value = values[field.key];

    if (!field.required) {
      continue;
    }

    if (field.type === "checkbox") {
      continue;
    }

    if (field.type === "number") {
      const numericValue = Number(value ?? 0);
      if (Number.isNaN(numericValue)) {
        return `${field.label} must be a number.`;
      }

      if (field.min !== undefined && numericValue < field.min) {
        return `${field.label} must be ${field.min} or more.`;
      }

      continue;
    }

    if (!String(value ?? "").trim()) {
      return `${field.label} is required.`;
    }
  }

  return "";
}

function getDetailsTitle(moduleKey: string, singularLabel: string) {
  const titles: Record<string, string> = {
    "chart-of-accounts": "Account details",
    "tax-codes": "Tax code details",
    "payment-terms": "Payment term details",
    warehouses: "Warehouse details",
    currencies: "Currency details",
    "product-categories": "Category details",
    "price-levels": "Price level details",
  };

  return titles[moduleKey] ?? `${singularLabel} details`;
}

function getFieldGroupTitle(moduleKey: string, fieldKey: string) {
  const groupStarts: Record<string, Record<string, string>> = {
    "tax-codes": { scope: "Usage" },
    warehouses: { addressJson: "Address" },
    "price-levels": { adjustmentPercent: "Pricing rules" },
  };

  return groupStarts[moduleKey]?.[fieldKey];
}

export function FoundationModuleFormPage({ moduleKey }: { moduleKey: string }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const module = useMemo(() => foundationModules.find((item) => item.key === moduleKey) as FoundationModuleConfig | undefined, [moduleKey]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dynamicFields, setDynamicFields] = useState<FoundationField[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(id));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warehouseAddressExtras, setWarehouseAddressExtras] = useState<Record<string, unknown>>({});
  const [priceAdjustmentType, setPriceAdjustmentType] = useState<PriceAdjustmentType>("none");

  useEffect(() => {
    if (!module) {
      return;
    }

    const moduleConfig = module;
    const isWarehouse = moduleConfig.key === "warehouses";
    setValues({
      ...moduleConfig.defaultValues,
      ...(isWarehouse ? parseWarehouseAddress(moduleConfig.defaultValues.addressJson as string).address : {}),
    });
    setWarehouseAddressExtras({});
    setPriceAdjustmentType(isWarehouse ? "none" : getPriceAdjustmentType(moduleConfig.defaultValues.adjustmentPercent));
    setDynamicFields(moduleConfig.fields);

    async function loadDynamicFieldState() {
      try {
        if (moduleConfig.key === "tax-codes") {
          const taxTypes = await api.get<MyInvoisTaxType[]>("/master-data/myinvois-tax-types");
          setDynamicFields(moduleConfig.fields.map((field) =>
            field.key === "myInvoisTaxTypeCode"
              ? { ...field, type: "select", placeholder: "Select MyInvois tax type", options: taxTypes.map((taxType) => ({ value: taxType.code, label: `${taxType.code} — ${taxType.description}` })) }
              : field));
          return;
        }

        if (moduleConfig.key !== "chart-of-accounts") {
          return;
        }

        const snapshot = await api.get<MasterDataSnapshot>("/master-data");
        const currencyOptions = snapshot.currencies
          .filter((currency) => currency.isActive)
          .sort((left, right) => left.code.localeCompare(right.code))
          .map((currency) => ({ label: `${currency.code} · ${currency.name}`, value: currency.code }));

        setDynamicFields(moduleConfig.fields.map((field) =>
          field.key === "currencyCode"
            ? { ...field, type: "select", placeholder: "Select currency", options: currencyOptions }
            : field));
      } catch {
        setDynamicFields(moduleConfig.fields.map((field) =>
          moduleConfig.key === "tax-codes" && field.key === "myInvoisTaxTypeCode"
            ? { ...field, type: "select", placeholder: "Select MyInvois tax type", options: [] }
            : field));
      }
    }

    void loadDynamicFieldState();

    if (!id) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const result = await api.get<FoundationRecord>(`${moduleConfig.apiPath}/${id}`);
        const normalizedRecord = normalizeRecord(result, moduleConfig.fields);
        if (moduleConfig.key === "warehouses") {
          const parsedAddress = parseWarehouseAddress(String(normalizedRecord.addressJson ?? ""));
          setWarehouseAddressExtras(parsedAddress.extraProperties);
          setValues({ ...normalizedRecord, ...parsedAddress.address });
        } else {
          setValues(normalizedRecord);
        }
        if (moduleConfig.key === "price-levels") {
          setPriceAdjustmentType(getPriceAdjustmentType(normalizedRecord.adjustmentPercent));
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : `Unable to load ${moduleConfig.singularLabel}.`);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id, module]);

  if (!module) {
    return <div className="page"><section className="card"><p className="muted">Foundation module not found.</p></section></div>;
  }

  const moduleConfig = module;
  const formFields = (dynamicFields.length > 0 ? dynamicFields : moduleConfig.fields).map((field) => {
    const value = String(values[field.key] ?? "");
    const isLegacyMyInvoisTaxType = moduleConfig.key === "tax-codes"
      && field.key === "myInvoisTaxTypeCode"
      && value
      && !field.options?.some((option) => option.value === value);

    return isLegacyMyInvoisTaxType
      ? { ...field, options: [...(field.options ?? []), { value, label: `Legacy value: ${value}` }] }
      : field;
  });
  const actionTitle = `${id ? "Edit" : "Create"} ${moduleConfig.singularLabel}`;
  const helperText = id
    ? `Update the ${moduleConfig.singularLabel} details.`
    : `Add a new ${moduleConfig.singularLabel} to the current workspace.`;
  const isWarehouse = moduleConfig.key === "warehouses";
  const isPriceLevel = moduleConfig.key === "price-levels";
  const priceAdjustmentMagnitude = Math.abs(Number(values.adjustmentPercent ?? 0)) || 0;
  const warehouseAddress: WarehouseAddress = {
    addressLine1: String(values.addressLine1 ?? ""),
    addressLine2: String(values.addressLine2 ?? ""),
    city: String(values.city ?? ""),
    state: String(values.state ?? ""),
    postcode: String(values.postcode ?? ""),
    country: String(values.country ?? "Malaysia"),
  };
  const warehouseCountryOptions = !warehouseAddress.country || countryOptions.some((option) => option.value === warehouseAddress.country)
    ? countryOptions
    : [{ value: warehouseAddress.country, label: `Legacy country: ${warehouseAddress.country}` }, ...countryOptions];
  const warehouseUsesMalaysiaState = isMalaysiaCountry(warehouseAddress.country);

  async function submit() {
    try {
      setError("");
      const validationError = validateValues(values, formFields);
      if (validationError) {
        setError(validationError);
        return;
      }

      if (isPriceLevel && priceAdjustmentType === "decrease" && priceAdjustmentMagnitude > 100) {
        setError("Decrease cannot exceed 100%.");
        return;
      }

      if (isPriceLevel && priceAdjustmentType === "increase" && priceAdjustmentMagnitude > 1000) {
        setError("Increase cannot exceed 1000%.");
        return;
      }

      const payloadValues = isWarehouse
        ? { ...values, addressJson: serializeWarehouseAddress(warehouseAddress, warehouseAddressExtras) }
        : values;
      const payload = buildPayload(payloadValues, formFields);
      const result = id
        ? await api.put<FoundationRecord>(`${moduleConfig.apiPath}/${id}`, payload)
        : await api.post<FoundationRecord>(moduleConfig.apiPath, payload);
      if (moduleConfig.key === "chart-of-accounts") {
        window.dispatchEvent(new Event("recurvos:accounts-changed"));
      }
      navigate(`${moduleConfig.path}/${result.id}`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : `Unable to save ${moduleConfig.singularLabel}.`;
      setError(isWarehouse && /warehouse address|json/i.test(message) ? "Unable to save the warehouse address. Please review the address details and try again." : message);
      throw submitError;
    }
  }

  return (
    <StandardFormLayout className="page standard-form-page foundation-form-page">
      <FormPageHeader backLabel={`Back to ${moduleConfig.label}`} backHref={moduleConfig.path} breadcrumbs={<><span>{moduleConfig.label}</span><span>/</span><span>{actionTitle}</span></>} />
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {loading ? (
        <section className="card"><p className="muted">Loading {moduleConfig.singularLabel}...</p></section>
      ) : (
        <FormPageBody>
        <div className="form-page-content">
        <FormSection
          title={getDetailsTitle(moduleConfig.key, moduleConfig.singularLabel)}
          description={helperText}
          className="foundation-form-card"
        >
          <div className="foundation-form-grid">
            {formFields.filter((field) => !(isWarehouse && field.key === "addressJson")).map((field) => {
              const groupTitle = getFieldGroupTitle(moduleConfig.key, field.key);
              const displayLabel = field.label.replace(/\s*%$/, "");

              if (isPriceLevel && field.key === "adjustmentPercent") {
                const updateAdjustmentType = (nextType: PriceAdjustmentType) => {
                  setPriceAdjustmentType(nextType);
                  setValues((current) => ({
                    ...current,
                    adjustmentPercent: nextType === "none" ? 0 : (nextType === "decrease" ? -priceAdjustmentMagnitude : priceAdjustmentMagnitude),
                  }));
                };

                return (
                  <Fragment key={field.key}>
                    <h4 className="foundation-form-subheading">Pricing rules</h4>
                    <div className="foundation-form-field">
                      <label className="form-label">Adjustment type
                        <select value={priceAdjustmentType} onChange={(event) => updateAdjustmentType(event.target.value as PriceAdjustmentType)}>
                          <option value="none">No adjustment</option>
                          <option value="decrease">Decrease by</option>
                          <option value="increase">Increase by</option>
                        </select>
                      </label>
                    </div>
                    <div className="foundation-form-field">
                      <label className="form-label">Percentage
                        <span className="foundation-input-with-suffix">
                          <input
                            type="number"
                            className="text-input"
                            min="0"
                            max={priceAdjustmentType === "decrease" ? 100 : 1000}
                            step="0.01"
                            disabled={priceAdjustmentType === "none"}
                            value={priceAdjustmentMagnitude}
                            onChange={(event) => {
                              const magnitude = Math.abs(Number(event.target.value) || 0);
                              setValues((current) => ({ ...current, adjustmentPercent: priceAdjustmentType === "decrease" ? -magnitude : magnitude }));
                            }}
                          />
                          <span aria-hidden="true">%</span>
                        </span>
                      </label>
                    </div>
                  </Fragment>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <div key={field.key} className="foundation-checkbox-field">
                    {groupTitle ? <h4 className="foundation-form-subheading">{groupTitle}</h4> : null}
                    <label className="master-data-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(values[field.key])}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))}
                      />
                      <span>{field.key === "isActive" ? "Status: Active" : field.label}</span>
                    </label>
                  </div>
                );
              }

              if (field.type === "textarea") {
                return (
                  <div key={field.key} className="foundation-form-field foundation-form-field-wide">
                    {groupTitle ? <h4 className="foundation-form-subheading">{groupTitle}</h4> : null}
                    <label className="form-label">
                      {displayLabel}
                      <textarea
                        className="text-input"
                        required={field.required}
                        value={String(values[field.key] ?? "")}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                        placeholder={field.placeholder}
                      />
                    </label>
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.key} className="foundation-form-field">
                    {groupTitle ? <h4 className="foundation-form-subheading">{groupTitle}</h4> : null}
                    <label className="form-label">
                      {displayLabel}
                      <select
                        required={field.required}
                        value={String(values[field.key] ?? "")}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      >
                        {field.placeholder ? <option value="">{field.placeholder}</option> : null}
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                );
              }

              return (
                <div key={field.key} className="foundation-form-field">
                  {groupTitle ? <h4 className="foundation-form-subheading">{groupTitle}</h4> : null}
                  <label className="form-label">
                    {displayLabel}
                    <span className={field.label.endsWith("%") ? "foundation-input-with-suffix" : undefined}>
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        className="text-input"
                        required={field.required}
                        value={String(values[field.key] ?? "")}
                        min={field.min}
                        step={field.step}
                        placeholder={field.placeholder}
                        onChange={(event) => setValues((current) => ({
                          ...current,
                          [field.key]: field.type === "number" ? event.target.value : event.target.value,
                        }))}
                      />
                      {field.label.endsWith("%") ? <span aria-hidden="true">%</span> : null}
                    </span>
                  </label>
                </div>
              );
            })}
            {isWarehouse ? <>
              <h4 className="foundation-form-subheading">Address</h4>
              <div className="foundation-form-field foundation-form-field-wide">
                <label className="form-label">Address line 1<input className="text-input" autoComplete="address-line1" value={warehouseAddress.addressLine1} onChange={(event) => setValues((current) => ({ ...current, addressLine1: event.target.value }))} /></label>
              </div>
              <div className="foundation-form-field foundation-form-field-wide">
                <label className="form-label">Address line 2<input className="text-input" autoComplete="address-line2" value={warehouseAddress.addressLine2} onChange={(event) => setValues((current) => ({ ...current, addressLine2: event.target.value }))} /></label>
              </div>
              <div className="foundation-form-field">
                <label className="form-label">City<input className="text-input" autoComplete="address-level2" value={warehouseAddress.city} onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))} /></label>
              </div>
              <div className="foundation-form-field">
                <label className="form-label">{warehouseUsesMalaysiaState ? "State" : "State / Province"}
                  {warehouseUsesMalaysiaState ? (
                    <select value={warehouseAddress.state} onChange={(event) => setValues((current) => ({ ...current, state: event.target.value }))} autoComplete="address-level1">
                      <option value="">Select state</option>
                      {malaysiaStateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : <input className="text-input" autoComplete="address-level1" value={warehouseAddress.state} onChange={(event) => setValues((current) => ({ ...current, state: event.target.value }))} />}
                </label>
              </div>
              <div className="foundation-form-field">
                <label className="form-label">Postcode<input className="text-input" autoComplete="postal-code" value={warehouseAddress.postcode} onChange={(event) => setValues((current) => ({ ...current, postcode: event.target.value }))} /></label>
              </div>
              <div className="foundation-form-field">
                <label className="form-label">Country
                  <SearchableSelect
                    value={warehouseAddress.country}
                    onChange={(country) => setValues((current) => ({ ...current, country, state: current.country === country ? current.state : "" }))}
                    options={warehouseCountryOptions}
                    placeholder="Select country"
                    searchPlaceholder="Search countries"
                    ariaLabel="Warehouse country"
                    clearable
                    portalPopover
                  />
                </label>
              </div>
            </> : null}
          </div>
        </FormSection>
        </div>
        <FormActionSection>
          <p>{id ? "Review your changes before updating." : "Complete the required fields before creating this record."}</p>
          <div>
            <button type="button" className="button button-secondary" onClick={() => navigate(moduleConfig.path)}>Cancel</button>
            <button type="button" className="button button-primary" onClick={() => setConfirmOpen(true)}>
              {id ? "Save changes" : `Create ${moduleConfig.singularLabel}`}
            </button>
          </div>
        </FormActionSection>
        </FormPageBody>
      )}
      <ConfirmModal
        open={confirmOpen}
        title={id ? `Update ${moduleConfig.singularLabel}` : `Create ${moduleConfig.singularLabel}`}
        description={id ? `Save changes to this ${moduleConfig.singularLabel}?` : `Create this ${moduleConfig.singularLabel}?`}
        confirmLabel="Confirm"
        onConfirm={async () => {
          try {
            await submit();
          } finally {
            setConfirmOpen(false);
          }
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </StandardFormLayout>
  );
}
