import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { Button } from "../components/ui/Button";
import { FormLabel } from "../components/ui/FormLabel";
import { HelperText } from "../components/ui/HelperText";
import { TextInput } from "../components/ui/TextInput";
import { fetchProducts } from "../hooks/useProducts";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { CompanyLookup, FeatureAccess, PlatformPackage, Product } from "../types";

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

function normalizeProductCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function ProductsPage() {
  const navigate = useNavigate();
  const formCardRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(totalCount, currentPage * pageSize);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([items.length, search, selectedCompanyId, statusFilter, currentPage, pageSize]);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

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
    if (!form.companyId && companyList[0]) {
      setForm((current) => ({ ...current, companyId: companyList[0].id }));
    }
  }

  useEffect(() => {
    void load();
  }, [search, selectedCompanyId, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCompanyId, statusFilter]);

  const activeProducts = items.filter((item) => item.isActive).length;
  const subscriptionProducts = items.filter((item) => item.productType !== "One-Time").length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  function focusForm() {
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => nameInputRef.current?.focus(), 120);
  }

  function startCreate() {
    setForm({ ...emptyForm, companyId: selectedCompanyId || companies[0]?.id || "" });
    setFormError("");
    focusForm();
  }

  function startEdit(item: Product) {
    setForm({
      id: item.id,
      companyId: item.companyId,
      name: item.name,
      code: item.code,
      description: "",
      category: item.category || "",
      isSubscriptionProduct: item.productType !== "One-Time",
      isActive: item.isActive,
    });
    setFormError("");
    focusForm();
  }

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

          setForm(emptyForm);
          setForm({ ...emptyForm, companyId: selectedCompanyId || companies[0]?.id || "" });
          setConfirmState(null);
          await load();
        } catch (error) {
          setConfirmState(null);
          setFormError(error instanceof Error ? error.message : "Unable to save product.");
        } finally {
          setIsSubmitting(false);
        }
      },
    });
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
      </header>

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

      <div className="catalog-toolbar card subtle-card">
        <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or code" />
        <select value={selectedCompanyId ?? ""} onChange={(event) => setSelectedCompanyId(event.target.value || "")}>
          <option value="">All companies</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <p className="muted">{totalCount} products</p>
      </div>

      <div className="grid-two">
        <section ref={formCardRef} className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Catalog list</p>
              <h3 className="section-title">Products and plans</h3>
              <p className="muted">Create products first, then attach one or more plans for pricing and billing cadence.</p>
            </div>
          </div>
          <>
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
              <table className="catalog-table products-table">
                <thead>
                  <tr>
                    <th className="sticky-cell sticky-cell-left">Product Name</th>
                    <th>Company</th>
                    <th>Code</th>
                    <th>Category</th>
                    <th>Plans Count</th>
                    <th>Default Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="sticky-cell sticky-cell-left table-primary-cell">
                        <div className="table-primary-cell-inner">
                          <div className="stack">
                            <button type="button" className="table-link" onClick={() => navigate(`/products/${item.id}`)}>{item.name}</button>
                            <div className="table-meta">
                              <span className="table-meta-item">
                                <span className={`table-meta-dot ${item.isActive ? "table-meta-dot-active" : "table-meta-dot-inactive"}`} aria-hidden="true" />
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </div>
                          </div>
                          <RowActionMenu
                            items={[
                              { label: "Edit product", onClick: () => startEdit(item) },
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
                                tone: "danger",
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
                            ]}
                          />
                        </div>
                      </td>
                      <td>{item.companyName}</td>
                      <td>{item.code}</td>
                      <td>{item.category || "-"}</td>
                      <td>{item.plansCount}</td>
                      <td>{item.defaultPlan ? `${item.defaultPlan.planName} - ${formatCurrency(item.defaultPlan.unitAmount, item.defaultPlan.currency)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <Button type="button" onClick={startCreate}>Create first product</Button>
                    <Button type="button" variant="secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
              <div ref={bottomInnerRef} />
            </div>
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
          </>
        </section>

        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">{form.id ? "Edit product" : "Add product"}</p>
              <h3 className="section-title">{form.id ? "Update catalog item" : "Create catalog item"}</h3>
              <p className="muted form-intro">Products define what you sell. Plans handle pricing and billing.</p>
            </div>
          </div>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <FormLabel htmlFor="product-company">Company<select id="product-company" value={form.companyId} onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></FormLabel>
            <FormLabel htmlFor="product-name">Name<TextInput ref={nameInputRef} id="product-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></FormLabel>
            <FormLabel htmlFor="product-code">Code<TextInput id="product-code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: normalizeProductCode(event.target.value) }))} /></FormLabel>
            <FormLabel htmlFor="product-description">Description<TextInput id="product-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></FormLabel>
            <FormLabel htmlFor="product-category">Category<TextInput id="product-category" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></FormLabel>
            <label className="checkbox-row"><input type="checkbox" checked={form.isSubscriptionProduct} onChange={(event) => setForm((current) => ({ ...current, isSubscriptionProduct: event.target.checked }))} /> Subscription product</label>
            <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
            {formError ? <HelperText tone="error">{formError}</HelperText> : <HelperText>Use an uppercase code like STARTER or GROWTH-PLAN.</HelperText>}
            <div className="button-stack">
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : form.id ? "Update Product" : "Create Product"}</Button>
              {form.id ? <Button type="button" variant="secondary" onClick={() => { setForm(emptyForm); setFormError(""); }}>{isSubmitting ? "Cancel" : "Cancel"}</Button> : null}
            </div>
          </form>
        </section>
      </div>

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
