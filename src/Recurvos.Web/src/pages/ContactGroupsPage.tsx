import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { ContactGroup, Customer } from "../types";

const contactTypeOptions = ["Customer", "Supplier", "Employee"] as const;

type EditorState = {
  id: string | null;
  name: string;
  selectedContactIds: string[];
};

function parseContactTypes(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    selectedContactIds: [],
  };
}

export function ContactGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Customer[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState<Customer["contactType"] | "all">("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    const [groupList, contactList] = await Promise.all([
      api.get<ContactGroup[]>("/contact-groups"),
      api.get<Customer[]>("/customers"),
    ]);

    setGroups(groupList);
    setContacts(contactList);
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedContactIdSet = useMemo(() => new Set(editor.selectedContactIds), [editor.selectedContactIds]);

  const filteredContacts = contacts.filter((contact) => {
    if (showSelectedOnly && !selectedContactIdSet.has(contact.id)) {
      return false;
    }

    if (contactTypeFilter !== "all" && !parseContactTypes(contact.contactType).includes(contactTypeFilter)) {
      return false;
    }

    const normalizedSearch = contactSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return true;
    }

    return [
      contact.legalName || contact.name,
      contact.email,
      contact.phoneNumber,
      contact.externalReference,
      contact.billingAddress,
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  const pagination = useClientPagination(filteredContacts, [filteredContacts.length, contactSearch, contactTypeFilter, showSelectedOnly, editor.selectedContactIds.join(",")], 10);

  function openCreate() {
    setEditor(emptyEditor());
    setError("");
    setMessage("");
    setIsEditorOpen(true);
  }

  function openEdit(group: ContactGroup) {
    setEditor({
      id: group.id,
      name: group.name,
      selectedContactIds: [...group.contactIds],
    });
    setError("");
    setMessage("");
    setIsEditorOpen(true);
  }

  function resetEditor() {
    setEditor(emptyEditor());
    setContactSearch("");
    setContactTypeFilter("all");
    setShowSelectedOnly(false);
    setIsEditorOpen(false);
  }

  function toggleContact(contactId: string, checked: boolean) {
    setEditor((current) => ({
      ...current,
      selectedContactIds: checked
        ? [...current.selectedContactIds, contactId].filter((value, index, values) => values.indexOf(value) === index)
        : current.selectedContactIds.filter((id) => id !== contactId),
    }));
  }

  function togglePageSelection(checked: boolean) {
    setEditor((current) => ({
      ...current,
      selectedContactIds: checked
        ? [...new Set([...current.selectedContactIds, ...pagination.pagedItems.map((item) => item.id)])]
        : current.selectedContactIds.filter((id) => !pagination.pagedItems.some((item) => item.id === id)),
    }));
  }

  async function submit() {
    setError("");
    const payload = {
      name: editor.name.trim(),
      contactIds: editor.selectedContactIds,
    };

    if (!payload.name) {
      setError("Group name is required.");
      return;
    }

    try {
      if (editor.id) {
        await api.put(`/contact-groups/${editor.id}`, payload);
        setMessage(`Contact group updated: ${payload.name}.`);
      } else {
        await api.post("/contact-groups", payload);
        setMessage(`Contact group created: ${payload.name}.`);
      }

      await load();
      resetEditor();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save contact group.");
    }
  }

  function requestDelete(group: ContactGroup) {
    setConfirmState({
      title: "Delete contact group",
      description: `Delete ${group.name}? Contacts will remain in the system.`,
      action: async () => {
        await api.delete(`/contact-groups/${group.id}`);
        await load();
        if (editor.id === group.id) {
          resetEditor();
        }
        setMessage(`Contact group deleted: ${group.name}.`);
      },
    });
  }

  function getGroupActions(group: ContactGroup) {
    return [
      { label: "Edit group", onClick: () => openEdit(group) },
      { label: "Delete group", onClick: () => requestDelete(group) },
    ];
  }

  const pageFullySelected = pagination.pagedItems.length > 0 && pagination.pagedItems.every((item) => selectedContactIdSet.has(item.id));

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Contact Groups</h2>
          <p className="muted">Create reusable groups, manage membership, and assign them from the Contacts module.</p>
        </div>
        <button type="button" className="button button-primary" onClick={openCreate}>Create contact group</button>
      </header>

      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="card">
        <div className="card-section-header">
          <div className="section-header-cluster">
            <h3 className="section-title">Saved contact groups</h3>
          </div>
          <div className="page-meta-row page-meta-row-inline">
            <div className="page-meta-chips">
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Groups</span>
                <strong className="page-meta-chip-value">{groups.length}</strong>
              </span>
              <span className="page-meta-chip">
                <span className="page-meta-chip-label">Selected</span>
                <strong className="page-meta-chip-value">{editor.selectedContactIds.length}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="subscription-mobile-list">
          {groups.map((group) => (
            <article key={group.id} className="subscription-mobile-card">
              <div className="subscription-mobile-card-header">
                <div className="subscription-mobile-identity">
                  <strong>{group.name}</strong>
                  <div className="eyebrow">{group.contactsCount} contact{group.contactsCount === 1 ? "" : "s"}</div>
                </div>
                <div className="subscription-mobile-actions">
                  <RowActionMenu items={getGroupActions(group)} label="More" />
                </div>
              </div>
              <div className="subscription-mobile-meta">
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Created</span>
                  <span className="subscription-mobile-meta-value">{new Date(group.createdAtUtc).toLocaleDateString()}</span>
                </div>
                <div className="subscription-mobile-meta-row">
                  <span className="subscription-mobile-meta-label">Updated</span>
                  <span className="subscription-mobile-meta-value">{group.updatedAtUtc ? new Date(group.updatedAtUtc).toLocaleDateString() : "-"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table customer-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Number of Contacts</th>
                <th>Created Date</th>
                <th>Last Updated Date</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <EmptyTableRow
                  colSpan={5}
                  title="No contact groups yet"
                  description="Create groups to organize customers, suppliers, and employees separately from the contact form."
                  actions={<button type="button" className="button button-primary" onClick={openCreate}>Create first group</button>}
                />
              ) : groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td>{group.contactsCount}</td>
                  <td>{new Date(group.createdAtUtc).toLocaleDateString()}</td>
                  <td>{group.updatedAtUtc ? new Date(group.updatedAtUtc).toLocaleDateString() : "-"}</td>
                  <td className="actions-cell"><RowActionMenu items={getGroupActions(group)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isEditorOpen ? (
        <section className="card contact-group-editor-card">
          <div className="card-section-header">
            <div className="section-header-cluster">
              <h3 className="section-title">{editor.id ? "Edit contact group" : "Create contact group"}</h3>
            </div>
            <div className="contact-page-actions">
              <button type="button" className="button button-secondary" onClick={resetEditor}>Cancel</button>
              <button type="button" className="button button-primary" onClick={() => void submit()}>{editor.id ? "Update group" : "Save group"}</button>
            </div>
          </div>

          <div className="company-profile-fields-grid">
            <label className="form-label company-profile-field company-profile-field-wide">
              Group Name
              <input className="text-input" value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} placeholder="Enter group name" />
            </label>
          </div>

          <section className="contact-selection-panel">
            <div className="company-profile-address-header">
              <h4 className="section-title">Contact Selection</h4>
              <p className="muted">Search, filter, and assign multiple contacts to this group.</p>
            </div>

            <div className="catalog-toolbar card subtle-card contact-selection-toolbar">
              <input
                aria-label="Search contacts for grouping"
                className="text-input"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="Search legal name, email, telephone, reference, or address"
              />
              <select aria-label="Filter contacts by type" value={contactTypeFilter} onChange={(event) => setContactTypeFilter(event.target.value as Customer["contactType"] | "all")}>
                <option value="all">All contact types</option>
                {contactTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <label className="contact-selection-toggle">
                <input type="checkbox" checked={showSelectedOnly} onChange={(event) => setShowSelectedOnly(event.target.checked)} />
                <span>Show only selected contacts</span>
              </label>
              <button type="button" className="button button-secondary" onClick={() => setEditor((current) => ({ ...current, selectedContactIds: [] }))}>Clear selection</button>
            </div>

            <div className="table-scroll table-scroll-bounded">
              <table className="catalog-table customer-table contact-selection-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" aria-label="Select all contacts on this page" checked={pageFullySelected} onChange={(event) => togglePageSelection(event.target.checked)} />
                    </th>
                    <th>Legal Name</th>
                    <th>Type</th>
                    <th>Email</th>
                    <th>Telephone</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 ? (
                    <EmptyTableRow
                      colSpan={5}
                      title="No contacts available"
                      description="Create contacts first before assigning them to a group."
                      actions={<button type="button" className="button button-primary" onClick={() => navigate("/customers/new")}>Add contact</button>}
                    />
                  ) : filteredContacts.length === 0 ? (
                    <EmptyTableRow
                      colSpan={5}
                      title="No matching contacts"
                      description="Try a different search term or filter to find contacts for this group."
                    />
                  ) : pagination.pagedItems.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <input type="checkbox" checked={selectedContactIdSet.has(contact.id)} onChange={(event) => toggleContact(contact.id, event.target.checked)} aria-label={`Select ${contact.legalName || contact.name}`} />
                      </td>
                      <td>{contact.legalName || contact.name}</td>
                      <td><span className="badge">{parseContactTypes(contact.contactType).join(", ") || contact.contactType}</span></td>
                      <td>{contact.email || "-"}</td>
                      <td>{contact.phoneNumber || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
          </section>
        </section>
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
