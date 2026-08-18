import { useEffect, type ReactNode } from "react";

type RecordDetailsModalProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

type RecordDetailFieldProps = {
  label: string;
  value?: ReactNode;
};

export function RecordDetailField({ label, value }: RecordDetailFieldProps) {
  return <div className="product-preview-field"><span>{label}</span><strong>{value === "" || value == null ? "—" : value}</strong></div>;
}

export function RecordDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="product-preview-section"><h4>{title}</h4><div className="product-preview-grid">{children}</div></section>;
}

/** Shared summary popup for every list-level "View details" action. */
export function RecordDetailsModal({ eyebrow, title, subtitle, onClose, actions, children }: RecordDetailsModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop product-preview-backdrop" role="presentation" onClick={onClose}>
      <div className="card product-preview-modal record-details-modal" role="dialog" aria-modal="true" aria-labelledby="record-details-title" onClick={(event) => event.stopPropagation()}>
        <div className="product-preview-modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h3 id="record-details-title">{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <div className="product-preview-modal-actions">
            {actions}
            <button type="button" className="file-preview-close" aria-label="Close details" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="product-preview-modal-body">{children}</div>
      </div>
    </div>
  );
}
