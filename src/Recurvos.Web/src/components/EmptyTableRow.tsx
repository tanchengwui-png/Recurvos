import type { ReactNode } from "react";

export function EmptyTableRow({
  colSpan,
  title,
  description,
  actions,
}: {
  colSpan: number;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <tr className="empty-table-row">
      <td colSpan={colSpan} className="empty-table-cell">
        <div className="empty-table-state">
          <h3>{title}</h3>
          <p className="muted">{description}</p>
          {actions ? <div className="empty-table-state-actions">{actions}</div> : null}
        </div>
      </td>
    </tr>
  );
}
