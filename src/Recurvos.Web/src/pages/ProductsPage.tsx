import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
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

function ProductPreviewField({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="product-preview-field"><span>{label}</span><strong>{value === "" || value == null ? "—" : value}</strong></div>;
}

function ProductPreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="product-preview-section"><h4>{title}</h4><div className="product-preview-grid">{children}</div></section>;
}

function formatQuantity(value?: number | null) {
  return value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
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
        <div className="modal-backdrop product-preview-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div className="card product-preview-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="product-preview-modal-header">
              <div>
                <p className="eyebrow">Product summary</p>
                <h3 id="product-detail-title">{selectedProduct.name}</h3>
                <p className="muted">{selectedProduct.companyName}</p>
              </div>
              <div className="product-preview-modal-actions">
                <button type="button" className="button button-secondary button-compact" onClick={() => navigate(`/products/${selectedProduct.id}/edit`)}>Edit product</button>
                <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
              </div>
            </div>
            <div className="product-preview-modal-body">
              {!detailProduct ? <p className="muted">Loading product details...</p> : <div className="product-preview-form">
                <div className="product-preview-statuses">
                  <span className={`status-pill ${detailProduct.isActive ? "status-pill-active" : "status-pill-inactive"}`}>{detailProduct.isActive ? "Active" : "Inactive"}</span>
                  <span className={`status-pill ${detailProduct.trackInventory ? "" : "status-pill-inactive"}`}>{detailProduct.trackInventory ? "Inventory tracked" : "Inventory not tracked"}</span>
                  {detailProduct.isSelling ? <span className="status-pill">For sale</span> : null}
                  {detailProduct.isBuying ? <span className="status-pill">For purchase</span> : null}
                </div>
                <ProductPreviewSection title="Product information">
                  <ProductPreviewField label="Product name" value={detailProduct.name} /><ProductPreviewField label="Product code" value={detailProduct.code} /><ProductPreviewField label="Company" value={detailProduct.companyName} /><ProductPreviewField label="Barcode" value={detailProduct.barcode} />
                  <ProductPreviewField label="Classification code" value={detailProduct.category} /><ProductPreviewField label="Product groups" value={detailProduct.productGroups.join(", ")} /><ProductPreviewField label="Bin location" value={detailProduct.binLocation} /><ProductPreviewField label="Description" value={detailProduct.description} />
                </ProductPreviewSection>
                <ProductPreviewSection title="Inventory">
                  <ProductPreviewField label="Inventory account" value={detailProduct.trackInventory ? detailProduct.inventoryAccount : "Not tracked"} /><ProductPreviewField label="Reorder level" value={detailProduct.trackInventory ? formatQuantity(detailProduct.reorderLevel) : null} /><ProductPreviewField label="Opening quantity" value={detailProduct.trackInventory ? formatQuantity(detailProduct.openingQuantity) : null} /><ProductPreviewField label="Opening cost" value={detailProduct.trackInventory && detailProduct.openingCost != null ? formatCurrency(detailProduct.openingCost) : null} />
                </ProductPreviewSection>
                <ProductPreviewSection title="Sales">
                  <ProductPreviewField label="Sales price" value={detailProduct.isSelling && detailProduct.salesPrice != null ? formatCurrency(detailProduct.salesPrice) : null} /><ProductPreviewField label="Sales tax" value={detailProduct.isSelling ? detailProduct.salesTaxCode : null} /><ProductPreviewField label="Income account" value={detailProduct.isSelling ? detailProduct.incomeAccount : null} /><ProductPreviewField label="Sales description" value={detailProduct.isSelling ? detailProduct.salesDescription : null} />
                </ProductPreviewSection>
                <ProductPreviewSection title="Purchases">
                  <ProductPreviewField label="Purchase price" value={detailProduct.isBuying && detailProduct.purchasePrice != null ? formatCurrency(detailProduct.purchasePrice) : null} /><ProductPreviewField label="Purchase tax" value={detailProduct.isBuying ? detailProduct.purchaseTaxCode : null} /><ProductPreviewField label="Expense account" value={detailProduct.isBuying ? detailProduct.expenseAccount : null} /><ProductPreviewField label="Preferred supplier" value={detailProduct.isBuying ? detailProduct.preferredSupplierName : null} />
                </ProductPreviewSection>
                <ProductPreviewSection title="Units of measurement">
                  <ProductPreviewField label="Base unit" value={detailProduct.baseUnitLabel} /><ProductPreviewField label="Multiple units" value={detailProduct.hasMultipleUoms ? "Enabled" : "Disabled"} /><ProductPreviewField label="Additional UOMs" value={detailProduct.uomConversions.length} /><ProductPreviewField label="Custom prices" value={detailProduct.customSalesPrices.length + detailProduct.customPurchasePrices.length} />
                </ProductPreviewSection>
              </div>}
            </div>
          </div>
        </div>
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
