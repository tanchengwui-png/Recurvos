import type { ReactNode } from "react";

type ListCardHeaderProps = {
  title: string;
  count?: number;
  countLabel?: string;
  description?: string;
  actions?: ReactNode;
};

/** Standard heading and actions row for list cards. */
export function ListCardHeader({ title, count, countLabel, description, actions }: ListCardHeaderProps) {
  return (
    <div className="card-section-header list-card-header">
      <div className="list-card-heading">
        <div className="list-card-title-group">
          <h3 className="section-title">{title}</h3>
          {description ? <p className="list-card-description">{description}</p> : null}
        </div>
        {count !== undefined ? <span className="list-card-count">{count} {countLabel ?? "records"}</span> : null}
      </div>
      {actions ? <div className="list-card-header-actions">{actions}</div> : null}
    </div>
  );
}
