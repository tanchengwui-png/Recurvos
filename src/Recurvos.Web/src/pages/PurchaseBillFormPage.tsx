import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { QuickCreateProductModal } from "../components/QuickCreateProductModal";
import { CurrencySelect } from "../components/ui/CurrencySelect";
import { FormPageHeader } from "../components/ui/FormPageHeader";
import { HelperText } from "../components/ui/HelperText";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { TransactionFormCard } from "../components/ui/TransactionFormCard";
import { api } from "../lib/api";
import { openCreatedRecord } from "../lib/postCreateNavigation";
import { getAuth, resolveActiveCompanyId } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, CurrencyDefinition, Customer, GoodsReceivedNote, GoodsReceivedNoteListItem, MasterDataSnapshot, PaymentTerm, Product, PurchaseBill, PurchaseOrder, PurchaseOrderListItem, TaxCode } from "../types";

type SourceType = "none" | "purchase-order" | "grn";
type LineForm = { id: string; productId: string; taxCodeId: string; description: string; quantity: number; unitPrice: number; taxRate: number; alreadyBilled?: number; remainingQuantity?: number };
const blankLine = (): LineForm => ({ id: crypto.randomUUID(), productId: "", taxCodeId: "", description: "", quantity: 1, unitPrice: 0, taxRate: 0 });
const isSupplier = (contact: Customer) => contact.status === "Active" && contact.contactType.split(",").some((type) => type.trim() === "Supplier");

