import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";

type PreviewFile = {
  blob: Blob;
  objectUrl: string;
  fileName: string;
  contentType: string;
};

type FilePreviewModalProps = {
  title: string;
  subtitle?: string;
  filePath: string;
  context?: ReactNode;
  onClose: () => void;
};

function fallbackFileName(title: string, contentType: string) {
  const baseName = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
  const extension = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "file";
  return `${baseName}.${extension}`;
}

function getPreviewKind(file: PreviewFile) {
  const fileName = file.fileName?.toLowerCase() ?? "";

  if (file.contentType.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/.test(fileName)) {
    return "image";
  }

  if (file.contentType.includes("pdf") || fileName.endsWith(".pdf")) {
    return "pdf";
  }

  return "unsupported";
}

/** Reusable authenticated preview for uploaded documents, receipts, and attachments. */
export function FilePreviewModal({ title, subtitle, filePath, context, onClose }: FilePreviewModalProps) {
  const [file, setFile] = useState<PreviewFile | null>(null);
  const [error, setError] = useState("");
  const closeHandlerRef = useRef(onClose);
  closeHandlerRef.current = onClose;

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHandlerRef.current();
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    void api.download(filePath)
      .then((download) => {
        objectUrl = URL.createObjectURL(download.blob);
        if (isActive) {
          const contentType = download.contentType ?? download.blob.type;
          setFile({ blob: download.blob, objectUrl, fileName: download.fileName ?? fallbackFileName(title, contentType), contentType });
        }
      })
      .catch((previewError) => {
        if (isActive) {
          setError(previewError instanceof Error ? previewError.message : "Unable to load this file preview.");
        }
      });

    return () => {
      isActive = false;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath, title]);

  const downloadFile = () => {
    if (!file) return;
    const downloadUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = file.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  const previewKind = file ? getPreviewKind(file) : null;

  return (
    <div className="modal-backdrop product-preview-backdrop" role="presentation" onClick={onClose}>
      <div className="card product-preview-modal file-preview-modal" role="dialog" aria-modal="true" aria-labelledby="file-preview-title" onClick={(event) => event.stopPropagation()}>
        <div className="product-preview-modal-header">
          <div>
            <p className="eyebrow">Document preview</p>
            <h3 id="file-preview-title">{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="file-preview-close" aria-label="Close preview" onClick={onClose}>×</button>
        </div>
        <div className="product-preview-modal-body file-preview-modal-body">
          {context ? <div className="file-preview-context">{context}</div> : null}
          <div className="file-preview-stage" aria-live="polite">
            {!file && !error ? <p className="muted">Loading preview…</p> : null}
            {error ? <p className="helper-text helper-text-error">{error}</p> : null}
            {file && previewKind === "image" ? <img src={file.objectUrl} alt={file.fileName ?? title} /> : null}
            {file && previewKind === "pdf" ? <iframe title={file.fileName ?? title} src={file.objectUrl} /> : null}
            {file && previewKind === "unsupported" ? <div className="file-preview-unavailable"><strong>Preview unavailable</strong><span>{file.fileName ?? "This file type"} cannot be displayed in the app.</span></div> : null}
          </div>
        </div>
        <footer className="file-preview-modal-footer">
          <span className="muted">{file?.fileName ?? (error ? "File unavailable" : "Loading file…")}</span>
          <div className="file-preview-modal-actions">
            <button type="button" className="button button-secondary button-compact" disabled={!file} onClick={downloadFile}>Download</button>
            <button type="button" className="button button-primary button-compact" onClick={onClose}>Close</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
