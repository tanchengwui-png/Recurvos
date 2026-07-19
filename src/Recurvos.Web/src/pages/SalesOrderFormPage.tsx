import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { resolveProductUnitPrice } from "../lib/productPricing";
import type { CompanyLookup, CurrencyDefinition, Customer, MasterDataSnapshot, PriceLevel, Product, SalesOrder, SalesQuotation, SalesQuotationListItem, TaxCode } from "../types";

type LineForm = { productId: string; taxCodeId: string; description: string; quantity: number; unitPrice: number; taxRate: number };
const emptyLine: LineForm = { productId: "", taxCodeId: "", description: "", quantity: 1, unitPrice: 0, taxRate: 0 };

export function SalesOrderFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const quotationId = searchParams.get("quotationId") ?? "";
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [contacts, setContacts] = useState<Customer[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyDefinition[]>([]);
  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotations, setQuotations] = useState<SalesQuotationListItem[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<SalesQuotation | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [documentDateUtc, setDocumentDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [salesQuotationId, setSalesQuotationId] = useState("");
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }]);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    async function load() {
      const [companyList, contactList, snapshot, productResult, quotationList, order, quotation] = await Promise.all([
        api.get<CompanyLookup[]>("/companies"),
        api.get<Customer[]>("/customers"),
        api.get<MasterDataSnapshot>("/master-data"),
        api.get<{ items: Product[] }>(`/products?page=1&pageSize=100`),
        api.get<SalesQuotationListItem[]>("/sales/quotations"),
        id ? api.get<SalesOrder>(`/sales/orders/${id}`) : Promise.resolve(null),
        !id && quotationId ? api.get<SalesQuotation>(`/sales/quotations/${quotationId}`) : Promise.resolve(null),
      ]);
      const activeCurrencies = snapshot.currencies.filter((item) => item.isActive);
      const activePriceLevels = snapshot.priceLevels.filter((item) => item.isActive);
      const activeTaxCodes = snapshot.taxCodes.filter((item) => item.isActive && (item.scope === "Sales" || item.scope === "Both"));
      setCompanies(companyList);
      setContacts(contactList);
      setCurrencies(activeCurrencies);
      setPriceLevels(activePriceLevels);
      setTaxCodes(activeTaxCodes);
      setProducts(productResult.items);
      setQuotations(quotationList);
      if (order) {
        setCompanyId(order.companyId);
        setContactId(order.contactId);
        setDocumentDateUtc(order.documentDateUtc.slice(0, 10));
        setCurrency(order.currency);
        setReferenceNo(order.referenceNo);
        setNotes(order.notes);
        setSalesQuotationId(order.salesQuotationId ?? "");
        setLines(order.lines.map((line) => ({ productId: line.productId ?? "", taxCodeId: line.taxCodeId ?? "", description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate })));
        if (order.salesQuotationId) {
          const linkedQuotation = await api.get<SalesQuotation>(`/sales/quotations/${order.salesQuotationId}`);
          setSelectedQuotation(linkedQuotation);
        }
      } else if (quotation) {
        applyQuotationToForm(quotation);
      } else {
        setCompanyId(companyList[0]?.id ?? "");
        setContactId(contactList[0]?.id ?? "");
        setCurrency(activeCurrencies[0]?.code ?? "");
      }
    }
    void load();
  }, [id, quotationId]);

  function applyQuotationToForm(quotation: SalesQuotation) {
    setSelectedQuotation(quotation);
    setCompanyId(quotation.companyId);
    setContactId(quotation.contactId);
    setCurrency(quotation.currency);
    setReferenceNo(quotation.referenceNo);
    setNotes(quotation.notes);
    setSalesQuotationId(quotation.id);
    setLines(quotation.lines.map((line) => ({ productId: line.productId ?? "", taxCodeId: line.taxCodeId ?? "", description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate })));
  }

  async function handleQuotationChange(nextQuotationId: string) {
    setSalesQuotationId(nextQuotationId);
    setSelectedQuotation(null);
    if (!nextQuotationId) {
      return;
    }

    const quotation = await api.get<SalesQuotation>(`/sales/quotations/${nextQuotationId}`);
    applyQuotationToForm(quotation);
  }

  const filteredProducts = products.filter((item) => item.companyId === companyId);
  const selectedContact = contacts.find((item) => item.id === contactId);
  const selectedPriceLevel = priceLevels.find((item) =>
    selectedContact?.priceLevel
      && item.code.toUpperCase() === selectedContact.priceLevel.trim().toUpperCase());
  const quotationOptions = quotations.filter((item) =>
    (item.status === "Sent" || item.status === "Accepted" || item.id === salesQuotationId)
    && !item.convertedSalesOrderId
    && (!companyId || item.companyId === companyId || item.id === salesQuotationId));
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

    const resolved = resolveProductUnitPrice({
      product,
      contact: selectedContact,
      quantity: 1,
      effectiveDate: documentDateUtc,
      mode: "sales",
    });
    if (resolved != null) {
      return resolved;
    }

    const baseAmount = product.defaultPlan?.unitAmount;
    if (baseAmount == null) {
      return undefined;
    }

    return selectedPriceLevel
      ? Number((baseAmount * (1 + (selectedPriceLevel.adjustmentPercent / 100))).toFixed(2))
      : baseAmount;
  }

  async function submit() {
    if (lines.some((line) => !line.taxCodeId)) {
      setError("Select a tax code for each line.");
      return;
    }

    setConfirmState({
      title: id ? "Update sales order" : "Create sales order",
      description: id ? "Save changes to this sales order?" : "Create this sales order?",
      action: async () => {
        try {
          setError("");
          const payload = {
            companyId,
            contactId,
            documentDateUtc: new Date(`${documentDateUtc}T00:00:00Z`).toISOString(),
            currency,
            referenceNo,
            notes,
            salesQuotationId: salesQuotationId || null,
            lines: lines.map((line) => ({ productId: line.productId || null, taxCodeId: line.taxCodeId || null, description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxRate: Number(line.taxRate) })),
          };
          if (id) await api.put(`/sales/orders/${id}`, payload);
          else await api.post(`/sales/orders`, payload);
          navigate("/sales/orders");
        } catch (submitError) {
          throw new Error(submitError instanceof Error ? submitError.message : "Unable to save sales order.");
        }
      },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy"><h2>{id ? "Edit Sales Order" : "Create Sales Order"}</h2></div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/sales/orders")}>Back to sales orders</button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
        <div className="master-data-form-grid master-data-form-grid-wide">
          <label className="form-label">Company<select value={companyId} onChange={(event) => setCompanyId(event.target.value)} disabled={!id && Boolean(salesQuotationId)}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-label">Contact<select value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!id && Boolean(salesQuotationId)}>{contacts.map((item) => <option key={item.id} value={item.id}>{item.legalName || item.name}</option>)}</select></label>
          <label className="form-label">Document Date<input type="date" className="text-input" value={documentDateUtc} onChange={(event) => setDocumentDateUtc(event.target.value)} /></label>
          <label className="form-label">
            Currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="">Select currency</option>
              {currencies.map((item) => <option key={item.id} value={item.code}>{`${item.code} · ${item.name}`}</option>)}
            </select>
          </label>
          {id ? (
            <label className="form-label">Source Quotation<input className="text-input" value={selectedQuotation ? `${selectedQuotation.quotationNumber} | ${selectedQuotation.contactName}` : salesQuotationId} readOnly placeholder="No linked quotation" /></label>
          ) : (
            <label className="form-label">
              Source Quotation
              <select value={salesQuotationId} onChange={(event) => { void handleQuotationChange(event.target.value); }}>
                <option value="">No source quotation</option>
                {quotationOptions.map((item) => <option key={item.id} value={item.id}>{`${item.quotationNumber} | ${item.contactName} | ${item.status}`}</option>)}
              </select>
            </label>
          )}
          <label className="form-label">Reference<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label>
          <label className="form-label master-data-form-wide">Notes<input className="text-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        {!id ? <HelperText>Choose a source quotation to preload the customer, currency, notes, and lines. Draft manual sales orders can still be created without one.</HelperText> : null}
        <HelperText>
          {selectedPriceLevel
            ? `Price level default: ${selectedPriceLevel.code} (${selectedPriceLevel.adjustmentPercent}%). Product selection will suggest adjusted unit prices.`
            : "No customer price level default is set. Product selection will use the product default price when available."}
        </HelperText>
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
                    const suggestedUnitPrice = getSuggestedUnitPrice(event.target.value);
                    updateLine(index, {
                      productId: event.target.value,
                      description: line.description || product?.name || "",
                      unitPrice: suggestedUnitPrice ?? line.unitPrice,
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
          <button type="button" className="button button-secondary" onClick={() => navigate("/sales/orders")}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void submit()}>{id ? "Update sales order" : "Create sales order"}</button>
        </div>
      </section>
      <ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
