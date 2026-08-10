import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  description?: string;
  number?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
};

/** A consistent titled section within the single create/edit form surface. */
export function FormSection({ title, description, number, children, className = "", actions }: FormSectionProps) {
  const headingId = `form-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className={`standard-form-section ${className}`.trim()} aria-labelledby={headingId}>
      <header className="standard-form-section-header">
        {number ? <span className="standard-form-section-number" aria-hidden="true">{number}</span> : null}
        <div>
          <h3 id={headingId}>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="standard-form-section-actions">{actions}</div> : null}
      </header>
      <div className="standard-form-section-body">{children}</div>
    </section>
  );
}
