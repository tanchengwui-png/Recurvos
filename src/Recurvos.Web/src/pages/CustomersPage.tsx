import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useClientPagination } from "../hooks/useClientPagination";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { Customer, FeatureAccess, PlatformPackage } from "../types";

export function CustomersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<Customer[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const [error] = useState("");
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [contactFilter, setContactFilter] = useState<"all" | "email" | "phone" | "address">(() => {
    const value = searchParams.get("contact");
    return value === "email" || value === "phone" || value === "address" ? value : "all";
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedSearchQuery
      || [
        item.name,
        item.email,
        item.phoneNumber,
        item.externalReference,
        item.billingAddress,
      ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));

    if (!matchesSearch) {
      return false;
    }

    switch (contactFilter) {
      case "email":
        return !!item.email.trim();
      case "phone":
        return !!item.phoneNumber.trim();
      case "address":
        return !!item.billingAddress.trim();
      default:
        return true;
    }
  });

  const pagination = useClientPagination(filteredItems, [filteredItems.length, searchQuery, contactFilter]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);
  const selectedCustomer = expandedId ? items.find((item) => item.id === expandedId) ?? null : null;

  async function load() {
    const [customerList, access, packages] = await Promise.all([
      api.get<Customer[]>("/customers"),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<PlatformPackage[]>("/public/packages").catch(() => []),
    ]);
    setItems(customerList);
    const activePackage = packages.find((item) => item.code === access?.packageCode);
    setPackageLimit(activePackage?.maxCustomers ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedSearch = searchQuery.trim();

    if (trimmedSearch) {
      nextParams.set("search", trimmedSearch);
    } else {
      nextParams.delete("search");
    }

    if (contactFilter !== "all") {
      nextParams.set("contact", contactFilter);
    } else {
      nextParams.delete("contact");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [contactFilter, searchQuery, searchParams, setSearchParams]);

  useEffect(() => {
    const state = location.state;
    const flashMessage = state && typeof state === "object" && "flashMessage" in state ? state.flashMessage : null;

    if (typeof flashMessage !== "string" || !flashMessage) {
      return;
    }

    setMessage(flashMessage);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!selectedCustomer) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer) {
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
  }, [selectedCustomer]);

  const customersWithEmail = items.filter((item) => item.email).length;
  const customersWithAddress = items.filter((item) => item.billingAddress).length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  function getCustomerActions(item: Customer) {
    return [
      { label: expandedId === item.id ? "Hide details" : "View details", onClick: () => setExpandedId((current) => current === item.id ? null : item.id) },
      { label: "Edit customer", onClick: () => navigate(`/customers/${item.id}/edit`) },
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Customers</h2>
        </div>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card customer-filter-bar">
        <input
          aria-label="Search customers"
          className="text-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search customer name, email, phone, reference, or address"
        />
        <select aria-label="Filter customers by contact completeness" value={contactFilter} onChange={(event) => setContactFilter(event.target.value as "all" | "email" | "phone" | "address")}>
          <option value="all">All customers</option>
          <option value="email">Has email</option>
          <option value="phone">Has phone</option>
          <option value="address">Has billing address</option>
        </select>
      </div>
      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Saved customers</h3>
            <div className="page-meta-row page-meta-row-inline" aria-label="Customer summary">
              <div className="page-meta-chips">
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Total</span>
                  <strong className="page-meta-chip-value">{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Email</span>
                  <strong className="page-meta-chip-value">{customersWithEmail}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Bill To</span>
                  <strong className="page-meta-chip-value">{customersWithAddress}</strong>
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="button button-primary" onClick={() => navigate("/customers/new")}>Add customer</button>
        </div>
        {searchQuery || contactFilter !== "all" ? (
          <HelperText>{`${filteredItems.length} matching customer${filteredItems.length === 1 ? "" : "s"} found.`}</HelperText>
        ) : null}
        {error ? <HelperText tone="error">{error}</HelperText> : null}
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.name}</strong>
                  <div className="eyebrow">{item.externalReference || "No external reference"}</div>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getCustomerActions(item)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-summary">
                <div className="subscription-mobile-amount">{item.email || "-"}</div>
                <div className="subscription-mobile-cadence">{item.phoneNumber || "Phone not set"}</div>
              </div>
              <div className="subscription-mobile-card-topline">
                <span className={`subscription-mobile-status ${item.billingAddress ? "subscription-mobile-status-active" : "subscription-mobile-status-inactive"}`}>
                  {item.billingAddress ? "Bill To Ready" : "Address Missing"}
                </span>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Email</span>
                  <span className="subscription-mobile-meta-value">{item.email || "-"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Phone</span>
                  <span className="subscription-mobile-meta-value">{item.phoneNumber || "Phone not set"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Reference</span>
                  <span className="subscription-mobile-meta-value">{item.externalReference || "-"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Billing</span>
                  <span className="subscription-mobile-meta-value">{item.billingAddress || "Billing address not set"}</span>
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
            <table className="catalog-table subscription-table customer-table">
            <thead>
              <tr>
                <th className="sticky-cell sticky-cell-left">Name</th>
                <th>Contact</th>
                <th>Reference</th>
                <th>Billing</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={4}
                  title="No customers yet"
                  description="Add the people or businesses you bill so they can receive subscriptions, invoices, and payment links."
                  actions={(
                    <>
                      <button type="button" className="button button-primary" onClick={() => navigate("/customers/new")}>Add first customer</button>
                      <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                    </>
                  )}
                />
              ) : filteredItems.length === 0 ? (
                <EmptyTableRow
                  colSpan={4}
                  title="No matching customers"
                  description="Try a different keyword or relax the filter to see more customer records."
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td className="sticky-cell sticky-cell-left table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <div className="stack">
                        <span>{item.name}</span>
                        <div className="eyebrow">{item.externalReference || "No external reference"}</div>
                      </div>
                      <RowActionMenu items={getCustomerActions(item)} />
                    </div>
                  </td>
                  <td>
                    <div>{item.email || "-"}</div>
                    <div className="eyebrow">{item.phoneNumber || "Phone not set"}</div>
                  </td>
                  <td>{item.externalReference || "-"}</td>
                  <td>{item.billingAddress || "-"}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
        </div>
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      {selectedCustomer ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div className="card invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Customer detail</p>
                <h3 id="customer-detail-title">{selectedCustomer.name}</h3>
                <p className="muted">{selectedCustomer.externalReference || "No external reference"}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat"><p className="eyebrow">Email</p><strong>{selectedCustomer.email || "-"}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Phone</p><strong>{selectedCustomer.phoneNumber || "-"}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Reference</p><strong>{selectedCustomer.externalReference || "-"}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Billing address</p><strong>{selectedCustomer.billingAddress ? "Saved" : "Not set"}</strong></div>
                </div>
                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Contact</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Name</span><strong>{selectedCustomer.name}</strong></div>
                        <div className="invoice-detail-list-row"><span>Email</span><strong>{selectedCustomer.email || "-"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Phone</span><strong>{selectedCustomer.phoneNumber || "-"}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="invoice-detail-aside">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Billing</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>External reference</span><strong>{selectedCustomer.externalReference || "-"}</strong></div>
                        <div className="invoice-detail-list-row invoice-detail-list-row-top"><span>Bill to address</span><strong className="invoice-detail-align-right">{selectedCustomer.billingAddress || "-"}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
