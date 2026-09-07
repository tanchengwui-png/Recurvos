import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type FormPageHeaderProps = {
  backLabel: string;
  backHref: string;
  breadcrumbs: ReactNode;
  description?: ReactNode;
};

export function FormPageHeader({ backLabel, backHref, breadcrumbs, description }: FormPageHeaderProps) {
  return (
    <nav className="form-page-header" aria-label="Form navigation">
      <Link className="form-page-header-back" to={backHref}>
        <span aria-hidden="true">←</span>
        {backLabel}
      </Link>
      <div className="form-page-header-breadcrumbs">{breadcrumbs}</div>
      {description ? <p className="form-page-header-description">{description}</p> : null}
    </nav>
  );
}
