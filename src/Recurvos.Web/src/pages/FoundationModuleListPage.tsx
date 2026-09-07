import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { ListCardHeader } from "../components/ListCardHeader";
import { ListToolbar } from "../components/ListToolbar";
import { RowActionMenu } from "../components/RowActionMenu";
import { TablePagination } from "../components/TablePagination";
import { HelperText } from "../components/ui/HelperText";
import { useClientPagination } from "../hooks/useClientPagination";
import { api } from "../lib/api";
import { foundationModules, type FoundationModuleConfig, type FoundationRecord } from "./foundationModules";

function buildQuery(search: string, filters: Record<string, string>) {
  const query = new URLSearchParams();

  if (search.trim()) {
    query.set("search", search.trim());
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  return query.toString();
}

function pluralize(label: string) {
  return label.endsWith("y") ? `${label.slice(0, -1)}ies` : `${label}s`;
}

export function FoundationModuleListPage({ moduleKey }: { moduleKey: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const module = useMemo(() => foundationModules.find((item) => item.key === moduleKey) as FoundationModuleConfig | undefined, [moduleKey]);
  const [items, setItems] = useState<FoundationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!module) {
      return;
    }

    const nextFilters = Object.fromEntries((module.filters ?? []).map((filter) => [filter.key, ""]));
    setFilters(nextFilters);
  }, [module]);

  useEffect(() => {
    if (!module) {
      return;
    }

    const moduleConfig = module;

    async function load() {
      try {
        setError("");
        const query = buildQuery(search, filters);
        const result = await api.get<FoundationRecord[]>(`${moduleConfig.apiPath}${query ? `?${query}` : ""}`);
        setItems(result);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : `Unable to load ${moduleConfig.label.toLowerCase()}.`);
      }
    }

    void load();
  }, [module, search, filters]);

  const pagination = useClientPagination(items, [moduleKey, search, filters]);

  if (!module) {
    return <div className="page"><section className="card"><p className="muted">Foundation module not found.</p></section></div>;
  }

  const moduleConfig = module;
  const recordLabel = items.length === 1 ? moduleConfig.singularLabel : pluralize(moduleConfig.singularLabel);

  return (
    <div className="page">
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <ListToolbar>
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={moduleConfig.searchPlaceholder} />
        {(moduleConfig.filters ?? []).map((filter) => (
          <select key={filter.key} value={filters[filter.key] ?? ""} onChange={(event) => setFilters((current) => ({ ...current, [filter.key]: event.target.value }))}>
            {filter.options.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
        ))}
      </ListToolbar>
      <section className="card">
        <ListCardHeader
          title={moduleConfig.label}
          count={items.length}
          countLabel={recordLabel}
          actions={<button type="button" className="button button-primary" onClick={() => navigate(`${moduleConfig.path}/new`)}>Create {moduleConfig.singularLabel}</button>}
        />
        <div className="table-scroll table-scroll-bounded">
          <table className="catalog-table">
            <thead>
              <tr>
                {moduleConfig.columns.map((column) => <th key={column.key}>{column.label}</th>)}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <EmptyTableRow
                  colSpan={moduleConfig.columns.length + 1}
                  title={`No ${moduleConfig.label.toLowerCase()} yet`}
                  description={`Create a ${moduleConfig.singularLabel} to start building your foundation data.`}
                  actions={<button type="button" className="button button-primary" onClick={() => navigate(`${moduleConfig.path}/new`)}>Create {moduleConfig.singularLabel}</button>}
                />
              ) : pagination.pagedItems.map((item) => (
                <tr key={item.id}>
                  {moduleConfig.columns.map((column) => <td key={column.key}>{column.render(item)}</td>)}
                  <td className="actions-cell">
                    <RowActionMenu
                      items={[
                        { label: "View details", onClick: () => navigate(`${moduleConfig.path}/${item.id}`, { state: { backgroundLocation: location } }) },
                        { label: "Edit", onClick: () => navigate(`${moduleConfig.path}/${item.id}/edit`) },
                        {
                          label: "Delete",
                          tone: "danger",
                          onClick: () => setConfirmState({
                            title: `Delete ${moduleConfig.singularLabel}`,
                            description: `Delete ${item.code}?`,
                            action: async () => {
                              await api.delete(`${moduleConfig.apiPath}/${item.id}`);
                              setConfirmState(null);
                              const query = buildQuery(search, filters);
                              const result = await api.get<FoundationRecord[]>(`${moduleConfig.apiPath}${query ? `?${query}` : ""}`);
                              setItems(result);
                            },
                          }),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={items.length} totalPages={pagination.totalPages} rangeStart={pagination.rangeStart} rangeEnd={pagination.rangeEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </section>
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Delete"
        onConfirm={async () => { await confirmState?.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
