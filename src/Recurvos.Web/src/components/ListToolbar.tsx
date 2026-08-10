import type { ReactNode } from "react";

type ListToolbarProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Shared list-page controls: filters stay together while actions remain discoverable. */
export function ListToolbar({ children, actions, className = "" }: ListToolbarProps) {
  return (
    <div className={`list-toolbar ${className}`.trim()}>
      <div className="list-toolbar-filters">{children}</div>
      {actions ? <div className="list-toolbar-actions">{actions}</div> : null}
    </div>
  );
}
