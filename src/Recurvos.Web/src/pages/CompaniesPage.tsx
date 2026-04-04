import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import type { CompanyLookup, FeatureAccess, PlatformPackage } from "../types";

export function CompaniesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<CompanyLookup[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(() => {
    const value = searchParams.get("status");
    return value === "active" || value === "inactive" ? value : "all";
  });
  const [logoFilter, setLogoFilter] = useState<"all" | "with-logo" | "without-logo">(() => {
    const value = searchParams.get("logo");
    return value === "with-logo" || value === "without-logo" ? value : "all";
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedSearchQuery
      || [
        item.name,
        item.registrationNumber,
        item.email,
        item.phone,
        item.address,
      ].some((value) => value.toLowerCase().includes(normalizedSearchQuery));

    if (!matchesSearch) {
      return false;
    }

    if (statusFilter === "active" && !item.isActive) {
      return false;
    }

    if (statusFilter === "inactive" && item.isActive) {
      return false;
    }

    if (logoFilter === "with-logo" && !item.hasLogo) {
      return false;
    }

    if (logoFilter === "without-logo" && item.hasLogo) {
      return false;
    }

    return true;
  });

  const pagination = useClientPagination(filteredItems, [filteredItems.length, searchQuery, statusFilter, logoFilter]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);
  const selectedCompany = expandedId ? items.find((item) => item.id === expandedId) ?? null : null;

  async function load() {
    const [companies, access, packages] = await Promise.all([
      api.get<CompanyLookup[]>("/companies"),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<PlatformPackage[]>("/public/packages").catch(() => []),
    ]);

    setItems(companies);
    setFeatureAccess(access);
    const activePackage = packages.find((item) => item.code === access?.packageCode);
    setPackageLimit(activePackage?.maxCompanies ?? null);
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

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    if (logoFilter !== "all") {
      nextParams.set("logo", logoFilter);
    } else {
      nextParams.delete("logo");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [logoFilter, searchParams, searchQuery, setSearchParams, statusFilter]);

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
    if (!selectedCompany) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedCompany) {
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
  }, [selectedCompany]);

  function getCompanyActions(item: CompanyLookup) {
    return [
      { label: expandedId === item.id ? "Hide details" : "View details", onClick: () => setExpandedId((current) => current === item.id ? null : item.id) },
      { label: "Edit company", onClick: () => navigate(`/companies/${item.id}/edit`) },
      { label: item.hasLogo ? "Update logo" : "Upload logo", onClick: () => navigate(`/companies/${item.id}/edit`) },
    ];
  }

  const activeCompanies = items.filter((item) => item.isActive).length;
  const companiesWithLogo = items.filter((item) => item.hasLogo).length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Business setup</p>
          <h2>Companies</h2>
          <p className="muted">Manage the billing profiles that appear on invoices, reminders, and payment records.</p>
          <p className="muted">
            Billing profiles used: {items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => navigate("/companies/new")}>Add company</button>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <section className="management-summary-grid">
        <article className="management-summary-card">
          <p className="eyebrow">Usage</p>
          <h3>{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</h3>
          <p className="muted">Billing profiles currently used under this subscriber account.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Active</p>
          <h3>{activeCompanies}</h3>
          <p className="muted">Companies available for invoice and subscription workflows.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Branding</p>
          <h3>{companiesWithLogo}</h3>
          <p className="muted">Billing profiles with invoice logo branding already uploaded.</p>
        </article>
      </section>
      <section className="card">
        <div className="inline-fields pwa-filter-bar company-filter-bar" style={{ marginBottom: "1rem", alignItems: "end" }}>
          <label className="form-label company-filter-search">
            Search
            <input
              aria-label="Search companies"
              className="text-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, registration, email, phone, or address"
            />
          </label>
          <label className="form-label company-filter-select">
            Status
            <select aria-label="Filter companies by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="form-label company-filter-select">
            Branding
            <select aria-label="Filter companies by branding" value={logoFilter} onChange={(event) => setLogoFilter(event.target.value as "all" | "with-logo" | "without-logo")}>
              <option value="all">All logos</option>
              <option value="with-logo">With logo</option>
              <option value="without-logo">Without logo</option>
            </select>
          </label>
        </div>
        {searchQuery || statusFilter !== "all" || logoFilter !== "all" ? (
          <HelperText>{`${filteredItems.length} matching compan${filteredItems.length === 1 ? "y" : "ies"} found.`}</HelperText>
        ) : null}
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.name}</strong>
                  <div className="eyebrow">{item.registrationNumber || "Registration number not set"}</div>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getCompanyActions(item)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-summary">
                <div className="subscription-mobile-amount">{item.email || "-"}</div>
                <div className="subscription-mobile-cadence">{item.phone || "Phone not set"}</div>
              </div>
              <div className="subscription-mobile-card-topline">
                <span className={`subscription-mobile-status ${item.isActive ? "subscription-mobile-status-active" : "subscription-mobile-status-inactive"}`}>
                  {item.isActive ? "Active" : "Inactive"}
                </span>
                <span className="subscription-mobile-inline-note">{item.hasLogo ? "Logo uploaded" : "No logo"}</span>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Email</span>
                  <span className="subscription-mobile-meta-value">{item.email || "-"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Phone</span>
                  <span className="subscription-mobile-meta-value">{item.phone || "Phone not set"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Branding</span>
                  <span className="subscription-mobile-meta-value">{item.hasLogo ? "Logo uploaded" : "No logo"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Address</span>
                  <span className="subscription-mobile-meta-value">{item.address || "Address not set"}</span>
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
            <table className="catalog-table subscription-table company-table">
            <thead>
              <tr>
                <th className="sticky-cell sticky-cell-left">Name</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Branding</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td className="sticky-cell sticky-cell-left table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <div className="stack">
                        <span>{item.name}</span>
                        <div className="eyebrow">{item.registrationNumber || "Registration number not set"}</div>
                      </div>
                      <RowActionMenu items={getCompanyActions(item)} />
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${item.isActive ? "status-pill-active" : "status-pill-inactive"}`}>
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div>{item.email || "-"}</div>
                    <div className="eyebrow">{item.phone || "Phone not set"}</div>
                  </td>
                  <td>
                    <div>{item.hasLogo ? "Logo uploaded" : "No logo"}</div>
                    <div className="eyebrow">{item.address || "Address not set"}</div>
                  </td>
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
            <h3>No companies yet</h3>
            <p className="muted">Start by adding the business entity that will appear on invoices, reminders, and payment records.</p>
            {featureAccess?.packageCode ? (
              <p className="muted">
                Package limit: {packageLimitLabel} billing profile{packageLimit === 1 ? "" : "s"} on {featureAccess.packageCode}.
              </p>
            ) : null}
            <div className="empty-state-actions">
              <button type="button" className="button button-primary" onClick={() => navigate("/companies/new")}>Create first company</button>
              <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            <h3>No matching companies</h3>
            <p className="muted">Try a different search term or relax the filters to see more billing profiles.</p>
          </div>
        ) : null}
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      {selectedCompany ? (
        <div className="modal-backdrop invoice-detail-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div
            className="card invoice-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="invoice-detail-drawer-header">
              <div>
                <p className="eyebrow">Company detail</p>
                <h3 id="company-detail-title">{selectedCompany.name}</h3>
                <p className="muted">{selectedCompany.registrationNumber || "Registration number not set"}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Status</p>
                    <strong>{selectedCompany.isActive ? "Active" : "Inactive"}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Logo</p>
                    <strong>{selectedCompany.hasLogo ? "Uploaded" : "Not uploaded"}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Email</p>
                    <strong>{selectedCompany.email || "-"}</strong>
                  </div>
                  <div className="invoice-detail-stat">
                    <p className="eyebrow">Phone</p>
                    <strong>{selectedCompany.phone || "-"}</strong>
                  </div>
                </div>
                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Profile</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Company name</span><strong>{selectedCompany.name}</strong></div>
                        <div className="invoice-detail-list-row"><span>Registration No.</span><strong>{selectedCompany.registrationNumber || "-"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Industry</span><strong>{selectedCompany.industry || "-"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Nature of business</span><strong>{selectedCompany.natureOfBusiness || "-"}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="invoice-detail-aside">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Contact</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Email</span><strong>{selectedCompany.email || "-"}</strong></div>
                        <div className="invoice-detail-list-row"><span>Phone</span><strong>{selectedCompany.phone || "-"}</strong></div>
                        <div className="invoice-detail-list-row invoice-detail-list-row-top"><span>Address</span><strong className="invoice-detail-align-right">{selectedCompany.address || "-"}</strong></div>
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