export function PurchaseBillFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceParam = searchParams.get("source");
  const sourceIdParam = searchParams.get("sourceId") ?? "";
  const initialSource: SourceType = sourceParam === "grn" ? "grn" : sourceParam === "purchase-order" ? "purchase-order" : "none";
  const [source, setSource] = useState<SourceType>(initialSource);
  const [selectedSourceId, setSelectedSourceId] = useState(sourceIdParam);
  const [companyId, setCompanyId] = useState("");
  const [suppliers, setSuppliers] = useState<Customer[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyDefinition[]>([]);
  const [currency, setCurrency] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [snapshot, setSnapshot] = useState<MasterDataSnapshot | null>(null);
  const [purchaseOrderOptions, setPurchaseOrderOptions] = useState<PurchaseOrderListItem[]>([]);
  const [grnOptions, setGrnOptions] = useState<GoodsReceivedNoteListItem[]>([]);
  const [dueDateUtc, setDueDateUtc] = useState(new Date().toISOString().slice(0, 10));
  const [paymentTermId, setPaymentTermId] = useState("");
  const [manualDueDate, setManualDueDate] = useState(false);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([blankLine()]);
  const [quickCreate, setQuickCreate] = useState<{ index: number; name: string } | null>(null);
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const sourceMode = source !== "none";

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!sourceMode || !supplierId || paymentTerms.length === 0) return;
    const supplier = suppliers.find((item) => item.id === supplierId);
    const term = paymentTerms.find((item) => item.code.toUpperCase() === supplier?.paymentTerm.trim().toUpperCase());
    if (!term) return;
    setPaymentTermId(term.id);
    if (!manualDueDate) setDueDateUtc(addTermDays(term.days));
  }, [sourceMode, supplierId, suppliers, paymentTerms]);
  async function load() {
    const [companyList, contacts, snapshotData, productResult, orders, receivedNotes] = await Promise.all([
      api.get<CompanyLookup[]>("/companies"), api.get<Customer[]>("/customers"), api.get<MasterDataSnapshot>("/master-data"), api.get<{ items: Product[] }>("/products?page=1&pageSize=100"), api.get<PurchaseOrderListItem[]>("/purchases/orders"), api.get<GoodsReceivedNoteListItem[]>("/purchases/grns"),
    ]);
    const activeCompanyId = resolveActiveCompanyId(companyList);
    setCompanyId(activeCompanyId); setSuppliers(contacts.filter(isSupplier)); setSnapshot(snapshotData);
    setCurrencies(snapshotData.currencies.filter((item) => item.isActive)); setPaymentTerms(snapshotData.paymentTerms.filter((item) => item.isActive)); setTaxCodes(snapshotData.taxCodes.filter((item) => item.isActive && (item.scope === "Purchase" || item.scope === "Both"))); setProducts(productResult.items);
    setPurchaseOrderOptions(orders.filter((item) => item.status !== "Cancelled")); setGrnOptions(receivedNotes.filter((item) => item.status === "Received" || item.status === "PartiallyBilled"));
    setCurrency(snapshotData.currencies.find((item) => item.isActive)?.code ?? "");
    if (sourceIdParam) await loadSource(initialSource, sourceIdParam);
  }

  function applySupplierDefaults(nextSupplierId: string) {
    const supplier = suppliers.find((item) => item.id === nextSupplierId);
    if (!supplier) return;
    if (supplier.currency && currencies.some((item) => item.code.toUpperCase() === supplier.currency.toUpperCase())) setCurrency(supplier.currency);
    const term = paymentTerms.find((item) => item.code.toUpperCase() === supplier.paymentTerm.trim().toUpperCase());
    setPaymentTermId(term?.id ?? ""); setManualDueDate(false);
    if (term) setDueDateUtc(addTermDays(term.days));
  }
  const addTermDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
  function updateLine(index: number, next: Partial<LineForm>) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...next } : line)); }
  function selectProduct(index: number, productId: string) { const product = products.find((item) => item.id === productId) as (Product & { purchaseDescription?: string | null; purchaseTaxCodeId?: string | null }) | undefined; const taxCode = taxCodes.find((item) => item.id === product?.purchaseTaxCodeId); updateLine(index, { productId, description: product?.purchaseDescription || product?.name || "", unitPrice: product?.purchasePrice ?? 0, taxCodeId: product?.purchaseTaxCodeId ?? "", taxRate: taxCode?.rate ?? 0 }); }

  async function loadSource(nextSource: SourceType, id: string) {
    setSelectedSourceId(id);
    if (!id || nextSource === "none") return;
    if (nextSource === "grn") {
      const record = await api.get<GoodsReceivedNote>(`/purchases/grns/${id}`);
      setSupplierId(record.contactId); setCurrency(record.currency); setReferenceNo(record.referenceNo); setNotes(record.notes);
      setLines(record.lines.map((line) => ({ id: line.id, productId: line.productId ?? "", taxCodeId: line.taxCodeId ?? "", description: line.description, quantity: Math.max(0, line.quantity - line.billedQuantity), unitPrice: line.unitPrice, taxRate: line.taxRate, alreadyBilled: line.billedQuantity, remainingQuantity: Math.max(0, line.quantity - line.billedQuantity) })).filter((line) => line.remainingQuantity! > 0)); return;
    }
    const record = await api.get<PurchaseOrder>(`/purchases/orders/${id}`); setSupplierId(record.contactId); setCurrency(record.currency); setReferenceNo(record.referenceNo); setNotes(record.notes);
    setLines(record.lines.map((line) => ({ id: line.id, productId: line.productId ?? "", taxCodeId: line.taxCodeId ?? "", description: line.description, quantity: Math.max(0, line.quantity - line.billedQuantity), unitPrice: line.unitPrice, taxRate: line.taxRate, alreadyBilled: line.billedQuantity, remainingQuantity: Math.max(0, line.quantity - line.billedQuantity) })).filter((line) => line.remainingQuantity! > 0));
  }
  function replaceSource(next: SourceType) { setError(""); setSource(next); setSelectedSourceId(""); if (next === "none") { setSupplierId(""); setLines([blankLine()]); setReferenceNo(""); setNotes(""); return; } setLines([]); }
  function changeSource(next: SourceType) {
    if (next === source) return;
    const hasContent = sourceMode ? Boolean(selectedSourceId || lines.length) : lines.some((line) => line.productId || line.description || line.quantity !== 1 || line.unitPrice !== 0);
    if (!hasContent) { replaceSource(next); return; }
    setConfirmState({ title: "Replace bill items?", description: "Changing the source replaces the current bill items and clears source-specific details.", action: async () => replaceSource(next) });
  }
  async function changeSourceId(id: string) { setError(""); await loadSource(source, id); }

  async function submit() {
    if (sourceMode && !selectedSourceId) { setError("Select a source document first."); return; }
    if (!supplierId) { setError("Select a supplier."); return; }
    if (!currency) { setError("Select a currency."); return; }
    const activeLines = lines.filter((line) => line.quantity > 0);
    if (!activeLines.length || (!sourceMode && activeLines.some((line) => !line.productId || !line.description.trim()))) { setError("Add at least one complete bill item."); return; }
    setConfirmState({ title: "Create purchase bill", description: "Create this purchase bill?", action: async () => {
      const common = { dueDateUtc: new Date(`${dueDateUtc}T00:00:00Z`).toISOString(), paymentTermId: paymentTermId || null, usePaymentTermDueDate: Boolean(paymentTermId) && !manualDueDate, referenceNo, notes };
      const result = source === "grn" ? await api.post<PurchaseBill>(`/purchases/grns/${selectedSourceId}/convert-to-bill`, { ...common, lines: activeLines.map((line) => ({ goodsReceivedNoteLineId: line.id, quantity: line.quantity })) }) : source === "purchase-order" ? await api.post<PurchaseBill>(`/purchases/orders/${selectedSourceId}/convert-to-bill`, { ...common, lines: activeLines.map((line) => ({ purchaseOrderLineId: line.id, quantity: line.quantity })) }) : await api.post<PurchaseBill>("/purchases/bills", { companyId, contactId: supplierId, currency, ...common, directLines: activeLines.map((line) => ({ productId: line.productId, taxCodeId: line.taxCodeId || null, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate })) });
      openCreatedRecord(navigate, "/purchases/bills", "/purchases/bills", result.id);
    }});
  }
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0); const tax = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * line.taxRate / 100, 0); const filteredProducts = products.filter((item) => item.companyId === companyId && item.isBuying && item.isActive);
  return <div className="page"><FormPageHeader backLabel="Back to Bills" backHref="/purchases/bills" breadcrumbs={<><span>Bills</span><span>/</span><span>New Bill</span></>} />{error ? <HelperText tone="error">{error}</HelperText> : null}
    <TransactionFormCard title="Bill details" description="Supplier, dates, source document and bill items.">
      <section className="card"><div className="master-data-form-grid master-data-form-grid-wide">
        <label className="form-label">Source Type<select value={source} onChange={(event) => changeSource(event.target.value as SourceType)}><option value="none">No source document</option><option value="purchase-order">Purchase Order</option><option value="grn">Goods Received Note</option></select></label>
        {sourceMode ? <label className="form-label">Source Document<select value={selectedSourceId} onChange={(event) => { void changeSourceId(event.target.value); }}><option value="">Select a source document</option>{(source === "grn" ? grnOptions : purchaseOrderOptions).map((item) => <option key={item.id} value={item.id}>{source === "grn" ? `${(item as GoodsReceivedNoteListItem).goodsReceivedNoteNumber} | ${item.contactName}` : `${(item as PurchaseOrderListItem).purchaseOrderNumber} | ${item.contactName}`}</option>)}</select></label> : null}
        <label className="form-label">Supplier<select value={supplierId} disabled={sourceMode} onChange={(event) => { setSupplierId(event.target.value); applySupplierDefaults(event.target.value); }}><option value="">Select supplier</option>{suppliers.filter((item) => item.companyId === companyId).map((item) => <option key={item.id} value={item.id}>{item.legalName || item.name}</option>)}</select></label>
        <label className="form-label">Currency<CurrencySelect id="purchase-bill-currency" value={currency} currencies={currencies} disabled={sourceMode} onChange={setCurrency} /></label>
        <label className="form-label">Payment Term<select value={paymentTermId} onChange={(event) => { const term = paymentTerms.find((item) => item.id === event.target.value); setPaymentTermId(event.target.value); setManualDueDate(false); if (term) setDueDateUtc(addTermDays(term.days)); }}><option value="">Manual due date</option>{paymentTerms.map((item) => <option key={item.id} value={item.id}>{`${item.code} · ${item.name}`}</option>)}</select></label>
        <label className="form-label">Due Date<input type="date" className="text-input" value={dueDateUtc} onChange={(event) => { setDueDateUtc(event.target.value); setManualDueDate(true); }} /></label><label className="form-label">Reference No<input className="text-input" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></label><label className="form-label">Notes<textarea className="text-input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      </div>{sourceMode ? <HelperText>Select a source document with remaining billable quantity.</HelperText> : null}</section>
      <section className="card"><div className="card-section-header"><div className="section-header-cluster"><h3 className="section-title">Bill Items</h3></div>{!sourceMode ? <button type="button" className="button button-secondary" onClick={() => setLines((current) => [...current, blankLine()])}>Add item</button> : null}</div><div className="table-scroll table-scroll-bounded"><table className="catalog-table"><thead>{sourceMode ? <tr><th>Description</th><th>Source Qty</th><th>Already Billed</th><th>Remaining</th><th>Bill Qty</th><th>Unit Amount</th><th>Total</th></tr> : <tr><th>Product</th><th>Description</th><th>Qty</th><th>Unit Amount</th><th>Tax</th><th>Total</th><th /></tr>}</thead><tbody>{lines.length === 0 ? <tr><td colSpan={7} className="empty-table-cell">No remaining quantity available to bill.</td></tr> : lines.map((line, index) => sourceMode ? <tr key={line.id}><td>{line.description}</td><td>{(line.quantity + (line.alreadyBilled ?? 0))}</td><td>{line.alreadyBilled}</td><td>{line.remainingQuantity}</td><td><input type="number" min="0" max={line.remainingQuantity} step="0.01" className="text-input" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Math.min(Math.max(0, Number(event.target.value)), line.remainingQuantity ?? 0) })} /></td><td>{formatCurrency(line.unitPrice, currency)}</td><td>{formatCurrency(line.quantity * line.unitPrice, currency)}</td></tr> : <tr key={line.id}><td><SearchableSelect value={line.productId} onChange={(productId) => selectProduct(index, productId)} options={filteredProducts.map((product) => ({ value: product.id, label: product.name, keywords: [product.code] }))} placeholder="Search products..." searchPlaceholder="Search products..." emptyText="No products found." ariaLabel="Product" portalPopover onCreate={getAuth()?.role === "Owner" || getAuth()?.role === "Admin" ? (name) => setQuickCreate({ index, name }) : undefined} createLabel="Add" /></td><td><input className="text-input" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></td><td><input type="number" min="0.01" step="0.01" className="text-input" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td><td><input type="number" min="0" step="0.01" className="text-input" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })} /></td><td><select value={line.taxCodeId} onChange={(event) => { const code = taxCodes.find((item) => item.id === event.target.value); updateLine(index, { taxCodeId: event.target.value, taxRate: code?.rate ?? 0 }); }}><option value="">No tax</option>{taxCodes.map((code) => <option key={code.id} value={code.id}>{`${code.code} · ${code.rate}%`}</option>)}</select></td><td>{formatCurrency(line.quantity * line.unitPrice * (1 + line.taxRate / 100), currency)}</td><td><button type="button" className="button button-secondary button-compact" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={lines.length === 1}>Remove</button></td></tr>)}</tbody></table></div><div className="page-meta-row page-meta-row-inline"><div className="page-meta-chips"><span className="page-meta-chip"><span className="page-meta-chip-label">Subtotal</span><strong className="page-meta-chip-value">{formatCurrency(subtotal, currency)}</strong></span><span className="page-meta-chip"><span className="page-meta-chip-label">Tax</span><strong className="page-meta-chip-value">{formatCurrency(tax, currency)}</strong></span><span className="page-meta-chip"><span className="page-meta-chip-label">Total</span><strong className="page-meta-chip-value">{formatCurrency(subtotal + tax, currency)}</strong></span></div></div></section>
      <div className="contact-page-actions form-footer-create"><button type="button" className="button button-secondary" onClick={() => navigate("/purchases/bills")}>Cancel</button><button type="button" className="button button-primary" onClick={() => void submit()}>Create bill</button></div>
    </TransactionFormCard><ConfirmModal open={confirmState !== null} title={confirmState?.title ?? ""} description={confirmState?.description ?? ""} confirmLabel="Confirm" onConfirm={async () => { await confirmState?.action(); }} onCancel={() => setConfirmState(null)} />
    {quickCreate ? <QuickCreateProductModal companyId={companyId} mode="purchase" name={quickCreate.name} snapshot={snapshot} onClose={() => setQuickCreate(null)} onCreated={(created) => { const product = created as unknown as Product; setProducts((current) => [...current, product]); selectProduct(quickCreate.index, product.id); setQuickCreate(null); }} /> : null}
  </div>;
}
