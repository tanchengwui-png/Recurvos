import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { Button } from "../components/ui/Button";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, FeatureAccess, PlatformPackage, Product } from "../types";

export function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Product[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
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
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([items.length, search, selectedCompanyId, statusFilter, currentPage, pageSize]);
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
    setFeatureAccess(access);
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
  const subscriptionProducts = items.filter((item) => item.productType !== "One-Time").length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  function getProductActions(item: Product) {
    return [
      { label: expandedId === item.id ? "Hide details" : "View details", onClick: () => setExpandedId((current) => current === item.id ? null : item.id) },
      { label: "Edit product", onClick: () => navigate(`/products/${item.id}/edit`) },
      {
        label: item.isActive ? "Deactivate product" : "Activate product",
        onClick: () => setConfirmState({
          title: `${item.isActive ? "Deactivate" : "Activate"} product`,
          description: item.isActive ? "Deactivating a product also deactivates its active plans." : "Activate this product so active plans can be sold.",
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
          description: `Delete ${item.name}? This only works when the product has no plans.`,
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
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing catalog</p>
          <h2>Products</h2>
          <p className="muted">Product = what customer buys. Plan = how much and how often customer is charged.</p>
          <p className="muted">
            Products used: {totalCount}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => navigate("/products/new")}>Add product</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}

      <section className="management-summary-grid">
        <article className="management-summary-card">
          <p className="eyebrow">Usage</p>
          <h3>{totalCount}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</h3>
          <p className="muted">Products currently used under this subscriber account.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Active</p>
          <h3>{activeProducts}</h3>
          <p className="muted">Products currently available for invoicing and active plans.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Recurring</p>
          <h3>{subscriptionProducts}</h3>
          <p className="muted">Catalog items set up for subscription billing instead of one-time charges.</p>
        </article>
      </section>

      <div className="catalog-toolbar card subtle-card products-filter-bar">
        <TextInput aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or code" />
        <select aria-label="Filter products by company" value={selectedCompanyId ?? ""} onChange={(event) => setSelectedCompanyId(event.target.value || "")}>
          <option value="">All companies</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <select aria-label="Filter products by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <p className="muted products-filter-meta">{totalCount} products</p>
      </div>

      <section className="card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">Catalog list</p>
            <h3 className="section-title">Products and plans</h3>
            <p className="muted">Create products first, then attach one or more plans for pricing and billing cadence.</p>
          </div>
        </div>
        <div className="subscription-mobile-list">
          {items.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.name}</strong>
                  <div className="eyebrow">{item.companyName}</div>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getProductActions(item)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-summary">
                <div className="subscription-mobile-amount">{item.code}</div>
                <div className="subscription-mobile-cadence">{item.productType === "One-Time" ? "One-time" : "Subscription"}</div>
              </div>
              <div className="subscription-mobile-card-topline">
                <span className={`subscription-mobile-status ${item.isActive ? "subscription-mobile-status-active" : "subscription-mobile-status-inactive"}`}>
                  {item.isActive ? "Active" : "Inactive"}
                </span>
                <span className="subscription-mobile-inline-note">{`${item.plansCount} plan${item.plansCount === 1 ? "" : "s"}`}</span>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Company</span>
                  <span className="subscription-mobile-meta-value">{item.companyName}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Catalog</span>
                  <span className="subscription-mobile-meta-value">{`${item.code} | ${item.productType === "One-Time" ? "One-time" : "Subscription"}`}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Plans</span>
                  <span className="subscription-mobile-meta-value">{`${item.plansCount} plan${item.plansCount === 1 ? "" : "s"}`}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Default</span>
                  <span className="subscription-mobile-meta-value">{item.defaultPlan ? `${item.defaultPlan.planName} | ${formatCurrency(item.defaultPlan.unitAmount, item.defaultPlan.currency)}` : "-"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="subscription-table-shell">
          <div ref={topScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
            <div ref={topInnerRef} />
          </div>
          <div
            ref={(node) => {
              tableScrollRef.current = node;
              contentScrollRef.current = node;
            }}
            className="table-scroll table-scroll-bounded table-scroll-draggable"
          >
            <table className="catalog-table subscription-table products-table">
            <thead>
              <tr>
                <th className="sticky-cell sticky-cell-left">Product Name</th>
                <th>Company</th>
                <th>Status</th>
                <th>Catalog</th>
                <th>Default Plan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="sticky-cell sticky-cell-left table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <div className="stack">
                        <button type="button" className="table-link" onClick={() => navigate(`/products/${item.id}`)}>{item.name}</button>
                        <div className="table-meta">
                          <span className="table-meta-item">
                            <span className={`table-meta-dot ${item.isActive ? "table-meta-dot-active" : "table-meta-dot-inactive"}`} aria-hidden="true" />
                            {item.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                      <RowActionMenu items={getProductActions(item)} />
                    </div>
                  </td>
                  <td>{item.companyName}</td>
                  <td>
                    <div>{item.isActive ? "Active" : "Inactive"}</div>
                    <div className="eyebrow">{item.productType === "One-Time" ? "One-time" : "Subscription"}</div>
                  </td>
                  <td>
                    <div>{item.code}</div>
                    <div className="eyebrow">{`${item.productType === "One-Time" ? "One-time" : "Subscription"} | ${item.plansCount} plan${item.plansCount === 1 ? "" : "s"}`}</div>
                  </td>
                  <td>{item.defaultPlan ? `${item.defaultPlan.planName} - ${formatCurrency(item.defaultPlan.unitAmount, item.defaultPlan.currency)}` : "-"}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
        </div>
        {items.length === 0 ? (
          <div className="empty-state">
            <h3>No products yet</h3>
            <p className="muted">Create your first product and attach monthly, quarterly, yearly, or one-time plans.</p>
            {featureAccess?.packageCode ? (
              <p className="muted">
                Package limit: {packageLimitLabel} products on {featureAccess.packageCode}.
              </p>
            ) : null}
            <div className="empty-state-actions">
              <Button type="button" onClick={() => navigate("/products/new")}>Create first product</Button>
              <Button type="button" variant="secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</Button>
            </div>
          </div>
        ) : null}
        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>
      {selectedProduct ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div className="card invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="product-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Product detail</p>
                <h3 id="product-detail-title">{selectedProduct.name}</h3>
                <p className="muted">{selectedProduct.companyName}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat"><p className="eyebrow">Status</p><strong>{selectedProduct.isActive ? "Active" : "Inactive"}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Type</p><strong>{selectedProduct.productType}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Plans</p><strong>{selectedProduct.plansCount}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Default plan</p><strong>{selectedProduct.defaultPlan?.planName || "-"}</strong></div>
                </div>
                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Catalog</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Name</span><strong>{selectedProduct.name}</strong></div>
                        <div className="invoice-detail-list-row"><span>Code</span><strong>{selectedProduct.code}</strong></div>
                        <div className="invoice-detail-list-row"><span>Category</span><strong>{selectedProduct.category || "-"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Company</span><strong>{selectedProduct.companyName}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="invoice-detail-aside">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Billing</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Subscription product</span><strong>{selectedProduct.isSubscriptionProduct ? "Yes" : "No"}</strong></div>
                        <div className="invoice-detail-list-row invoice-detail-list-row-top"><span>Default plan</span><strong className="invoice-detail-align-right">{selectedProduct.defaultPlan ? `${selectedProduct.defaultPlan.planName} | ${selectedProduct.defaultPlan.billingLabel} | ${formatCurrency(selectedProduct.defaultPlan.unitAmount, selectedProduct.defaultPlan.currency)}` : "-"}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
