import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { CurrencySelect } from "../components/ui/CurrencySelect";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { api } from "../lib/api";
import { normaliseCurrencyCode, validateCurrency } from "../lib/currency";
import { formatCurrency } from "../lib/format";
import { resolveProductUnitPrice } from "../lib/productPricing";
import type { CompanyLookup, CurrencyDefinition, Customer, MasterDataSnapshot, Product, PurchaseOrder, TaxCode } from "../types";

type LineForm = { productId: string; taxCodeId: string; description: string; quantity: number; unitPrice: number; taxRate: number };
const emptyLine: LineForm = { productId: "", taxCodeId: "", description: "", quantity: 1, unitPrice: 0, taxRate: 0 };

function parseContactTypes(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [contacts, setContacts] = useState<Customer[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyDefinition[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [documentDateUtc, setDocumentDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("");
  const [currencyError, setCurrencyError] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    async function load() {
      const [companyList, contactList, snapshot, productResult, order] = await Promise.all([
        api.get<CompanyLookup[]>("/companies"),
        api.get<Customer[]>("/customers"),
        api.get<MasterDataSnapshot>("/master-data"),
        api.get<{ items: Product[] }>(`/products?page=1&pageSize=100`),
        id ? api.get<PurchaseOrder>(`/purchases/orders/${id}`) : Promise.resolve(null),
      ]);
      const supplierContacts = contactList.filter((item) => parseContactTypes(item.contactType).includes("Supplier"));
      const activeCurrencies = snapshot.currencies.filter((item) => item.isActive);
      const activeTaxCodes = snapshot.taxCodes.filter((item) => item.isActive && (item.scope === "Purchase" || item.scope === "Both"));
      setCompanies(companyList);
      setContacts(supplierContacts);
      setCurrencies(activeCurrencies);
      setTaxCodes(activeTaxCodes);
      setProducts(productResult.items);
      if (order) {
        setCompanyId(order.companyId);
        setContactId(order.contactId);
        setDocumentDateUtc(order.documentDateUtc.slice(0, 10));
        setCurrency(order.currency);
        setReferenceNo(order.referenceNo);
        setNotes(order.notes);
        setLines(order.lines.map((line) => ({ productId: line.productId ?? "", taxCodeId: line.taxCodeId ?? "", description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate })));
      } else {
        setCompanyId(companyList[0]?.id ?? "");
        setContactId(supplierContacts[0]?.id ?? "");
        setCurrency(activeCurrencies[0]?.code ?? "");
      }
    }
    void load();
  }, [id]);

  const filteredProducts = products.filter((item) => item.companyId === companyId && item.isBuying);
  const companyContacts = contacts.filter((item) => item.companyIds.length === 0 || item.companyIds.includes(companyId));
  const subtotal = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
  const tax = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice * (line.taxRate / 100)), 0);
  const total = subtotal + tax;

  function updateLine(index: number, next: Partial<LineForm>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...next } : line));
  }

  function getSuggestedUnitPrice(productId: string) {
    const product = filteredProducts.find((item) => item.id === productId);
    if (!product) {
      return undefined;
    }

    return resolveProductUnitPrice({
      product,
      contact: contacts.find((item) => item.id === contactId),
      quantity: 1,
      effectiveDate: documentDateUtc,
      mode: "purchase",
    });
  }

  async function submit() {
    const nextCurrencyError = validateCurrency(currency, currencies);
    if (nextCurrencyError) { setCurrencyError(nextCurrencyError); document.getElementById("purchase-order-currency")?.focus(); return; }
    if (lines.some((line) => !line.taxCodeId)) {
      setError("Select a tax code for each line.");
      return;
    }

    setConfirmState({
      title: id ? "Update purchase order" : "Create purchase order",
      description: id ? "Save changes to this purchase order?" : "Create this purchase order?",
      action: async () => {
        try {
          setError("");
          const payload = {
            companyId,
            contactId,
            documentDateUtc: new Date(`${documentDateUtc}T00:00:00Z`).toISOString(),
            currency: normaliseCurrencyCode(currency),
            referenceNo,
            notes,
            lines: lines.map((line) => ({ productId: line.productId || null, taxCodeId: line.taxCodeId || null, description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxRate: Number(line.taxRate) })),
          };
          if (id) await api.put(`/purchases/orders/${id}`, payload);
          else await api.post(`/purchases/orders`, payload);
          navigate("/purchases/orders");
        } catch (submitError) {
          throw new Error(submitError instanceof Error ? submitError.message : "Unable to save purchase order.");
        }
      },
    });
  }

  return (
    <div className="page">
      <FormPageHeader backLabel="Back to Purchase Orders" backHref="/purchases/orders" breadcrumbs={<><span>Purchase Orders</span><span>/</span><span>{id ? "Edit Purchase Order" : "New Purchase Order"}</span></>} />
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <TransactionFormCard title="Purchase order details" description="Supplier, dates, currency, reference and line items.">
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">Company<select value={companyId} onChange={(event) => { const nextCompanyId = event.target.value; setCompanyId(nextCompanyId); setContactId(contacts.find((contact) => contact.companyIds.length === 0 || contact.companyIds.includes(nextCompanyId))?.id ?? ""); }}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-label">Supplier<select value={contactId} onChange={(event) => setContactId(event.target.value)}>{companyContacts.map((item) => <option key={item.id} value={item.id}>{item.legalName || item.name}</option>)}</select></label>
          <label className="form-label">Document Date<input type="date" className="text-input" value={documentDateUtc} onChange={(event) => setDocumentDateUtc(event.target.value)} /></label>
          <label className="form-label">
            Currency
            <CurrencySelect id="purchase-order-currency" value={currency} currencies={currencies} error={currencyError} onChange={(value) => { setCurrency(value); setCurrencyError(""); }} />
          </label>
          <label className="form-label">Reference<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label>
          <label className="form-label master-data-form-wide">Notes<input className="text-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
      </section>
      <section className="card">
        <div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Lines</h3></div><button type="button" className="button button-secondary" onClick={() => setLines((current) => [...current, { ...emptyLine }])}>Add line</button></div>
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead><tr><th>Product</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax Code</th><th>Total</th><th /></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td><select value={line.productId} onChange={(event) => {
                    const product = filteredProducts.find((item) => item.id === event.target.value);
                    updateLine(index, {
                      productId: event.target.value,
                      description: line.description || product?.name || "",
                      unitPrice: getSuggestedUnitPrice(event.target.value) ?? line.unitPrice,
                    });
                  }}><option value="">Manual</option>{filteredProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>
                  <td><input className="text-input" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></td>
                  <td><input type="number" min="0.01" step="0.01" className="text-input" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td>
                  <td><input type="number" min="0" step="0.01" className="text-input" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })} /></td>
                  <td>
                    <select value={line.taxCodeId} onChange={(event) => {
                      const selectedTaxCode = taxCodes.find((item) => item.id === event.target.value);
                      updateLine(index, { taxCodeId: event.target.value, taxRate: selectedTaxCode?.rate ?? line.taxRate });
                    }}>
                      <option value="">Select tax code</option>
                      {taxCodes.map((item) => <option key={item.id} value={item.id}>{`${item.code} · ${item.rate}%`}</option>)}
                    </select>
                  </td>
                  <td>{formatCurrency((line.quantity * line.unitPrice) * (1 + line.taxRate / 100), currency)}</td>
                  <td><button type="button" className="button button-secondary button-compact" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="page-meta-row page-meta-row-inline">
          <div className="page-meta-chips">
            <span className="page-meta-chip"><span className="page-meta-chip-label">Subtotal</span><strong className="page-meta-chip-value">{formatCurrency(subtotal, currency)}</strong></span>
            <span className="page-meta-chip"><span className="page-meta-chip-label">Tax</span><strong className="page-meta-chip-value">{formatCurrency(tax, currency)}</strong></span>
            <span className="page-meta-chip"><span className="page-meta-chip-label">Total</span><strong className="page-meta-chip-value">{formatCurrency(total, currency)}</strong></span>
          </div>
        </div>
        <div className="contact-page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate("/purchases/orders")}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void submit()}>{id ? "Update purchase order" : "Create purchase order"}</button>
        </div>
      </section>
      </TransactionFormCard>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
