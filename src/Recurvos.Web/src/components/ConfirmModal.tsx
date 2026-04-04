import { useEffect, useState } from "react";
import { HelperText } from "./ui/HelperText";

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
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      setSubmitError("");
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
        {submitError ? <HelperText tone="error">{submitError}</HelperText> : null}
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
                setSubmitError("");
                await onConfirm();
              } catch (error) {
                setSubmitError(error instanceof Error ? error.message : "Unable to complete this action.");
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
