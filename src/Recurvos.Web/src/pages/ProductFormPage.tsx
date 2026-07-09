import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { api } from "../lib/api";
import { normalizeProductCode } from "../utils/products";
import type { CompanyLookup, ProductDetails } from "../types";

type ProductFormState = {
  id?: string;
  companyId: string;
  name: string;
  code: string;
  description: string;
  category: string;
  isSubscriptionProduct: boolean;
  isActive: boolean;
};

const emptyForm: ProductFormState = {
  companyId: "",
  name: "",
  code: "",
  description: "",
  category: "",
  isSubscriptionProduct: true,
  isActive: true,
};

export function ProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    async function load() {
      const [companyList, product] = await Promise.all([
        api.get<CompanyLookup[]>("/companies"),
        id ? api.get<ProductDetails>(`/products/${id}`) : Promise.resolve(null),
      ]);

      setCompanies(companyList);
      if (!id) {
        setForm((current) => ({ ...current, companyId: current.companyId || companyList[0]?.id || "" }));
        return;
      }

      if (!product) {
        setFormError("Product not found.");
        return;
      }

      setForm({
        id: product.id,
        companyId: product.companyId,
        name: product.name,
        code: product.code,
        description: product.description || "",
        category: product.category || "",
        isSubscriptionProduct: product.isSubscriptionProduct,
        isActive: product.isActive,
      });
    }

    void load();
  }, [id]);

  async function submit() {
    setFormError("");
    const payload = {
      name: form.name.trim(),
      companyId: form.companyId,
      code: normalizeProductCode(form.code),
      description: form.description || null,
      category: form.category || null,
      isSubscriptionProduct: form.isSubscriptionProduct,
      isActive: form.isActive,
    };

    setConfirmState({
      title: form.id ? "Update product" : "Create product",
      description: form.id
        ? `Save changes to ${form.name || "this product"}?`
        : `Create ${form.name || "this product"} for the selected company?`,
      action: async () => {
        setIsSubmitting(true);
        try {
          if (form.id) {
            await api.put(`/products/${form.id}`, payload);
          } else {
            await api.post("/products", payload);
          }

          navigate("/products", {
            replace: true,
            state: { flashMessage: form.id ? `Product updated: ${payload.name || "Product"}.` : `Product created: ${payload.name || "Product"}.` },
          });
        } catch (error) {
          const nextError = error instanceof Error ? error.message : "Unable to save product.";
          setFormError(nextError);
          throw new Error(nextError);
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{form.id ? "Update catalog item" : "Create catalog item"}</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/products")}>Back to products</button>
      </header>
      <section className="card subscription-create-page-card">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <FormLabel htmlFor="product-company">Company<select id="product-company" value={form.companyId} onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></FormLabel>
          <FormLabel htmlFor="product-name">Name<TextInput id="product-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></FormLabel>
          <FormLabel htmlFor="product-code">Code<TextInput id="product-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: normalizeProductCode(event.target.value) }))} /></FormLabel>
          <FormLabel htmlFor="product-description">Description<TextInput id="product-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></FormLabel>
          <FormLabel htmlFor="product-category">Category<TextInput id="product-category" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></FormLabel>
          <label className="checkbox-row"><input type="checkbox" checked={form.isSubscriptionProduct} onChange={(event) => setForm((current) => ({ ...current, isSubscriptionProduct: event.target.checked }))} /> Subscription product</label>
          <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
          {formError ? <HelperText tone="error">{formError}</HelperText> : <HelperText>Use an uppercase code like STARTER or GROWTH-PLAN.</HelperText>}
          <div className="subscription-create-actions">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : form.id ? "Update Product" : "Create Product"}</Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/products")}>Cancel</Button>
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
