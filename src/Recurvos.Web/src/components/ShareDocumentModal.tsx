import { useEffect, useState } from "react";
import { HelperText } from "./ui/HelperText";

type ShareDocumentModalProps = {
  open: boolean;
  documentLabel: string;
  documentNumber: string;
  recipientName?: string;
  defaultRecipientEmail?: string;
  canSend?: boolean;
  onClose: () => void;
  onSend: (recipientEmail: string, message: string) => Promise<void>;
  onGetLink?: () => Promise<string>;
};

const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

export function ShareDocumentModal({ open, documentLabel, documentNumber, recipientName, defaultRecipientEmail = "", canSend = true, onClose, onSend, onGetLink }: ShareDocumentModalProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [mode, setMode] = useState<"email" | "link">("email");
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open) { setRecipientEmail(defaultRecipientEmail); setMessage(""); setLink(""); setFeedback(""); setMode("email"); }
  }, [open, defaultRecipientEmail]);

  if (!open) return null;

  async function send() {
    if (!isValidEmail(recipientEmail) || !canSend) return;
    try { setIsSending(true); await onSend(recipientEmail.trim(), message.trim()); onClose(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : `Unable to send ${documentLabel.toLowerCase()}.`); }
    finally { setIsSending(false); }
  }

  async function copyLink() {
    try {
      const value = link || await onGetLink?.();
      if (!value) return;
      setLink(value);
      await navigator.clipboard.writeText(value);
      setFeedback("Link copied.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to copy the secure document link."); }
  }

  return <div className="modal-backdrop product-preview-backdrop share-document-backdrop" role="presentation" onClick={onClose}>
    <div className="card product-preview-modal share-document-modal" role="dialog" aria-modal="true" aria-labelledby="share-document-title" onClick={(event) => event.stopPropagation()}>
      <div className="product-preview-modal-header"><div><p className="eyebrow">Share {documentLabel.toLowerCase()}</p><h3 id="share-document-title">{documentNumber}</h3></div><button type="button" className="file-preview-close" aria-label={`Close share ${documentLabel.toLowerCase()}`} onClick={onClose}>×</button></div>
      <div className="product-preview-modal-body share-document-body">
        {onGetLink ? <div className="share-document-tabs" role="tablist"><button type="button" role="tab" aria-selected={mode === "email"} className={mode === "email" ? "active" : ""} onClick={() => setMode("email")}>Email</button><button type="button" role="tab" aria-selected={mode === "link"} className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}>Copy link</button></div> : null}
        {mode === "email" ? <><p className="muted">{recipientName || `Send this ${documentLabel.toLowerCase()} directly to a recipient.`}</p><label className="form-label">Recipient email<input className="text-input" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="Enter recipient email" autoFocus /></label>{recipientEmail && !isValidEmail(recipientEmail) ? <HelperText tone="error">Enter a valid email address.</HelperText> : null}<label className="form-label">Message <span className="muted">(optional)</span><textarea className="text-input" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={3} placeholder="Add a message" /></label></> : <><label className="form-label">Document link<input className="text-input" readOnly value={link} placeholder="Generate and copy a secure document link" /></label><p className="muted">This is a secure document viewing link.</p></>}
        {feedback ? <HelperText>{feedback}</HelperText> : null}
      </div>
      <footer className="file-preview-modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>{mode === "email" ? <button type="button" className="button button-primary" disabled={!isValidEmail(recipientEmail) || !canSend || isSending} onClick={() => void send()}>{isSending ? "Sending..." : "Send email"}</button> : <button type="button" className="button button-primary" onClick={() => void copyLink()}>Copy link</button>}</footer>
    </div>
  </div>;
}
