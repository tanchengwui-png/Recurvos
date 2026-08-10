import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { api } from "../lib/api";
import { formatCompanyAddress, getCompanyAddressTitle, parseLegacyCompanyAddress } from "../lib/companyAddresses";
import type { CompanyLookup, FeatureAccess, PlatformPackage } from "../types";

function getCompanyInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "CO";
}

export function CompaniesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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
      { label: "View details", onClick: () => setExpandedId(item.id) },
      { label: "Edit company", onClick: () => navigate(`/companies/${item.id}/edit`) },
    ];
  }

  const activeCompanies = items.filter((item) => item.isActive).length;
  const incompleteCompanies = items.filter((item) => !item.phone || !item.registrationNumber || !item.tin).length;
  const selectedCompanyAddresses = selectedCompany
    ? (selectedCompany.addresses.length > 0 ? selectedCompany.addresses : (() => {
        const legacyAddress = parseLegacyCompanyAddress(selectedCompany.address);
        return legacyAddress ? [legacyAddress] : [];
      })())
    : [];

  return (
    <div className="page companies-page">
      <div className="companies-filter-card">
        <label className="companies-filter-field companies-search">
          <span>Search</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
          <input aria-label="Search companies" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search company name, registration, email, phone, or address" />
        </label>
        <label className="companies-filter-field"><span>Status</span><select aria-label="Filter companies by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="companies-filter-field"><span>Logo</span><select aria-label="Filter companies by logo" value={logoFilter} onChange={(event) => setLogoFilter(event.target.value as "all" | "with-logo" | "without-logo")}><option value="all">All logos</option><option value="with-logo">With logo</option><option value="without-logo">Without logo</option></select></label>
      </div>
      <section className="companies-list-card">
        <div className="companies-list-header">
          <div className="companies-summary" aria-label="Company summary">
            <h3>Companies</h3>
            <span className="companies-summary-chip" title={packageLimit !== null ? `Plan limit: ${packageLimit <= 0 ? "Unlimited" : packageLimit}` : undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16M8 8h1m6 0h1M8 12h1m6 0h1M8 16h1m6 0h1" /><path d="M2 21h20" /></svg>Companies <strong>{items.length}</strong></span>
            <span className="companies-summary-chip"><i className="companies-active-dot" aria-hidden="true" />Active <strong>{activeCompanies}</strong></span>
            <span className="companies-summary-chip companies-summary-chip-warning"><span aria-hidden="true">△</span>Setup incomplete <strong>{incompleteCompanies}</strong></span>
          </div>
          <button type="button" className="companies-add-button" onClick={() => navigate("/companies/new")}><span aria-hidden="true">+</span>Add company</button>
        </div>
        {items.length === 0 ? (
          <div className="companies-empty-state"><div aria-hidden="true">⌂</div><h3>No companies yet</h3><p>Add your first company to start managing invoices, subscriptions and payments.</p><button type="button" className="companies-add-button" onClick={() => navigate("/companies/new")}>Add company</button></div>
        ) : filteredItems.length === 0 ? (
          <div className="companies-empty-state"><h3>No matching companies</h3><p>Try a different search term or relax the filters to see your company profiles.</p></div>
        ) : (
          <div className="companies-table-wrapper">
            <table className="companies-table">
              <colgroup><col className="companies-col-company" /><col className="companies-col-registration" /><col className="companies-col-fye" /><col className="companies-col-tax" /><col className="companies-col-outstanding" /><col className="companies-col-activity" /><col className="companies-col-action" /></colgroup>
              <thead><tr><th>Company</th><th>Registration No.</th><th>Financial Year End</th><th>Tax Status</th><th>Outstanding</th><th>Last Activity</th><th>Action</th></tr></thead>
              <tbody>{pagination.pagedItems.map((item) => {
                const taxReady = Boolean(item.tin);
                return <tr key={item.id}>
                  <td><div className="company-cell"><div className="company-avatar" aria-label={item.hasLogo ? "Company logo available" : "Company initials"}>{getCompanyInitials(item.name)}</div><div className="company-identity"><div className="company-name">{item.name}</div><div className="company-email" title={item.email || "Email not set"}>{item.email || "Email not set"}</div>{!item.phone ? <span className="company-warning"><span aria-hidden="true">△</span>Phone missing</span> : null}</div></div></td>
                  <td><div className="company-data-primary">{item.registrationNumber || "Not set"}</div><div className="company-data-secondary">{item.registrationNumberType || "Not set"}</div></td>
                  <td><div className="company-data-primary">Not set</div><div className="company-data-secondary">Financial year unavailable</div></td>
                  <td><span className={`company-status ${taxReady ? "company-status-active" : "company-status-incomplete"}`}>{taxReady ? "Active" : "Not set"}</span><div className="company-data-secondary">{taxReady ? "TIN on file" : "Tax profile incomplete"}</div></td>
                  <td><div className="company-amount">Not available</div><div className="company-data-secondary">Outstanding unavailable</div></td>
                  <td><div className="company-data-primary">No activity</div><div className="company-data-secondary">Timestamp unavailable</div></td>
                  <td><RowActionMenu items={getCompanyActions(item)} label="Manage" /></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        <div className="companies-pagination"><TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} /></div>
      </section>
      {selectedCompany ? (
        <div className="modal-backdrop product-preview-backdrop" role="presentation" onClick={() => setExpandedId(null)}>
          <div
            className="card product-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="product-preview-modal-header">
              <div>
                <p className="eyebrow">Company detail</p>
                <h3 id="company-detail-title">{selectedCompany.name}</h3>
                <p className="muted">{selectedCompany.registrationNumber || "Registration number not set"}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>
            <div className="product-preview-modal-body">
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
