import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { Customer } from "../types";

const emptyForm = {
  name: "",
  email: "",
  phoneNumber: "",
  externalReference: "",
  billingAddress: "",
};

export function CustomerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingCustomerId = id ?? null;
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    async function load() {
      if (!editingCustomerId) {
        return;
      }

      const customerList = await api.get<Customer[]>("/customers");
      const customer = customerList.find((item) => item.id === editingCustomerId);
      if (!customer) {
        setError("Customer not found.");
        return;
      }

      setForm({
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        externalReference: customer.externalReference,
        billingAddress: customer.billingAddress,
      });
    }

    void load();
  }, [editingCustomerId]);

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

          navigate("/customers", {
            replace: true,
            state: { flashMessage: editingCustomerId ? `Customer updated: ${payload.name || "Customer"}.` : `Customer created: ${payload.name || "Customer"}.` },
          });
        } catch (submitError) {
          const nextError = submitError instanceof Error ? submitError.message : "Unable to save customer.";
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
          <h2>{editingCustomerId ? "Update customer profile" : "Create customer profile"}</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/customers")}>Back to customers</button>
      </header>
      <section className="card subscription-create-page-card">
        <form id="customer-create-form" className="form-stack" onSubmit={submit}>
          <label className="form-label">
            Name
            <input className="text-input" name="name" autoComplete="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="form-label">
            Email
            <input className="text-input" name="email" autoComplete="email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="form-label">
            Phone
            <input className="text-input" name="phoneNumber" autoComplete="tel" value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} />
          </label>
          <label className="form-label">
            External reference
            <input className="text-input" name="externalReference" value={form.externalReference} onChange={(event) => setForm((current) => ({ ...current, externalReference: event.target.value }))} />
          </label>
          <label className="form-label">
            Billing address (optional)
            <input className="text-input" name="billingAddress" autoComplete="street-address" value={form.billingAddress} onChange={(event) => setForm((current) => ({ ...current, billingAddress: event.target.value }))} />
          </label>
          {error ? <HelperText tone="error">{error}</HelperText> : null}
          <div className="subscription-create-actions">
            <button type="submit" className="button button-primary">{editingCustomerId ? "Update customer" : "Save customer"}</button>
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
