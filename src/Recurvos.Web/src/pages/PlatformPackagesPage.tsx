import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { getPackageDisplayName, packageFeatureDefinitions } from "../lib/packages";
import type { PlatformPackage } from "../types";

const emptyForm = {
  id: "",
  name: "",
  priceLabel: "",
  description: "",
  amount: 29,
  currency: "MYR",
  intervalUnit: "Month",
  intervalCount: 1,
  gracePeriodDays: 7,
  maxCompanies: 1,
  maxProducts: 6,
  maxPlans: 0,
  maxCustomers: 50,
  maxWhatsAppRemindersPerMonth: 0,
  isActive: true,
  displayOrder: 1,
  features: [] as string[],
};

export function PlatformPackagesPage() {
  const [packages, setPackages] = useState<PlatformPackage[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPackages();
  }, []);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === form.id) ?? null,
    [packages, form.id]);

  async function loadPackages() {
    const response = await api.get<PlatformPackage[]>("/platform/packages");
    setPackages(response);
    if (!form.id && response.length > 0) {
      selectPackage(response[0]);
    }
  }

  function selectPackage(item: PlatformPackage) {
    setError("");
    setMessage("");
    setForm({
      id: item.id,
      name: item.name,
      priceLabel: item.priceLabel,
      description: item.description,
      amount: item.amount,
      currency: item.currency,
      intervalUnit: item.intervalUnit,
      intervalCount: item.intervalCount,
      gracePeriodDays: item.gracePeriodDays,
      maxCompanies: item.maxCompanies,
      maxProducts: item.maxProducts,
      maxPlans: item.maxPlans,
      maxCustomers: item.maxCustomers,
      maxWhatsAppRemindersPerMonth: item.maxWhatsAppRemindersPerMonth,
      isActive: item.isActive,
      displayOrder: item.displayOrder,
      features: item.features.map((feature) => feature.text),
    });
  }

  function toggleFeature(value: string) {
    setForm((current) => ({
      ...current,
      features: current.features.includes(value)
        ? current.features.filter((item) => item !== value)
        : [...current.features, value],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const updated = await api.put<PlatformPackage>(`/platform/packages/${form.id}`, {
        name: form.name,
        priceLabel: form.priceLabel,
        description: form.description,
        amount: form.amount,
        currency: form.currency,
        intervalUnit: form.intervalUnit,
        intervalCount: form.intervalCount,
        gracePeriodDays: form.gracePeriodDays,
        maxCompanies: form.maxCompanies,
        maxProducts: form.maxProducts,
        maxPlans: form.maxPlans,
        maxCustomers: form.maxCustomers,
        maxWhatsAppRemindersPerMonth: form.maxWhatsAppRemindersPerMonth,
        isActive: form.isActive,
        displayOrder: form.displayOrder,
        features: form.features,
        trustPoints: [],
      });

      setPackages((current) => current.map((item) => item.id === updated.id ? updated : item));
      selectPackage(updated);
      setMessage(`Updated ${updated.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save package.");
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Platform billing</p>
          <h2>Packages</h2>
          <p className="muted">Manage pricing, limits, and the actual capabilities each package unlocks for subscribers.</p>
        </div>
      </header>

      <div className="packages-layout">
        <section className="card packages-rail">
          <div className="stack">
            <div>
              <p className="eyebrow">Package list</p>
              <h3 className="section-title">Published plans</h3>
            </div>
            {packages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`dashboard-list-item package-list-item ${form.id === item.id ? "is-selected" : ""}`}
                onClick={() => selectPackage(item)}
              >
                <div>
                  <strong>{getPackageDisplayName(item.code, item.name)}</strong>
                  <p className="muted">{item.priceLabel}</p>
                </div>
                <span className={`status-pill ${item.isActive ? "status-pill-active" : "status-pill-inactive"}`}>
                  {item.isActive ? "Active" : "Hidden"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="card packages-editor">
          {selectedPackage ? (
            <form className="form-stack" onSubmit={submit}>
              <div className="packages-editor-header">
                <div>
                  <p className="eyebrow">Edit package</p>
                  <h3 className="section-title">{getPackageDisplayName(selectedPackage.code, selectedPackage.name)}</h3>
                </div>
                <span className={`status-pill ${form.isActive ? "status-pill-active" : "status-pill-inactive"}`}>
                  {form.isActive ? "Visible on pricing" : "Hidden from pricing"}
                </span>
              </div>

              <div className="package-editor-section">
                <p className="pricing-section-title">Commercial setup</p>
                <div className="packages-meta-grid packages-meta-grid-compact">
                  <label className="form-label">
                    Package name
                    <input className="text-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                  </label>

                  <label className="form-label">
                    Price label
                    <input className="text-input" value={form.priceLabel} onChange={(event) => setForm((current) => ({ ...current, priceLabel: event.target.value }))} />
                  </label>

                  <label className="form-label">
                    Amount
                    <input
                      className="text-input"
                      type="number"
                      min="1"
                      step="0.01"
                      value={form.amount}
                      onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) || 0 }))}
                    />
                  </label>

                  <label className="form-label">
                    Currency
                    <select value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}>
                      <option value="MYR">MYR</option>
                      <option value="USD">USD</option>
                      <option value="SGD">SGD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </label>

                  <label className="form-label">
                    Billing interval
                    <select value={form.intervalUnit} onChange={(event) => setForm((current) => ({ ...current, intervalUnit: event.target.value }))}>
                      <option value="Month">Month</option>
                      <option value="Quarter">Quarter</option>
                      <option value="Year">Year</option>
                    </select>
                  </label>

                  <label className="form-label">
                    Interval count
                    <input
                      className="text-input"
                      type="number"
                      min="1"
                      value={form.intervalCount}
                      onChange={(event) => setForm((current) => ({ ...current, intervalCount: Number(event.target.value) || 1 }))}
                    />
                  </label>
                </div>
              </div>

              <div className="package-editor-section">
                <p className="pricing-section-title">Limits and billing rules</p>
                <div className="packages-meta-grid packages-meta-grid-compact">
                  <label className="form-label">
                    Grace period days
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      value={form.gracePeriodDays}
                      onChange={(event) => setForm((current) => ({ ...current, gracePeriodDays: Number(event.target.value) || 0 }))}
                    />
                  </label>

                  <label className="form-label">
                    Billing profiles max
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      value={form.maxCompanies}
                      onChange={(event) => setForm((current) => ({ ...current, maxCompanies: Math.max(0, Number(event.target.value) || 0) }))}
                    />
                  </label>

                  <label className="form-label">
                    Products max
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      value={form.maxProducts}
                      onChange={(event) => setForm((current) => ({ ...current, maxProducts: Math.max(0, Number(event.target.value) || 0) }))}
                    />
                  </label>

                  <label className="form-label">
                    Plans max
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      value={form.maxPlans}
                      onChange={(event) => setForm((current) => ({ ...current, maxPlans: Math.max(0, Number(event.target.value) || 0) }))}
                    />
                  </label>

                  <label className="form-label">
                    Customers max
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      value={form.maxCustomers}
                      onChange={(event) => setForm((current) => ({ ...current, maxCustomers: Math.max(0, Number(event.target.value) || 0) }))}
                    />
                  </label>

                  <label className="form-label">
                    WhatsApp reminders / month
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      value={form.maxWhatsAppRemindersPerMonth}
                      onChange={(event) => setForm((current) => ({ ...current, maxWhatsAppRemindersPerMonth: Number(event.target.value) || 0 }))}
                    />
                  </label>
                </div>
              </div>

              <div className="package-editor-section">
                <p className="pricing-section-title">Publishing</p>
                <div className="packages-meta-grid packages-meta-grid-compact">
                  <label className="form-label">
                    Display order
                    <input
                      className="text-input"
                      type="number"
                      min="1"
                      value={form.displayOrder}
                      onChange={(event) => setForm((current) => ({ ...current, displayOrder: Number(event.target.value) || 1 }))}
                    />
                  </label>

                  <label className="checkbox-row package-visibility-row">
                    <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
                    Show this package on pricing
                  </label>
                </div>
              </div>

              <div className="package-editor-section">
                <p className="pricing-section-title">Package capabilities</p>
                <p className="muted">Turn on the capabilities this package should unlock. These are runtime entitlements, not public marketing sentences.</p>
                {(["Core billing", "Notifications", "Payments", "Finance"] as const).map((category) => {
                  const categoryItems = packageFeatureDefinitions.filter((item) => item.category === category);
                  return (
                    <div key={category} className="package-capability-group">
                      <div>
                        <p className="eyebrow">{category}</p>
                      </div>
                      <div className="package-capability-list">
                        {categoryItems.map((feature) => (
                          <label key={feature.value} className="checkbox-row package-option package-capability-option">
                            <input type="checkbox" checked={form.features.includes(feature.value)} onChange={() => toggleFeature(feature.value)} />
                            <span>
                              <strong>{feature.label}</strong>
                              <small className="muted">{feature.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {message ? <p className="helper-text">{message}</p> : null}
              {error ? <p className="helper-text helper-text-error">{error}</p> : null}

              <button type="submit" className="button button-primary">Save package</button>
            </form>
          ) : (
            <p className="muted">No packages found.</p>
          )}
        </section>
      </div>
    </div>
  );
}
