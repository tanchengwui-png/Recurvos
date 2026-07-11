import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { MasterDataSnapshot } from "../types";
import { foundationModules, type FoundationField, type FoundationModuleConfig, type FoundationRecord } from "./foundationModules";

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

export function FoundationModuleFormPage({ moduleKey }: { moduleKey: string }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const module = useMemo(() => foundationModules.find((item) => item.key === moduleKey) as FoundationModuleConfig | undefined, [moduleKey]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dynamicFields, setDynamicFields] = useState<FoundationField[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(id));
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!module) {
      return;
    }

    const moduleConfig = module;
    setValues(moduleConfig.defaultValues);
    setDynamicFields(moduleConfig.fields);

    async function loadDynamicFieldState() {
      if (moduleConfig.key !== "chart-of-accounts") {
        return;
      }

      try {
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
        setDynamicFields(moduleConfig.fields);
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
        setValues(normalizeRecord(result, moduleConfig.fields));
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
  const formFields = dynamicFields.length > 0 ? dynamicFields : moduleConfig.fields;

  async function submit() {
    try {
      setError("");
      const validationError = validateValues(values, formFields);
      if (validationError) {
        setError(validationError);
        return;
      }

      const payload = buildPayload(values, formFields);
      const result = id
        ? await api.put<FoundationRecord>(`${moduleConfig.apiPath}/${id}`, payload)
        : await api.post<FoundationRecord>(moduleConfig.apiPath, payload);
      navigate(`${moduleConfig.path}/${result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `Unable to save ${moduleConfig.singularLabel}.`);
      throw submitError;
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{id ? `Edit ${moduleConfig.label}` : `Create ${moduleConfig.label}`}</h2>
          <p className="page-subtitle">{moduleConfig.description}</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate(moduleConfig.path)}>
          Back to {moduleConfig.label.toLowerCase()}
        </button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {loading ? (
        <section className="card"><p className="muted">Loading {moduleConfig.singularLabel}...</p></section>
      ) : (
        <section className="card">
          <div className="master-data-form-grid master-data-form-grid-wide">
            {formFields.map((field) => {
              if (field.type === "checkbox") {
                return (
                  <label key={field.key} className="master-data-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.key])}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))}
                    />
                    <span>{field.label}</span>
                  </label>
                );
              }

              if (field.type === "textarea") {
                return (
                  <label key={field.key} className="form-label master-data-form-wide">
                    {field.label}
                    <textarea
                      className="text-input"
                      required={field.required}
                      value={String(values[field.key] ?? "")}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                    />
                  </label>
                );
              }

              if (field.type === "select") {
                return (
                  <label key={field.key} className="form-label">
                    {field.label}
                    <select
                      required={field.required}
                      value={String(values[field.key] ?? "")}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    >
                      {field.placeholder ? <option value="">{field.placeholder}</option> : null}
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                );
              }

              return (
                <label key={field.key} className="form-label">
                  {field.label}
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
                </label>
              );
            })}
          </div>
          <div className="contact-page-actions">
            <button type="button" className="button button-secondary" onClick={() => navigate(moduleConfig.path)}>Cancel</button>
            <button type="button" className="button button-primary" onClick={() => setConfirmOpen(true)}>
              {id ? `Update ${moduleConfig.singularLabel}` : `Create ${moduleConfig.singularLabel}`}
            </button>
          </div>
        </section>
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
    </div>
  );
}
