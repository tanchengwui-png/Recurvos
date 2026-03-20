import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { TablePagination } from "../components/TablePagination";
import { useClientPagination } from "../hooks/useClientPagination";

type Column<T> = { key: string; title: string; render: (item: T) => string | number | boolean | null | undefined };

export function EntityPage<T extends { id: string }>({
  title,
  subtitle,
  columns,
  loader,
  creator,
  defaultValues,
}: {
  title: string;
  subtitle: string;
  columns: Column<T>[];
  loader: () => Promise<T[]>;
  creator?: (payload: Record<string, unknown>) => Promise<unknown>;
  defaultValues?: Record<string, string>;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [form, setForm] = useState<Record<string, string>>(defaultValues ?? {});
  const pagination = useClientPagination(items, [items.length]);

  async function refresh() {
    setItems(await loader());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!creator) return;
    await creator(form);
    setForm(defaultValues ?? {});
    await refresh();
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="grid-two">
        <section className="card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagination.pagedItems.map((item) => (
                  <tr key={item.id}>
                    {columns.map((column) => (
                      <td key={column.key}>{String(column.render(item) ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
        </section>
        {creator ? (
          <section className="card">
            <p className="eyebrow">Add new</p>
            <form className="form-stack" onSubmit={submit}>
              {Object.entries(form).map(([key, value]) => (
                <label key={key} className="form-label">
                  {key}
                  <input className="text-input" value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                </label>
              ))}
              <button type="submit" className="button button-primary">Save</button>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
