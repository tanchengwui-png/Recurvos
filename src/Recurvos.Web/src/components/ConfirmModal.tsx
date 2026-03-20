import { useEffect, useState } from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
};

export function ConfirmModal({ open, title, description, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h3 id="confirm-modal-title">{title}</h3>
        <p className="muted">{description}</p>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" disabled={isSubmitting} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="button button-primary"
            disabled={isSubmitting}
            onClick={async () => {
              if (isSubmitting) {
                return;
              }

              try {
                setIsSubmitting(true);
                await onConfirm();
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
