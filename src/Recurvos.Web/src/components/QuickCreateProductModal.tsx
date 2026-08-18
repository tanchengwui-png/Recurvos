import { useState } from "react";
import { api } from "../lib/api";
import { normalizeProductCode } from "../utils/products";
import type { MasterDataSnapshot, ProductDetails } from "../types";

type ProductMode = "sales" | "purchase";

type QuickCreateProductModalProps = {
  companyId: string;
  mode: ProductMode;
  name: string;
  snapshot: MasterDataSnapshot | null;
  onClose: () => void;
  onCreated: (product: ProductDetails) => void;
};

export function QuickCreateProductModal({ companyId, mode, name, snapshot, onClose, onCreated }: QuickCreateProductModalProps) {
  const [productName, setProductName] = useState(name);
  const [price, setPrice] = useState("0");
  const [taxCodeId, setTaxCodeId] = useState("");
  const [uom, setUom] = useState("Unit");
  const [accountId, setAccountId] = useState(() => snapshot?.accounts.find((account) => account.isActive && account.type === (mode === "sales" ? "Revenue" : "Expense"))?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isSales = mode === "sales";
  const accounts = snapshot?.accounts.filter((account) => account.isActive && account.type === (isSales ? "Revenue" : "Expense")) ?? [];
  const taxCodes = snapshot?.taxCodes.filter((taxCode) => taxCode.isActive && (taxCode.scope === (isSales ? "Sales" : "Purchase") || taxCode.scope === "Both")) ?? [];

  async function save() {
    const account = accounts.find((item) => item.id === accountId);
    if (!companyId || !account) {
      setError(`Select an ${isSales ? "income" : "expense"} account before adding the product.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const trimmedName = productName.trim();
      const product = await api.post<ProductDetails>("/products", {
        companyId,
        name: trimmedName,
        code: normalizeProductCode(trimmedName),
        description: trimmedName,
        productGroups: [],
        trackInventory: false,
        inventoryAccount: "",
        isSelling: isSales,
        salesPrice: isSales ? Number(price || 0) : null,
        salesTaxCodeId: isSales ? taxCodeId || null : null,
        salesTaxCode: "",
        incomeAccountId: isSales ? account.id : null,
        incomeAccount: isSales ? account.code : "",
        isBuying: !isSales,
        purchasePrice: isSales ? null : Number(price || 0),
        purchaseTaxCodeId: isSales ? null : taxCodeId || null,
        purchaseTaxCode: "",
        expenseAccountId: isSales ? null : account.id,
        expenseAccount: isSales ? "" : account.code,
        baseUnitLabel: uom.trim() || "Unit",
        hasMultipleUoms: false,
        uomConversions: [],
        hasCustomSalesPrices: false,
        customSalesPrices: [],
        hasCustomPurchasePrices: false,
        customPurchasePrices: [],
        isSubscriptionProduct: false,
        isActive: true,
      });
      onCreated(product);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to add product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="quick-product-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="quick-product-title">Add product</h3>
        {error ? <p className="form-error">{error}</p> : null}
        <label className="form-label">Product name<input className="text-input" value={productName} onChange={(event) => setProductName(event.target.value)} /></label>
        <label className="form-label">{isSales ? "Sales price" : "Purchase price"}<input className="text-input" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label className="form-label">Tax code<select value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)}><option value="">No tax</option>{taxCodes.map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{`${taxCode.code} · ${taxCode.rate}%`}</option>)}</select></label>
        <label className="form-label">UOM<input className="text-input" value={uom} onChange={(event) => setUom(event.target.value)} /></label>
        <label className="form-label">{isSales ? "Income" : "Expense"} account<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{`${account.code} · ${account.name}`}</option>)}</select></label>
        <div className="modal-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={saving || !productName.trim()} onClick={() => void save()}>{saving ? "Adding..." : "Add product"}</button></div>
      </div>
    </div>
  );
}
