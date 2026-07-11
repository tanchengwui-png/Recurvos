import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useClientPagination } from "../hooks/useClientPagination";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { Customer, FeatureAccess, PlatformPackage } from "../types";

const contactTypeOptions: Customer["contactType"][] = ["Customer", "Supplier", "Employee"];
const statusOptions: Customer["status"][] = ["Active", "Inactive", "Archived"];

function parseContactTypes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getContactStatusClassName(status: Customer["status"]) {
  if (status === "Active") {
    return "status-pill-active";
  }

  if (status === "Archived") {
    return "status-pill-danger";
  }

  return "status-pill-inactive";
}

function buildCustomerPayload(customer: Customer) {
  return {
    name: customer.name,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    externalReference: customer.externalReference,
    billingAddress: customer.billingAddress,
    entityType: customer.entityType,
    legalName: customer.legalName,
    otherName: customer.otherName,
    registrationNumberType: customer.registrationNumberType,
    registrationNumber: customer.registrationNumber,
    oldRegistrationNumber: customer.oldRegistrationNumber,
    tin: customer.tin,
    sstRegistrationNumber: customer.sstRegistrationNumber,
    contactType: customer.contactType,
    status: customer.status,
    contactPersons: customer.contactPersons,
    phoneNumbers: customer.phoneNumbers,
    emailAddresses: customer.emailAddresses,
    addresses: customer.addresses,
    receivableAccount: customer.receivableAccount,
    creditLimit: customer.creditLimit ?? null,
    payableAccount: customer.payableAccount,
    groups: customer.groups,
    priceLevel: customer.priceLevel,
    currency: customer.currency,
    paymentTerm: customer.paymentTerm,
    incomeAccount: customer.incomeAccount,
    expenseAccount: customer.expenseAccount,
    location: customer.location,
    tags: customer.tags,
    myInvoisControl: customer.myInvoisControl,
  };
}

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
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; action: () => Promise<void> } | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [contactTypeFilter, setContactTypeFilter] = useState<Customer["contactType"] | "all">(() => {
    const value = searchParams.get("type");
    return contactTypeOptions.includes(value as Customer["contactType"]) ? value as Customer["contactType"] : "all";
  });
  const [statusFilter, setStatusFilter] = useState<Customer["status"] | "all">(() => {
    const value = searchParams.get("status");
    return statusOptions.includes(value as Customer["status"]) ? value as Customer["status"] : "all";
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

    if (contactTypeFilter !== "all" && !parseContactTypes(item.contactType).includes(contactTypeFilter)) {
      return false;
    }

    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const pagination = useClientPagination(filteredItems, [filteredItems.length, searchQuery, contactTypeFilter, statusFilter]);
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

    nextParams.delete("contact");

    if (contactTypeFilter !== "all") {
      nextParams.set("type", contactTypeFilter);
    } else {
      nextParams.delete("type");
    }

    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    } else {
      nextParams.delete("status");
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [contactTypeFilter, searchQuery, searchParams, setSearchParams, statusFilter]);

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

  const contactsWithEmail = items.filter((item) => item.email).length;
  const activeContacts = items.filter((item) => item.status === "Active").length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);
  function getPrimaryContactPerson(item: Customer) {
    const primary = item.contactPersons.find((person) => person.name.trim());
    if (!primary) {
      return "-";
    }

    const additionalCount = item.contactPersons.filter((person) => person.name.trim()).length - 1;
    return additionalCount > 0 ? `${primary.name} +${additionalCount}` : primary.name;
  }

  function getCustomerActions(item: Customer) {
    const contactTypes = parseContactTypes(item.contactType);
    const canViewStatement = contactTypes.some((type) => type === "Customer" || type === "Supplier");
    const nextStatus = item.status === "Active" ? "Inactive" : "Active";
    const statusActionLabel = item.status === "Active" ? "Deactivate" : "Activate";

    return [
      { label: "View", onClick: () => setExpandedId((current) => current === item.id ? null : item.id) },
      { label: "Edit", onClick: () => navigate(`/customers/${item.id}/edit`) },
      ...(canViewStatement ? [{ label: "Statement of Account", onClick: () => navigate(`/customers/${item.id}/statement`) }] : []),
      {
        label: statusActionLabel,
        onClick: () => setConfirmState({
          title: `${statusActionLabel} contact`,
          description: `${statusActionLabel} ${item.legalName || item.name}?`,
          confirmLabel: statusActionLabel,
          action: async () => {
            const updated = await api.put<Customer>(`/customers/${item.id}`, {
              ...buildCustomerPayload(item),
              status: nextStatus,
            });
            setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
            setMessage(`${updated.legalName || updated.name} is now ${updated.status.toLowerCase()}.`);
            setConfirmState(null);
          },
        }),
      },
      {
        label: "Delete",
        tone: "danger" as const,
        onClick: () => setConfirmState({
          title: "Delete contact",
          description: `Delete ${item.legalName || item.name}? This action cannot be undone.`,
          confirmLabel: "Delete",
          action: async () => {
            await api.delete(`/customers/${item.id}`);
            setItems((current) => current.filter((entry) => entry.id !== item.id));
            setExpandedId((current) => current === item.id ? null : current);
            setMessage(`${item.legalName || item.name} was deleted.`);
            setConfirmState(null);
          },
        }),
      },
    ];
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Contacts</h2>
        </div>
      </header>
      {message ? <HelperText>{message}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card customer-filter-bar">
        <input
          aria-label="Search contacts"
          className="text-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search contact name, email, phone, reference, or address"
        />
        <select aria-label="Filter contacts by type" value={contactTypeFilter} onChange={(event) => setContactTypeFilter(event.target.value as Customer["contactType"] | "all")}>
          <option value="all">All contact types</option>
          {contactTypeOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select aria-label="Filter contacts by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Customer["status"] | "all")}>
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Saved contacts</h3>
            <div className="page-meta-row page-meta-row-inline" aria-label="Contact summary">
              <div className="page-meta-chips">
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Total</span>
                  <strong className="page-meta-chip-value">{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Email</span>
                  <strong className="page-meta-chip-value">{contactsWithEmail}</strong>
                </span>
                <span className="page-meta-chip">
                  <span className="page-meta-chip-label">Active</span>
                  <strong className="page-meta-chip-value">{activeContacts}</strong>
                </span>
              </div>
            </div>
          </div>
          <div className="contact-page-actions">
            <button type="button" className="button button-secondary" onClick={() => navigate("/contact-groups")}>Contact Groups</button>
            <button type="button" className="button button-primary" onClick={() => navigate("/customers/new")}>Add contact</button>
          </div>
        </div>
        {searchQuery || contactTypeFilter !== "all" || statusFilter !== "all" ? (
          <HelperText>{`${filteredItems.length} matching contact${filteredItems.length === 1 ? "" : "s"} found.`}</HelperText>
        ) : null}
        {error ? <HelperText tone="error">{error}</HelperText> : null}
        <div className="subscription-mobile-list">
          {pagination.pagedItems.map((item) => (
            <article key={item.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{item.legalName || item.name}</strong>
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
                <span className={`status-pill ${getContactStatusClassName(item.status)}`}>{item.status}</span>
                <span className="badge">{parseContactTypes(item.contactType).join(", ") || item.contactType}</span>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Type</span>
                  <span className="subscription-mobile-meta-value">{parseContactTypes(item.contactType).join(", ") || item.contactType}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Status</span>
                  <span className="subscription-mobile-meta-value">{item.status}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Email</span>
                  <span className="subscription-mobile-meta-value">{item.email || "-"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Phone</span>
                  <span className="subscription-mobile-meta-value">{item.phoneNumber || "Phone not set"}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Contact Person</span>
                  <span className="subscription-mobile-meta-value">{getPrimaryContactPerson(item)}</span>
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
                <th className="sticky-cell sticky-cell-left contact-name-column">Name</th>
                <th className="contact-type-column">Contact Type</th>
                <th className="contact-person-column">Contact Person</th>
                <th className="contact-phone-column">Phone</th>
                <th className="contact-email-column">Email</th>
                <th className="contact-status-column">Status</th>
                <th className="contact-actions-column" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={7}
                  title="No contacts yet"
                  description="Add customers, suppliers, and employees here so you can manage billing contacts and internal records from one place."
                  actions={(
                    <>
                      <button type="button" className="button button-primary" onClick={() => navigate("/customers/new")}>Add first contact</button>
                      <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                    </>
                  )}
                />
              ) : filteredItems.length === 0 ? (
                <EmptyTableRow
                  colSpan={7}
                  title="No matching contacts"
                  description="Try a different keyword or relax the filters to see more contact records."
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  <td className="sticky-cell sticky-cell-left table-primary-cell">
                    <div className="table-primary-cell-stack">
                      <span>{item.legalName || item.name}</span>
                    </div>
                  </td>
                  <td className="contact-type-column"><span className="badge">{parseContactTypes(item.contactType).join(", ") || item.contactType}</span></td>
                  <td className="contact-person-column">{getPrimaryContactPerson(item)}</td>
                  <td className="contact-phone-column">{item.phoneNumber || "Phone not set"}</td>
                  <td className="contact-email-column">{item.email || "-"}</td>
                  <td className="contact-status-column"><span className={`status-pill ${getContactStatusClassName(item.status)}`}>{item.status}</span></td>
                  <td className="actions-cell contact-actions-column"><RowActionMenu items={getCustomerActions(item)} /></td>
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
                <p className="eyebrow">Contact detail</p>
                <h3 id="customer-detail-title">{selectedCustomer.name}</h3>
                <p className="muted">{selectedCustomer.externalReference || "No external reference"}</p>
              </div>
              <button type="button" className="button button-secondary button-compact" onClick={() => setExpandedId(null)}>Close</button>
            </div>
            <div className="invoice-detail-drawer-body">
              <div className="invoice-detail-panel">
                <div className="invoice-detail-summary">
                  <div className="invoice-detail-stat"><p className="eyebrow">Type</p><strong>{parseContactTypes(selectedCustomer.contactType).join(", ") || selectedCustomer.contactType}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Status</p><strong>{selectedCustomer.status}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Email</p><strong>{selectedCustomer.email || "-"}</strong></div>
                  <div className="invoice-detail-stat"><p className="eyebrow">Phone</p><strong>{selectedCustomer.phoneNumber || "-"}</strong></div>
                </div>
                <div className="invoice-detail-layout">
                  <div className="invoice-detail-main">
                    <div className="invoice-detail-block">
                      <div className="invoice-detail-block-header"><p className="eyebrow">Contact</p></div>
                      <div className="invoice-detail-list">
                        <div className="invoice-detail-list-row"><span>Name</span><strong>{selectedCustomer.name}</strong></div>
                        <div className="invoice-detail-list-row"><span>Type</span><strong>{parseContactTypes(selectedCustomer.contactType).join(", ") || selectedCustomer.contactType}</strong></div>
                        <div className="invoice-detail-list-row"><span>Status</span><strong>{selectedCustomer.status}</strong></div>
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
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? "Confirm"}
        onConfirm={async () => {
          await confirmState?.action();
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
