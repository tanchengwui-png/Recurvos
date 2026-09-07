import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelperText } from "../components/ui/HelperText";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { QuickCreateProductModal } from "../components/QuickCreateProductModal";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import { getActiveCompanyId, getAuth } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import type { Customer, Invoice, MasterDataSnapshot, Product } from "../types";

type Line = {
  productId: string;
  description: string;
  quantity: string;
  unitAmount: string;
  taxCodeId: string;
};

const emptyLine = (): Line => ({
  productId: "",
  description: "",
  quantity: "1",
  unitAmount: "0",
  taxCodeId: "",
});

export function ManualInvoiceFormPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [snapshot, setSnapshot] = useState<MasterDataSnapshot | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [dueDateUtc, setDueDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [quickCreate, setQuickCreate] = useState<{ index: number; name: string } | null>(null);

  useEffect(() => {
    const companyId = getActiveCompanyId() ?? undefined;

    void Promise.all([
      api.get<Customer[]>("/customers"),
      fetchProducts({ search: "", companyId, isActive: "active", page: 1, pageSize: 1000 }),
      api.get<MasterDataSnapshot>("/master-data").catch(() => null),
    ])
      .then(([customerList, productResult, masterData]) => {
        setCustomers(customerList.filter((customer) => !companyId || customer.companyId === companyId));
        setProducts(productResult.items.filter((product) => (
          product.isActive
          && product.isSelling
          && (!companyId || product.companyId === companyId)
        )));
        setSnapshot(masterData);
      })
      .catch(() => setError("Unable to load invoice form data."));
  }, []);

  const totals = useMemo(() => lines.reduce((sum, line) => {
    const taxRate = snapshot?.taxCodes.find((taxCode) => taxCode.id === line.taxCodeId)?.rate ?? 0;
    const subtotal = Number(line.quantity || 0) * Number(line.unitAmount || 0);
    return {
      subtotal: sum.subtotal + subtotal,
      tax: sum.tax + (subtotal * taxRate / 100),
    };
  }, { subtotal: 0, tax: 0 }), [lines, snapshot]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, ...patch } : line
    )));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updateLine(index, {
      productId,
      description: product?.name ?? "",
      unitAmount: product?.salesPrice?.toString() ?? "0",
    });
  }

  function openQuickCreate(index: number, name: string) {
    setQuickCreate({ index, name });
  }

  async function submit() {
    const validLines = lines.filter((line) => line.description.trim() && Number(line.quantity) > 0);
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    if (!validLines.length) {
      setError("Add at least one invoice item.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await api.post<Invoice>("/invoices", {
        customerId,
        dueDateUtc: new Date(`${dueDateUtc}T00:00:00Z`).toISOString(),
        lineItems: validLines.map((line) => ({
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unitAmount: Number(line.unitAmount),
          taxCodeId: line.taxCodeId || null,
        })),
      });
      navigate("/invoices", { state: { createdInvoiceId: result.id } });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <FormPageHeader
        backLabel="Back to Invoices"
        backHref="/invoices"
        breadcrumbs={<><span>Invoices</span><span>/</span><span>Create invoice</span></>}
      />
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <TransactionFormCard
        title="Invoice details"
        description="Customer, due date and invoice items."
      >
        <section className="card">
          <div className="master-data-form-grid master-data-form-grid-wide">
            <label className="form-label">
              Customer
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.legalName || customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Due date
              <input
                className="text-input"
                type="date"
                value={dueDateUtc}
                onChange={(event) => setDueDateUtc(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-section-header">
            <div className="section-header-cluster"><h3 className="section-title">Invoice Items</h3></div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              Add item
            </button>
          </div>
          <div className="table-scroll table-scroll-bounded">
            <table className="catalog-table">
              <thead>
                <tr><th>Product</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax Code</th><th>Total</th><th /></tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const taxRate = snapshot?.taxCodes.find((taxCode) => taxCode.id === line.taxCodeId)?.rate ?? 0;
                  const total = Number(line.quantity || 0) * Number(line.unitAmount || 0) * (1 + taxRate / 100);
                  return (
                    <tr key={index}>
                      <td>
                        <SearchableSelect
                          value={line.productId}
                          onChange={(productId) => selectProduct(index, productId)}
                          options={products.map((product) => ({ value: product.id, label: product.name, keywords: [product.code] }))}
                          placeholder="Search products..."
                          searchPlaceholder="Search products..."
                          emptyText="No products found."
                          ariaLabel="Product"
                          portalPopover
                          onCreate={getAuth()?.role === "Owner" || getAuth()?.role === "Admin" ? (name) => openQuickCreate(index, name) : undefined}
                          createLabel="Add new product"
                          persistentCreateAction
                        />
                      </td>
                      <td><input className="text-input" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                      <td><input className="text-input" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                      <td><input className="text-input" type="number" min="0" step="0.01" value={line.unitAmount} onChange={(event) => updateLine(index, { unitAmount: event.target.value })} /></td>
                      <td>
                        <select value={line.taxCodeId} onChange={(event) => updateLine(index, { taxCodeId: event.target.value })}>
                          <option value="">Select tax code</option>
                          {snapshot?.taxCodes.map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{`${taxCode.code} · ${taxCode.rate}%`}</option>)}
                        </select>
                      </td>
                      <td>{formatCurrency(total, "MYR")}</td>
                      <td><button type="button" className="button button-secondary button-compact" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="page-meta-row page-meta-row-inline">
            <div className="page-meta-chips">
              <span className="page-meta-chip"><span className="page-meta-chip-label">Subtotal</span><strong className="page-meta-chip-value">{formatCurrency(totals.subtotal, "MYR")}</strong></span>
              <span className="page-meta-chip"><span className="page-meta-chip-label">Tax</span><strong className="page-meta-chip-value">{formatCurrency(totals.tax, "MYR")}</strong></span>
              <span className="page-meta-chip"><span className="page-meta-chip-label">Total</span><strong className="page-meta-chip-value">{formatCurrency(totals.subtotal + totals.tax, "MYR")}</strong></span>
            </div>
          </div>
        </section>

        <div className="contact-page-actions form-footer-create">
          <button type="button" className="button button-secondary" onClick={() => navigate("/invoices")}>Cancel</button>
          <button type="button" className="button button-primary" disabled={saving} onClick={() => void submit()}>{saving ? "Creating..." : "Create invoice"}</button>
        </div>
      </TransactionFormCard>
      {quickCreate ? <QuickCreateProductModal companyId={getActiveCompanyId() ?? ""} mode="sales" name={quickCreate.name} snapshot={snapshot} onClose={() => setQuickCreate(null)} onCreated={(created) => {
        const product = created as unknown as Product;
        setProducts((current) => [...current, product].sort((left, right) => left.name.localeCompare(right.name)));
        updateLine(quickCreate.index, { productId: created.id, description: created.salesDescription || created.description || created.name, unitAmount: created.salesPrice?.toString() ?? "0", taxCodeId: created.salesTaxCodeId ?? "" });
        setQuickCreate(null);
      }} /> : null}
    </div>
  );
}
