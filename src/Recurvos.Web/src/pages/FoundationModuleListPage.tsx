import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyTableRow } from "../components/EmptyTableRow";
import { RowActionMenu } from "../components/RowActionMenu";
import { HelperText } from "../components/ui/HelperText";
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

export function FoundationModuleListPage({ moduleKey }: { moduleKey: string }) {
  const navigate = useNavigate();
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

  if (!module) {
    return <div className="page"><section className="card"><p className="muted">Foundation module not found.</p></section></div>;
  }

  const moduleConfig = module;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>{moduleConfig.label}</h2>
          <p className="page-subtitle">{moduleConfig.description}</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => navigate(`${moduleConfig.path}/new`)}>
          Create {moduleConfig.singularLabel}
        </button>
      </header>
      {error ? <HelperText tone="error">{error}</HelperText> : null}
      <div className="catalog-toolbar card subtle-card">
        <input className="text-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={moduleConfig.searchPlaceholder} />
        {(moduleConfig.filters ?? []).map((filter) => (
          <select key={filter.key} value={filters[filter.key] ?? ""} onChange={(event) => setFilters((current) => ({ ...current, [filter.key]: event.target.value }))}>
            {filter.options.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
        ))}
      </div>
      <section className="card">
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
              ) : items.map((item) => (
                <tr key={item.id}>
                  {moduleConfig.columns.map((column) => <td key={column.key}>{column.render(item)}</td>)}
                  <td className="actions-cell">
                    <RowActionMenu
                      items={[
                        { label: "View", onClick: () => navigate(`${moduleConfig.path}/${item.id}`) },
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
