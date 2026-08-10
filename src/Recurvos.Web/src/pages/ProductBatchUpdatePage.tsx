import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { FormActionSection } from "../components/ui/FormActionSection";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { FormSection } from "../components/ui/FormSection";
import { StandardFormLayout } from "../components/ui/StandardFormLayout";
import { api } from "../lib/api";
import { fetchProducts } from "../hooks/useProducts";
import type { Product } from "../types";

const fields = [
  ["Name", "Name", "text"], ["Code", "Code", "text"], ["Description", "Description", "text"], ["Barcode", "Barcode", "text"], ["Category", "Category", "text"], ["ProductGroups", "Product Groups", "groups"], ["BinLocation", "Bin Location", "text"], ["TrackInventory", "Track Inventory", "boolean"], ["ReorderLevel", "Reorder Level", "number"], ["OpeningQuantity", "Opening Quantity", "number"], ["OpeningCost", "Opening Cost", "number"], ["IsSelling", "Selling", "boolean"], ["SalesPrice", "Sales Price", "number"], ["SalesDescription", "Sales Description", "text"], ["IsBuying", "Buying", "boolean"], ["PurchasePrice", "Purchase Price", "number"], ["PurchaseDescription", "Purchase Description", "text"], ["BaseUnitLabel", "Base Unit", "text"], ["IsSubscriptionProduct", "Subscription Product", "boolean"], ["IsActive", "Status", "boolean"],
] as const;

export function ProductBatchUpdatePage() {
  const navigate = useNavigate(); const [products, setProducts] = useState<Product[]>([]); const [selected, setSelected] = useState<string[]>([]); const [selectedFields, setSelectedFields] = useState<string[]>([]); const [values, setValues] = useState<Record<string, string>>({ IsActive: "true", IsSelling: "true", IsBuying: "false", TrackInventory: "false", IsSubscriptionProduct: "false", BaseUnitLabel: "Unit" }); const [groupsMode, setGroupsMode] = useState("Replace"); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { void fetchProducts({ search: "", isActive: "all", page: 1, pageSize: 10000 }).then((result) => setProducts(result.items)).catch(() => setMessage("Unable to load products.")); }, []);
  const selectedSet = new Set(selected);
  const toggleField = (key: string) => setSelectedFields((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  async function submit() { setSaving(true); setMessage(""); try { const getNumber = (key: string) => values[key] === "" || values[key] === undefined ? null : Number(values[key]); const getBool = (key: string) => values[key] === "true"; const result = await api.post<{ successCount: number; failureCount: number }>("/products/batch-update", { productIds: selected, fields: selectedFields, productGroupsMode: groupsMode, values: { name: values.Name ?? "", code: values.Code ?? "", description: values.Description ?? "", barcode: values.Barcode ?? "", category: values.Category ?? "", productGroups: (values.ProductGroups ?? "").split(/[;,]/).map((value) => value.trim()).filter(Boolean), binLocation: values.BinLocation ?? "", trackInventory: getBool("TrackInventory"), reorderLevel: getNumber("ReorderLevel"), openingQuantity: getNumber("OpeningQuantity"), openingCost: getNumber("OpeningCost"), isSelling: getBool("IsSelling"), salesPrice: getNumber("SalesPrice"), salesDescription: values.SalesDescription ?? "", isBuying: getBool("IsBuying"), purchasePrice: getNumber("PurchasePrice"), purchaseDescription: values.PurchaseDescription ?? "", baseUnitLabel: values.BaseUnitLabel ?? "Unit", isSubscriptionProduct: getBool("IsSubscriptionProduct"), isActive: getBool("IsActive") } }); setMessage(`${result.successCount} product${result.successCount === 1 ? "" : "s"} updated${result.failureCount ? `; ${result.failureCount} skipped.` : "."}`); } catch (error) { setMessage(error instanceof Error ? error.message : "Batch update failed."); } finally { setSaving(false); } }

  return (
    <div className="page product-batch-update-page">
      <header className="page-header product-batch-update-title">
        <div className="page-header-copy">
          <p className="eyebrow">Products</p>
          <h2>Batch update products</h2>
          <p className="muted">Select products and update the fields and values.</p>
        </div>
      </header>

      <FormPageHeader backLabel="Back to products" backHref="/products" breadcrumbs={<><span>Products</span><span>/</span><span>Batch update products</span></>} />

      <StandardFormLayout className="standard-form-page product-batch-update-layout">
        <div className="product-batch-update-form">
          <FormSection
            number="01"
            title="Select products"
            description="Choose the products you want to update."
            actions={<span className="product-batch-selected-count" aria-live="polite">{selected.length} selected</span>}
          >
            <div className="product-batch-select-all">
              <label className="contact-select-control">
                <input type="checkbox" checked={selected.length === products.length && products.length > 0} onChange={(event) => setSelected(event.target.checked ? products.map((product) => product.id) : [])} />
                Select all
              </label>
            </div>

            {products.length > 0 ? (
              <div className="product-batch-table-container">
                <div className="table-scroll table-scroll-bounded">
                  <table className="catalog-table">
                    <thead><tr><th aria-label="Select product" /><th>Product</th><th>Code</th><th>Company</th></tr></thead>
                    <tbody>{products.map((product) => <tr key={product.id}><td><label className="product-batch-row-select"><input type="checkbox" checked={selectedSet.has(product.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))} /><span className="sr-only">Select {product.name}</span></label></td><td>{product.name}</td><td>{product.code}</td><td>{product.companyName}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="product-batch-empty-state" role={message ? "alert" : "status"}>
                <strong>{message || "No products available"}</strong>
                <p>{message ? "Check your connection and try again." : "Create products before using batch update."}</p>
              </div>
            )}
          </FormSection>

          <FormSection
            number="02"
            title="Choose fields and values"
            description="Select the fields you want to update and specify their new values."
          >
            <div className="product-batch-field-grid">
              {fields.map(([key, label, kind]) => (
                <label key={key} className={`product-batch-field ${selectedFields.includes(key) ? "product-batch-field-selected" : ""}`}>
                  <span className="product-batch-field-toggle"><input type="checkbox" checked={selectedFields.includes(key)} onChange={() => toggleField(key)} /><span>{label}</span></span>
                  {selectedFields.includes(key) ? kind === "boolean" ? <select value={values[key] ?? "false"} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="true">Yes / Active</option><option value="false">No / Inactive</option></select> : <input type={kind === "number" ? "number" : "text"} value={values[key] ?? ""} placeholder={kind === "groups" ? "Separate groups with ;" : `New ${label}`} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /> : null}
                  {key === "ProductGroups" && selectedFields.includes(key) ? <select value={groupsMode} onChange={(event) => setGroupsMode(event.target.value)}><option>Replace</option><option>Append</option><option>Remove</option></select> : null}
                </label>
              ))}
            </div>
            <p className="product-batch-helper-text">Only the selected fields will be updated. Leave fields unselected to keep their current values.</p>
          </FormSection>

          <FormActionSection className="product-batch-update-actions">
            <p aria-live="polite">{selected.length} products selected</p>
            <div>
              <button type="button" className="button button-secondary" onClick={() => navigate("/products")}>Cancel</button>
              <button type="button" className="button button-primary" disabled={!selected.length || !selectedFields.length || saving} onClick={() => void submit()}>{saving ? "Updating..." : `Update ${selected.length} Product${selected.length === 1 ? "" : "s"}`}</button>
            </div>
          </FormActionSection>
          {message && products.length > 0 ? <HelperText>{message}</HelperText> : null}
        </div>
      </StandardFormLayout>
    </div>
  );
}
