import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useClientPagination } from "../hooks/useClientPagination";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { Customer, FeatureAccess, PlatformPackage } from "../types";

export function CustomersPage() {
  const navigate = useNavigate();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Customer[]>([]);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const pagination = useClientPagination(items, [items.length]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    externalReference: "",
    billingAddress: "",
  });

  async function load() {
    const [customerList, access, packages] = await Promise.all([
      api.get<Customer[]>("/customers"),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<PlatformPackage[]>("/public/packages").catch(() => []),
    ]);
    setItems(customerList);
    setFeatureAccess(access);
    const activePackage = packages.find((item) => item.code === access?.packageCode);
    setPackageLimit(activePackage?.maxCustomers ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  const customersWithEmail = items.filter((item) => item.email).length;
  const customersWithAddress = items.filter((item) => item.billingAddress).length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  function resetForm() {
    setEditingCustomerId(null);
    setForm({
      name: "",
      email: "",
      phoneNumber: "",
      externalReference: "",
      billingAddress: "",
    });
  }

  function startEdit(customer: Customer) {
    setEditingCustomerId(customer.id);
    setError("");
    setForm({
      name: customer.name,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      externalReference: customer.externalReference,
      billingAddress: customer.billingAddress,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget as HTMLFormElement;
    const submittedData = new FormData(formElement);
    const payload = {
      name: String(submittedData.get("name") ?? "").trim(),
      email: String(submittedData.get("email") ?? "").trim(),
      phoneNumber: String(submittedData.get("phoneNumber") ?? "").trim(),
      externalReference: String(submittedData.get("externalReference") ?? "").trim(),
      billingAddress: String(submittedData.get("billingAddress") ?? "").trim(),
    };
    setForm(payload);

    setConfirmState({
      title: editingCustomerId ? "Update customer" : "Create customer",
      description: editingCustomerId
        ? `Update ${payload.name || "this customer"}?`
        : `Create ${payload.name || "this customer"}?`,
      action: async () => {
        try {
          if (editingCustomerId) {
            await api.put(`/customers/${editingCustomerId}`, payload);
          } else {
            await api.post("/customers", payload);
          }
          resetForm();
          setConfirmState(null);
          await load();
        } catch (submitError) {
          setConfirmState(null);
          setError(submitError instanceof Error ? submitError.message : "Unable to save customer.");
        }
      },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Customer records</p>
          <h2>Customers</h2>
          <p className="muted">Manage the people and businesses you invoice, subscribe, and follow up for payment.</p>
          <p className="muted">
            Customers used: {items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}
          </p>
        </div>
      </header>
      <section className="management-summary-grid">
        <article className="management-summary-card">
          <p className="eyebrow">Usage</p>
          <h3>{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</h3>
          <p className="muted">Customer records currently used under this subscriber account.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">With email</p>
          <h3>{customersWithEmail}</h3>
          <p className="muted">Useful for invoice delivery, payment links, and reminder emails.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Bill to ready</p>
          <h3>{customersWithAddress}</h3>
          <p className="muted">Records with billing address already available for the invoice Bill To section.</p>
        </article>
      </section>
      <div className="grid-two">
        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Customer list</p>
              <h3 className="section-title">Saved customers</h3>
              <p className="muted">Keep customer details clean so invoices, subscriptions, and reminders reach the right person.</p>
            </div>
          </div>
          <div ref={topScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
            <div ref={topInnerRef} />
          </div>
          <div
            ref={(node) => {
              tableScrollRef.current = node;
              contentScrollRef.current = node;
            }}
            className="table-scroll table-scroll-bounded table-scroll-draggable"
          >
            <table className="catalog-table customer-table">
              <thead>
                <tr>
                  <th className="sticky-cell sticky-cell-left">Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pagedItems.map((item) => (
                  <tr key={item.id}>
                    <td className="sticky-cell sticky-cell-left table-primary-cell">
                      <div className="table-primary-cell-inner">
                        <span>{item.name}</span>
                        <RowActionMenu items={[{ label: "Edit customer", onClick: () => startEdit(item) }]} />
                      </div>
                    </td>
                    <td>{item.email}</td>
                    <td>{item.phoneNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 ? (
              <div className="empty-state">
                <h3>No customers yet</h3>
                <p className="muted">Add the people or businesses you bill so they can receive subscriptions, invoices, and payment links.</p>
                {featureAccess?.packageCode ? (
                  <p className="muted">
                    Package limit: {packageLimitLabel} customers on {featureAccess.packageCode}.
                  </p>
                ) : null}
                <div className="empty-state-actions">
                  <button type="submit" className="button button-primary" form="customer-create-form">Add first customer</button>
                  <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
          <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
        </section>
        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">{editingCustomerId ? "Edit customer" : "Add new"}</p>
              <h3 className="section-title">{editingCustomerId ? "Update customer profile" : "Create customer profile"}</h3>
              <p className="muted form-intro">Use the details your customer should see on invoices and reminders.</p>
            </div>
          </div>
          <form id="customer-create-form" className="form-stack" onSubmit={submit}>
            <label className="form-label">
              Name
              <input
                className="text-input"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="form-label">
              Email
              <input
                className="text-input"
                name="email"
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className="form-label">
              Phone
              <input
                className="text-input"
                name="phoneNumber"
                autoComplete="tel"
                value={form.phoneNumber}
                onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
              />
            </label>
            <label className="form-label">
              External reference
              <input
                className="text-input"
                name="externalReference"
                value={form.externalReference}
                onChange={(event) => setForm((current) => ({ ...current, externalReference: event.target.value }))}
              />
            </label>
            <label className="form-label">
              Billing address (optional)
              <input
                className="text-input"
                name="billingAddress"
                autoComplete="street-address"
                value={form.billingAddress}
                onChange={(event) => setForm((current) => ({ ...current, billingAddress: event.target.value }))}
              />
            </label>
            {error ? <HelperText tone="error">{error}</HelperText> : null}
            <div className="button-stack">
              <button type="submit" className="button button-primary">{editingCustomerId ? "Update customer" : "Save"}</button>
              {editingCustomerId ? (
                <button type="button" className="button button-secondary" onClick={resetForm}>Cancel</button>
              ) : null}
            </div>
          </form>
        </section>
      </div>
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
