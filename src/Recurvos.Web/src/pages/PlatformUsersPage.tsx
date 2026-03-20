import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { PlatformUser } from "../types";

type CreateAdminForm = {
  fullName: string;
  email: string;
  password: string;
};

type UserDraft = {
  role: string;
  isActive: boolean;
};

function sortUsers(items: PlatformUser[]) {
  return [...items].sort((left, right) => {
    if (left.isPlatformAccess !== right.isPlatformAccess) {
      return left.isPlatformAccess ? -1 : 1;
    }

    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    return left.fullName.localeCompare(right.fullName);
  });
}

export function PlatformUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [form, setForm] = useState<CreateAdminForm>({
    fullName: "",
    email: "",
    password: "",
  });
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState<"all" | "platform" | "subscriber">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "unverified">("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [showPlatformUsers, setShowPlatformUsers] = useState(true);
  const [showSubscriberUsers, setShowSubscriberUsers] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const result = sortUsers(await api.get<PlatformUser[]>("/platform/users"));
      setUsers(result);
      setDrafts(Object.fromEntries(result.map((user) => [user.id, { role: user.role, isActive: user.isActive }])));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load platform users.");
    }
  }

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return users.filter((user) => {
      if (accessFilter === "platform" && !user.isPlatformAccess) return false;
      if (accessFilter === "subscriber" && user.isPlatformAccess) return false;
      if (statusFilter === "active" && !user.isActive) return false;
      if (statusFilter === "inactive" && user.isActive) return false;
      if (verificationFilter === "verified" && !user.isEmailVerified) return false;
      if (verificationFilter === "unverified" && user.isEmailVerified) return false;

      if (!keyword) return true;

      return [
        user.fullName,
        user.email,
        user.companyName,
        user.isPlatformAccess ? "platform" : "subscriber",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [accessFilter, search, statusFilter, users, verificationFilter]);

  const platformUsers = filteredUsers.filter((item) => item.isPlatformAccess);
  const subscriberUsers = filteredUsers.filter((item) => !item.isPlatformAccess);

  async function createPlatformAdmin() {
    setIsCreating(true);
    setError("");
    setMessage("");

    try {
      const created = await api.post<PlatformUser>("/platform/users/platform-admin", form);
      const updated = sortUsers([created, ...users]);
      setUsers(updated);
      setDrafts((current) => ({
        ...current,
        [created.id]: { role: created.role, isActive: created.isActive },
      }));
      setForm({ fullName: "", email: "", password: "" });
      setMessage("Platform admin created.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create platform admin.");
    } finally {
      setIsCreating(false);
    }
  }

  async function sendPasswordReset(user: PlatformUser) {
    setResettingUserId(user.id);
    setError("");
    setMessage("");

    try {
      await api.post(`/platform/users/${user.id}/password-reset`);
      setMessage(`Password reset email sent to ${user.email}.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to send password reset email.");
    } finally {
      setResettingUserId(null);
    }
  }

  async function resendVerification(user: PlatformUser) {
    setResendingUserId(user.id);
    setError("");
    setMessage("");

    try {
      await api.post(`/platform/users/${user.id}/resend-verification`);
      setMessage(`Verification email sent to ${user.email}.`);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Unable to resend verification email.");
    } finally {
      setResendingUserId(null);
    }
  }

  async function saveUser(user: PlatformUser) {
    const draft = drafts[user.id];
    if (!draft) {
      return;
    }

    setSavingUserId(user.id);
    setError("");
    setMessage("");

    try {
      const updated = await api.put<PlatformUser>(`/platform/users/${user.id}`, draft);
      setUsers((current) => sortUsers(current.map((item) => (item.id === user.id ? updated : item))));
      setDrafts((current) => ({
        ...current,
        [updated.id]: { role: updated.role, isActive: updated.isActive },
      }));
      setMessage(`User updated: ${updated.email}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update user.");
    } finally {
      setSavingUserId(null);
    }
  }

  function renderUserTable(list: PlatformUser[]) {
    return (
      <div className="table-scroll">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Access</th>
              <th>Status</th>
              <th>Verified</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((user) => {
              const draft = drafts[user.id] ?? { role: user.role, isActive: user.isActive };
              const isDirty = draft.isActive !== user.isActive;

              return (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>{user.companyName}</td>
                  <td>
                    <span className={`status-pill ${user.isPlatformAccess ? "status-pill-active" : "status-pill-inactive"}`}>
                      {user.isPlatformAccess ? "Platform admin" : "Subscriber user"}
                    </span>
                  </td>
                  <td>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [user.id]: { role: draft.role, isActive: event.target.checked },
                        }))}
                      />
                      <span>{draft.isActive ? "Active" : "Inactive"}</span>
                    </label>
                  </td>
                  <td>{user.isEmailVerified ? "Yes" : "No"}</td>
                  <td>{new Date(user.createdAtUtc).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={savingUserId === user.id || !isDirty}
                      onClick={() => setConfirmState({
                        title: "Save user status",
                        description: `Update ${user.fullName} to ${draft.isActive ? "active" : "inactive"}?`,
                        action: async () => {
                          await saveUser(user);
                          setConfirmState(null);
                        },
                      })}
                    >
                      {savingUserId === user.id ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={resettingUserId === user.id}
                      onClick={() => setConfirmState({
                        title: "Send password reset",
                        description: `Send a password reset email to ${user.email}?`,
                        action: async () => {
                          await sendPasswordReset(user);
                          setConfirmState(null);
                        },
                      })}
                    >
                      {resettingUserId === user.id ? "Sending..." : "Reset password"}
                    </button>
                    {!user.isEmailVerified ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={resendingUserId === user.id}
                        onClick={() => void resendVerification(user)}
                      >
                        {resendingUserId === user.id ? "Sending..." : "Resend verification"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderCollapsibleUserTable(
    title: string,
    subtitle: string,
    list: PlatformUser[],
    isOpen: boolean,
    onToggle: () => void,
  ) {
    return (
      <section className="card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">{title}</p>
            <h3 className="section-title">{subtitle}</h3>
          </div>
          <div className="actions-cell">
            <span className={`status-pill ${list.length > 0 ? "status-pill-active" : "status-pill-inactive"}`}>{list.length}</span>
            <button type="button" className="button button-secondary" onClick={onToggle}>
              {isOpen ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {isOpen ? (
          renderUserTable(list)
        ) : (
          <HelperText>{`Hidden for now. ${list.length} user${list.length === 1 ? "" : "s"} in this section.`}</HelperText>
        )}
      </section>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">User management</p>
          <h2>Platform users</h2>
          <p className="muted">Manage platform admins, resend verification, reset passwords, and control subscriber user access from one owner screen.</p>
        </div>
      </header>

      {message ? <HelperText>{message}</HelperText> : null}
      {error ? <HelperText tone="error">{error}</HelperText> : null}

      <section className="grid-two">
        <article className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Platform access</p>
              <h3 className="section-title">Create platform admin</h3>
              <p className="muted form-intro">Add another admin who can help manage platform-side settings and operations.</p>
            </div>
            <span className="status-pill status-pill-active">{`${users.filter((item) => item.isPlatformAccess).length} platform user${users.filter((item) => item.isPlatformAccess).length === 1 ? "" : "s"}`}</span>
          </div>
          <div className="form-stack">
            <label className="form-label">
              Full name
              <input className="text-input" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Aisyah Rahman" />
            </label>
            <label className="form-label">
              Work email
              <input className="text-input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="admin@yourcompany.com" />
            </label>
            <label className="form-label">
              Temporary password
              <input className="text-input" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" />
            </label>
            <button
              type="button"
              className="button button-primary"
              disabled={isCreating || !form.fullName.trim() || !form.email.trim() || form.password.trim().length < 8}
              onClick={() => void createPlatformAdmin()}
            >
              {isCreating ? "Creating..." : "Create platform admin"}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Find users</p>
              <h3 className="section-title">Search and filter</h3>
              <p className="muted form-intro">Filter by access type, account status, and verification state before taking action.</p>
            </div>
          </div>
          <div className="form-stack">
            <label className="form-label">
              Search
              <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, company, or role" />
            </label>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Access
                <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as typeof accessFilter)}>
                  <option value="all">All users</option>
                  <option value="platform">Platform users</option>
                  <option value="subscriber">Subscriber users</option>
                </select>
              </label>
              <label className="form-label">
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </label>
              <label className="form-label">
                Verification
                <select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value as typeof verificationFilter)}>
                  <option value="all">All users</option>
                  <option value="verified">Verified only</option>
                  <option value="unverified">Unverified only</option>
                </select>
              </label>
            </div>
            <HelperText>{`${filteredUsers.length} user${filteredUsers.length === 1 ? "" : "s"} match the current filter.`}</HelperText>
          </div>
        </article>
      </section>

      <section className="management-summary-grid">
        <article className="management-summary-card">
          <p className="eyebrow">Overview</p>
          <h3>{users.length}</h3>
          <p className="muted">Total user accounts</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Platform</p>
          <h3>{users.filter((item) => item.isPlatformAccess).length}</h3>
          <p className="muted">Platform-side admins</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Need attention</p>
          <h3>{users.filter((item) => !item.isEmailVerified || !item.isActive).length}</h3>
          <p className="muted">Inactive or unverified users</p>
        </article>
      </section>

      {renderCollapsibleUserTable(
        "Platform admins",
        "Users with platform access",
        platformUsers,
        showPlatformUsers,
        () => setShowPlatformUsers((current) => !current),
      )}
      {renderCollapsibleUserTable(
        "Subscriber users",
        "Customer-side accounts",
        subscriberUsers,
        showSubscriberUsers,
        () => setShowSubscriberUsers((current) => !current),
      )}

      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => {
          if (confirmState) {
            await confirmState.action();
          }
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
