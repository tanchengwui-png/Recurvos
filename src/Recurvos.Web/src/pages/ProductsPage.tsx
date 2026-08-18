import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { RecordDetailField, RecordDetailsModal, RecordDetailSection } from "../components/RecordDetailsModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { ListToolbar } from "../components/ListToolbar";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { Button } from "../components/ui/Button";
import { ResponseToast } from "../components/ui/Toast";
import { TextInput } from "../components/ui/TextInput";
import { fetchProduct, fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, FeatureAccess, PlatformPackage, Product, ProductDetails } from "../types";

function formatQuantity(value?: number | null) {
  return value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function formatDateRange(start?: string | null, end?: string | null) {
  const format = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "Any date";
  return `${format(start)} – ${format(end)}`;
}

function ProductDetailTable({ title, headings, rows }: { title: string; headings: string[]; rows: string[][] }) {
  return <section className="product-preview-section product-preview-table-section">
    <h4>{title}</h4>
    <div className="table-scroll table-scroll-bounded">
      <table className="catalog-table">
        <thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((value, cellIndex) => <td key={`${index}-${cellIndex}`}>{value || "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function AddProductMenu({ onManual, onImport, onBatchUpdate }: { onManual: () => void; onImport: () => void; onBatchUpdate: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const select = (action: () => void) => { setOpen(false); action(); };
  return <div ref={menuRef} className="contact-add-menu">
    <button type="button" className="button button-primary contact-add-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">Add product <span aria-hidden="true">▼</span></button>
    {open ? <div className="contact-add-popover" role="menu" aria-label="Add product actions">
      <button type="button" role="menuitem" onClick={() => select(onManual)}>Add manually</button>
      <button type="button" role="menuitem" onClick={() => select(onImport)}>Import products</button>
      <button type="button" role="menuitem" onClick={() => select(onBatchUpdate)}>Batch update</button>
    </div> : null}
  </div>;
}

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Product[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductDetails | null>(null);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(searchParams.get("company") || null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(() => {
    const value = searchParams.get("status");
    return value === "active" || value === "inactive" ? value : "all";
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const value = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(searchParams.get("pageSize") ?? "20");
    return Number.isFinite(value) && value > 0 ? value : 20;
  });
  const [message, setMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(totalCount, currentPage * pageSize);
  const selectedProduct = expandedId ? items.find((item) => item.id === expandedId) ?? null : null;

  async function load() {
    const [result, companyList, access, packages] = await Promise.all([
      fetchProducts({ search, companyId: selectedCompanyId || undefined, isActive: statusFilter, page: currentPage, pageSize }),
      api.get<CompanyLookup[]>("/companies"),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<PlatformPackage[]>("/public/packages").catch(() => []),
    ]);
    setItems(result.items);
    setTotalCount(result.totalCount);
    setCompanies(companyList);
    const activePackage = packages.find((item) => item.code === access?.packageCode);
    setPackageLimit(activePackage?.maxProducts ?? null);
  }

  useEffect(() => {
    void load();
  }, [search, selectedCompanyId, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCompanyId, statusFilter]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedSearch = search.trim();

    if (trimmedSearch) {
      nextParams.set("search", trimmedSearch);
    } else {
      nextParams.delete("search");
    }

    if (selectedCompanyId) {
      nextParams.set("company", selectedCompanyId);
    } else {
      nextParams.delete("company");
    }

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    if (currentPage > 1) {
      nextParams.set("page", String(currentPage));
    } else {
      nextParams.delete("page");
    }

    if (pageSize !== 20) {
      nextParams.set("pageSize", String(pageSize));
    } else {
      nextParams.delete("pageSize");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [currentPage, pageSize, search, searchParams, selectedCompanyId, setSearchParams, statusFilter]);

  useEffect(() => {
    const state = location.state;
    const flashMessage = state && typeof state === "object" && "flashMessage" in state ? state.flashMessage : null;

    if (typeof flashMessage !== "string" || !flashMessage) {
      return;
    }

    setMessage(flashMessage);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!selectedProduct) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct]);

  useEffect(() => {
    if (!expandedId) {
      setDetailProduct(null);
      return;
    }

    let active = true;
    setDetailProduct(null);
    void fetchProduct(expandedId)
      .then((product) => { if (active) setDetailProduct(product); })
      .catch(() => { if (active) setDetailProduct(null); });

    return () => { active = false; };
  }, [expandedId]);

  useEffect(() => {
    if (!selectedProduct) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedProduct]);

  const activeProducts = items.filter((item) => item.isActive).length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  function getProductActions(item: Product) {
    return [
      { label: "View details", onClick: () => setExpandedId(item.id) },
      { label: "Edit product", onClick: () => navigate(`/products/${item.id}/edit`) },
      {
        label: item.isActive ? "Deactivate product" : "Activate product",
        onClick: () => setConfirmState({
          title: `${item.isActive ? "Deactivate" : "Activate"} product`,
          description: item.isActive ? "This will make the product unavailable for new transactions." : "This will make the product available for new transactions.",
          action: async () => {
            await api.patch(`/products/${item.id}/status`, { isActive: !item.isActive });
            setConfirmState(null);
            await load();
          },
        }),
      },
      {
        label: "Delete product",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete product",
          description: `Delete ${item.name}? This only works when the product is not used by existing transactions.`,
          action: async () => {
            await api.delete(`/products/${item.id}`);
            setConfirmState(null);
            await load();
          },
        }),
      },
    ];
  }

  return (
    <div className="page products-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Products</h2>
        </div>
      </header>
      <ResponseToast message={message} tone="success" />

      <ListToolbar className="products-filter-card">
        <TextInput aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name, SKU, barcode, or code" />
        <select aria-label="Filter products by company" value={selectedCompanyId ?? ""} onChange={(event) => setSelectedCompanyId(event.target.value || "")}>
          <option value="">All companies</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <select aria-label="Filter products by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </ListToolbar>

      <section className="products-list-card">
        <div className="card-section-header products-list-header">
          <div className="section-header-cluster products-summary" aria-label="Product summary">
            <h3 className="section-title">Products</h3>
            <div className="page-meta-chips">
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Products</span>
                <strong className="page-meta-chip-value">{totalCount}</strong>
              </span>
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Active</span>
                <strong className="page-meta-chip-value">{activeProducts}</strong>
              </span>
            </div>
            {packageLimit !== null ? <span className="products-capacity-note">{`${totalCount} / ${packageLimitLabel} used`}</span> : null}
          </div>
          <div className="list-card-header-actions"><button type="button" className="button button-secondary" onClick={() => navigate("/product-groups")}>Product groups</button><AddProductMenu onManual={() => navigate("/products/new")} onImport={() => navigate("/products/import")} onBatchUpdate={() => navigate("/products/batch-update")} /></div>
        </div>
        <div className="product-mobile-list">
          {items.map((item) => (
            <article key={item.id} className="product-mobile-card">
              <div className="product-mobile-card-header">
                <div className="product-mobile-identity">
                  <strong>{item.name}</strong>
                  <div className="eyebrow">{item.companyName}</div>
                </div>
                <div className="product-mobile-actions">
                  <RowActionMenu items={getProductActions(item)} label="More" />
                </div>
              </div>
              <div className="product-mobile-summary">
                <div className="product-mobile-amount">{item.code}</div>
                <div className="product-mobile-uom">{item.baseUnitLabel}</div>
              </div>
              <div className="product-mobile-card-topline">
                <span className={`product-mobile-status ${item.isActive ? "product-mobile-status-active" : "product-mobile-status-inactive"}`}>
                  {item.isActive ? "Active" : "Inactive"}
                </span>
                <span className="product-mobile-inline-note">{item.productGroups.length ? item.productGroups.join(", ") : "No product group"}</span>
              </div>
              <div className="product-mobile-meta">
                <div className="product-mobile-meta-row">
                  <span className="product-mobile-meta-label">Company</span>
                  <span className="product-mobile-meta-value">{item.companyName}</span>
                </div>
                <div className="product-mobile-meta-row">
                  <span className="product-mobile-meta-label">Product code</span>
                  <span className="product-mobile-meta-value">{item.code}</span>
                </div>
                <div className="product-mobile-meta-row">
                  <span className="product-mobile-meta-label">Sales price</span>
                  <span className="product-mobile-meta-value">{item.salesPrice == null ? "—" : formatCurrency(item.salesPrice)}</span>
                </div>
                <div className="product-mobile-meta-row">
                  <span className="product-mobile-meta-label">Purchase price</span>
                  <span className="product-mobile-meta-value">{item.purchasePrice == null ? "—" : formatCurrency(item.purchasePrice)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="product-table-shell">
          <div className="products-table-wrapper">
            <table className="catalog-table products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Company</th>
                <th>Status</th>
                <th>Product group</th>
                <th>Sales price</th>
                <th>Purchase price</th>
                <th>UOM</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={8}
                  title="No products yet"
                  description="Create your first product to manage sales, purchasing, inventory and units of measurement."
                  actions={(
                    <><Button type="button" onClick={() => navigate("/products/new")}>Create first product</Button><Button type="button" variant="secondary" onClick={() => navigate("/product-groups")}>Product groups</Button></>
                  )}
                />
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <div className="stack">
                        <button type="button" className="table-link" onClick={() => setExpandedId(item.id)}>{item.name}</button>
                        <div className="table-meta">
                          <span className="table-meta-item">
                            <span className={`table-meta-dot ${item.isActive ? "table-meta-dot-active" : "table-meta-dot-inactive"}`} aria-hidden="true" />
                            {item.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{item.companyName}</td>
                  <td>
                    <div>{item.isActive ? "Active" : "Inactive"}</div>
                  </td>
                  <td>{item.productGroups.length ? item.productGroups.join(", ") : "—"}</td>
                  <td>{item.salesPrice == null ? "—" : formatCurrency(item.salesPrice)}</td>
                  <td>{item.purchasePrice == null ? "—" : formatCurrency(item.purchasePrice)}</td>
                  <td>{item.baseUnitLabel}</td>
                  <td><RowActionMenu items={getProductActions(item)} /></td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
        {items.length > 0 ? <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        /> : null}
      </section>
      {selectedProduct ? (
        <RecordDetailsModal eyebrow="Product summary" title={selectedProduct.name} subtitle={selectedProduct.companyName} onClose={() => setExpandedId(null)} actions={<button type="button" className="button button-secondary button-compact" onClick={() => navigate(`/products/${selectedProduct.id}/edit`)}>Edit product</button>}>
          {!detailProduct ? <p className="muted">Loading product details...</p> : <div className="product-preview-form">
                <div className="product-preview-statuses">
                  <span className={`status-pill ${detailProduct.isActive ? "status-pill-active" : "status-pill-inactive"}`}>{detailProduct.isActive ? "Active" : "Inactive"}</span>
                  <span className={`status-pill ${detailProduct.trackInventory ? "" : "status-pill-inactive"}`}>{detailProduct.trackInventory ? "Inventory tracked" : "Inventory not tracked"}</span>
                  {detailProduct.isSelling ? <span className="status-pill">For sale</span> : null}
                  {detailProduct.isBuying ? <span className="status-pill">For purchase</span> : null}
                </div>
                <RecordDetailSection title="Product information">
                  <RecordDetailField label="Product name" value={detailProduct.name} /><RecordDetailField label="Product code" value={detailProduct.code} /><RecordDetailField label="Company" value={detailProduct.companyName} /><RecordDetailField label="Barcode" value={detailProduct.barcode} />
                  <RecordDetailField label="Classification code" value={detailProduct.category} /><RecordDetailField label="Product groups" value={detailProduct.productGroups.join(", ")} /><RecordDetailField label="Bin location" value={detailProduct.binLocation} /><RecordDetailField label="Description" value={detailProduct.description} />
                </RecordDetailSection>
                {detailProduct.trackInventory ? <RecordDetailSection title="Inventory">
                  <RecordDetailField label="Inventory account" value={detailProduct.inventoryAccount} /><RecordDetailField label="Reorder level" value={formatQuantity(detailProduct.reorderLevel)} /><RecordDetailField label="Opening quantity" value={formatQuantity(detailProduct.openingQuantity)} /><RecordDetailField label="Opening cost" value={detailProduct.openingCost != null ? formatCurrency(detailProduct.openingCost) : null} />
                </RecordDetailSection> : null}
                {detailProduct.isSelling ? <RecordDetailSection title="Sales">
                  <RecordDetailField label="Sales price" value={detailProduct.salesPrice != null ? formatCurrency(detailProduct.salesPrice) : null} /><RecordDetailField label="Sales tax" value={detailProduct.salesTaxCode} /><RecordDetailField label="Income account" value={detailProduct.incomeAccount} /><RecordDetailField label="Sales description" value={detailProduct.salesDescription} />
                </RecordDetailSection> : null}
                {detailProduct.isBuying ? <RecordDetailSection title="Purchases">
                  <RecordDetailField label="Purchase price" value={detailProduct.purchasePrice != null ? formatCurrency(detailProduct.purchasePrice) : null} /><RecordDetailField label="Purchase tax" value={detailProduct.purchaseTaxCode} /><RecordDetailField label="Expense account" value={detailProduct.expenseAccount} /><RecordDetailField label="Preferred supplier" value={detailProduct.preferredSupplierName} />
                </RecordDetailSection> : null}
                <RecordDetailSection title="Units of measurement">
                  <RecordDetailField label="Base unit" value={detailProduct.baseUnitLabel} /><RecordDetailField label="Multiple units" value={detailProduct.hasMultipleUoms ? "Enabled" : "Disabled"} />
                </RecordDetailSection>
                {detailProduct.uomConversions.length > 0 ? <ProductDetailTable title="Additional UOMs" headings={["UOM", "Factor", "Sales price", "Purchase price", "Defaults"]} rows={detailProduct.uomConversions.map((item) => [item.label, formatQuantity(item.factor), item.salePrice == null ? "—" : formatCurrency(item.salePrice), item.purchasePrice == null ? "—" : formatCurrency(item.purchasePrice), [item.isDefaultSalesUom ? "Sales" : "", item.isDefaultPurchaseUom ? "Purchase" : ""].filter(Boolean).join(", ") || "—"])} /> : null}
                {detailProduct.customSalesPrices.length > 0 ? <ProductDetailTable title="Custom sales prices" headings={["Applies to", "UOM", "Minimum qty", "Date range", "Price"]} rows={detailProduct.customSalesPrices.map((item) => [item.contactName || item.contactGroup || item.priceLevel || item.contactCode, item.uom, formatQuantity(item.minQuantity), formatDateRange(item.dateFromUtc, item.dateToUtc), formatCurrency(item.unitPrice)])} /> : null}
                {detailProduct.customPurchasePrices.length > 0 ? <ProductDetailTable title="Custom purchase prices" headings={["Applies to", "UOM", "Minimum qty", "Date range", "Price"]} rows={detailProduct.customPurchasePrices.map((item) => [item.contactName || item.contactGroup || item.priceLevel || item.contactCode, item.uom, formatQuantity(item.minQuantity), formatDateRange(item.dateFromUtc, item.dateToUtc), formatCurrency(item.unitPrice)])} /> : null}
              </div>}
        </RecordDetailsModal>
      ) : null}

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
