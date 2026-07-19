import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import { formatCompanyAddress, getCompanyAddressTitle, parseLegacyCompanyAddress } from "../lib/companyAddresses";
import type { CompanyLookup, FeatureAccess, PlatformPackage } from "../types";

export function CompaniesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<CompanyLookup[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLogoUrl, setExpandedLogoUrl] = useState("");
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
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
        item.oldRegistrationNumber,
        item.email,
        item.phone,
        item.address,
      ].some((value) => value?.toLowerCase().includes(normalizedSearchQuery));

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
    const removedCompanyId = state && typeof state === "object" && "removedCompanyId" in state && typeof state.removedCompanyId === "string"
      ? state.removedCompanyId
      : null;

    if (removedCompanyId) {
      setItems((current) => current.filter((item) => item.id !== removedCompanyId));
      setExpandedId((current) => current === removedCompanyId ? null : current);
    }

    if ((!flashMessage || typeof flashMessage !== "string") && !removedCompanyId) {
      return;
    }

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

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    async function loadLogoPreview() {
      if (!selectedCompany?.hasLogo) {
        if (isActive) {
          setExpandedLogoUrl("");
        }
        return;
      }

      try {
        const response = await api.download(`/companies/${selectedCompany.id}/logo`);
        objectUrl = URL.createObjectURL(response.blob);
        if (isActive) {
          setExpandedLogoUrl(objectUrl);
        }
      } catch {
        if (isActive) {
          setExpandedLogoUrl("");
        }
      }
    }

    void loadLogoPreview();

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedCompany?.hasLogo, selectedCompany?.id]);

  function getCompanyActions(item: CompanyLookup) {
    return [
      { label: expandedId === item.id ? "Hide details" : "View details", onClick: () => setExpandedId((current) => current === item.id ? null : item.id) },
      { label: "Edit company", onClick: () => navigate(`/companies/${item.id}/edit`) },
    ];
  }

  const activeCompanies = items.filter((item) => item.isActive).length;
  const companiesWithLogo = items.filter((item) => item.hasLogo).length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);
  const selectedCompanyAddresses = selectedCompany
    ? (selectedCompany.addresses.length > 0 ? selectedCompany.addresses : (() => {
        const legacyAddress = parseLegacyCompanyAddress(selectedCompany.address);
        return legacyAddress ? [legacyAddress] : [];
      })())
    : [];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Companies</h2>
        </div>
      </header>
      <div className="catalog-toolbar card subtle-card company-filter-bar">
        <label className="form-label company-filter-search">
          Search
          <input
            aria-label="Search companies"
            className="text-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search company name, registration, email, phone, or address"
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
          Logo
          <select aria-label="Filter companies by logo" value={logoFilter} onChange={(event) => setLogoFilter(event.target.value as "all" | "with-logo" | "without-logo")}>
            <option value="all">All logos</option>
            <option value="with-logo">With logo</option>
            <option value="without-logo">Without logo</option>
          </select>
        </label>
      </div>
      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Companies</h3>
            <div className="page-meta-row page-meta-row-inline" aria-label="Company summary">
              <div className="page-meta-chips">
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Profiles</span>
                  <strong className="page-meta-chip-value">{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Active</span>
                  <strong className="page-meta-chip-value">{activeCompanies}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Logos</span>
                  <strong className="page-meta-chip-value">{companiesWithLogo}</strong>
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="button button-primary" onClick={() => navigate("/companies/new")}>Add company</button>
        </div>
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.name}</strong>
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
                <th className="company-actions-column">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={4}
                  title="No companies yet"
                  description="Start by adding the business entity that will appear on invoices, reminders, and payment records."
                  actions={(
                    <>
                      <button type="button" className="button button-primary" onClick={() => navigate("/companies/new")}>Create first company</button>
                      <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                    </>
                  )}
                />
              ) : filteredItems.length === 0 ? (
                <EmptyTableRow
                  colSpan={4}
                  title="No matching companies"
                  description="Try a different search term or relax the filters to see more billing profiles."
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td className="sticky-cell sticky-cell-left table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <span>{item.name}</span>
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
                  <td className="actions-cell company-actions-column"><RowActionMenu items={getCompanyActions(item)} /></td>
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
                <div className="company-detail-hero">
                  <div className="company-detail-logo-card">
                    {expandedLogoUrl ? (
                      <img src={expandedLogoUrl} alt={`${selectedCompany.name} logo`} className="company-detail-logo-image" />
                    ) : (
                      <div className="company-detail-logo-placeholder">
                        <strong>{selectedCompany.hasLogo ? "Logo unavailable" : "No logo uploaded"}</strong>
                        <span>{selectedCompany.hasLogo ? "The saved company logo could not be previewed right now." : "A company logo has not been added yet."}</span>
                      </div>
                    )}
                  </div>
                  <div className="company-detail-hero-copy">
                    <div>
                      <p className="eyebrow">Company overview</p>
                      <h3>{selectedCompany.legalName || selectedCompany.name}</h3>
                      <p className="muted">{selectedCompany.registrationNumber || "Registration number not set"}</p>
                    </div>
                    <div className="invoice-detail-summary company-detail-summary">
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
                  </div>
                </div>
                <div className="company-detail-sections">
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Company Information</p></div>
                    <div className="company-detail-grid">
                      <div className="company-detail-item"><span>Company Name</span><strong>{selectedCompany.name || "-"}</strong></div>
                      <div className="company-detail-item"><span>Legal Name</span><strong>{selectedCompany.legalName || "-"}</strong></div>
                      <div className="company-detail-item"><span>Registration Number Type</span><strong>{selectedCompany.registrationNumberType || "-"}</strong></div>
                      <div className="company-detail-item"><span>Registration Number</span><strong>{selectedCompany.registrationNumber || "-"}</strong></div>
                      <div className="company-detail-item"><span>Old Registration Number</span><strong>{selectedCompany.oldRegistrationNumber || "-"}</strong></div>
                      <div className="company-detail-item"><span>MSIC Code</span><strong>{selectedCompany.msicCode || "-"}</strong></div>
                      <div className="company-detail-item"><span>Industry</span><strong>{selectedCompany.industry || "-"}</strong></div>
                      <div className="company-detail-item"><span>TIN</span><strong>{selectedCompany.tin || "-"}</strong></div>
                      <div className="company-detail-item"><span>Nature of Business</span><strong>{selectedCompany.natureOfBusiness || "-"}</strong></div>
                      <div className="company-detail-item"><span>Status</span><strong>{selectedCompany.isActive ? "Active" : "Inactive"}</strong></div>
                    </div>
                  </div>
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Contact</p></div>
                    <div className="company-detail-grid">
                      <div className="company-detail-item"><span>Email</span><strong>{selectedCompany.email || "-"}</strong></div>
                      <div className="company-detail-item"><span>Phone</span><strong>{selectedCompany.phone || "-"}</strong></div>
                    </div>
                  </div>
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Addresses</p></div>
                    <div className="company-detail-address-list">
                      {selectedCompanyAddresses.length > 0 ? selectedCompanyAddresses.map((address, index) => (
                        <article key={address.id} className="company-detail-address-card">
                          <div className="company-detail-address-card-header">
                            <div className="company-detail-address-card-heading">
                              <strong>{getCompanyAddressTitle(address, index)}</strong>
                              {address.isDefaultBilling ? <span className="status-pill status-pill-active status-pill-compact">Billing Default</span> : null}
                              {address.isDefaultShipping ? <span className="status-pill status-pill-active status-pill-compact">Shipping Default</span> : null}
                            </div>
                          </div>
                          <p className="company-detail-address-line">{formatCompanyAddress(address) || "-"}</p>
                        </article>
                      )) : <p className="muted">No addresses saved.</p>}
                    </div>
                  </div>
                  <div className="invoice-detail-block">
                    <div className="invoice-detail-block-header"><p className="eyebrow">Other Information</p></div>
                    <div className="company-detail-grid">
                      <div className="company-detail-item"><span>Home Country</span><strong>{selectedCompany.homeCountry || "-"}</strong></div>
                      <div className="company-detail-item"><span>Home Currency</span><strong>{selectedCompany.homeCurrency || "-"}</strong></div>
                      <div className="company-detail-item"><span>Tourism Tax Registration Number</span><strong>{selectedCompany.tourismTaxRegistrationNumber || "-"}</strong></div>
                      <div className="company-detail-item"><span>Logo Status</span><strong>{selectedCompany.hasLogo ? "Uploaded" : "Not uploaded"}</strong></div>
                      <div className="company-detail-item company-detail-item-wide"><span>Company ID</span><strong>{selectedCompany.id}</strong></div>
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
