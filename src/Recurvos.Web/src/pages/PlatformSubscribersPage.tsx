import { useEffect, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { api } from "../lib/api";
import type { PlatformPackage, SubscriberCompany } from "../types";

export function PlatformSubscribersPage() {
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [subscribers, setSubscribers] = useState<SubscriberCompany[]>([]);
  const [packages, setPackages] = useState<PlatformPackage[]>([]);
  const [draftPackages, setDraftPackages] = useState<Record<string, string>>({});
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pagination = useClientPagination(subscribers, [subscribers.length]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, packages.length, pagination.currentPage, pagination.pageSize]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [subscriberList, packageList] = await Promise.all([
      api.get<SubscriberCompany[]>("/platform/subscribers"),
      api.get<PlatformPackage[]>("/platform/packages"),
    ]);

    setSubscribers(subscriberList);
    setPackages(packageList.filter((item) => item.isActive));
    setDraftPackages(Object.fromEntries(subscriberList.map((subscriber) => [subscriber.companyId, subscriber.packageCode ?? ""])));
  }

  async function assignPackage(companyId: string) {
    const packageCode = draftPackages[companyId];
    if (!packageCode) {
      setError("Choose a package before saving.");
      return;
    }

    setSavingCompanyId(companyId);
    setError("");

    try {
      const updated = await api.put<SubscriberCompany>(`/platform/subscribers/${companyId}/package`, { packageCode });
      setSubscribers((current) => current.map((subscriber) => subscriber.companyId === companyId ? updated : subscriber));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to assign package.");
    } finally {
      setSavingCompanyId(null);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Subscriber businesses</p>
          <h2>Companies on Recurvo</h2>
        </div>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <section className="card">
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
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Package</th>
                <th>Status</th>
                <th>Grace until</th>
                <th>Email</th>
                <th>Registration</th>
                <th>Customers</th>
                <th>Subscriptions</th>
                <th>Open invoices</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pagedItems.map((subscriber) => (
                <tr key={subscriber.companyId}>
                  <td>{subscriber.companyName}</td>
                  <td>{subscriber.packageName ?? subscriber.packageCode ?? "-"}</td>
                  <td>{subscriber.packageStatus ?? "-"}</td>
                  <td>{subscriber.packageGracePeriodEndsAtUtc ? new Date(subscriber.packageGracePeriodEndsAtUtc).toLocaleDateString() : "-"}</td>
                  <td>{subscriber.email}</td>
                  <td>{subscriber.registrationNumber}</td>
                  <td>{subscriber.customerCount}</td>
                  <td>{subscriber.subscriptionCount}</td>
                  <td>{subscriber.openInvoiceCount}</td>
                  <td className="actions-cell">
                    <select
                      value={draftPackages[subscriber.companyId] ?? ""}
                      onChange={(event) => setDraftPackages((current) => ({ ...current, [subscriber.companyId]: event.target.value }))}
                    >
                      <option value="" disabled>Select package</option>
                      {packages.map((item) => (
                        <option key={item.id} value={item.code}>{item.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={savingCompanyId === subscriber.companyId || !draftPackages[subscriber.companyId] || draftPackages[subscriber.companyId] === (subscriber.packageCode ?? "")}
                      onClick={() => void assignPackage(subscriber.companyId)}
                    >
                      {savingCompanyId === subscriber.companyId ? "Saving..." : "Assign"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
          <div ref={bottomInnerRef} />
        </div>
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
    </div>
  );
}
