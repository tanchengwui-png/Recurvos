import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatCurrency } from "../lib/format";
import type { BusinessDocumentPdf } from "../lib/businessDocumentPdf";
import { useToast } from "./ui/Toast";

type DocumentPreviewModalProps = {
  document: BusinessDocumentPdf;
  onClose: () => void;
};

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "document";
}

function buildFileName(document: BusinessDocumentPdf) {
  return `${safeFileName(document.title)}-${safeFileName(document.number)}.pdf`;
}

function DocumentPage({ document }: { document: BusinessDocumentPdf }) {
  return <article className="business-document-page">
    <header className="business-document-header">
      <div><h1>{document.companyName || "Recurvos"}</h1></div>
      <div className="business-document-identity"><p>{document.title}</p><h2>{document.number}</h2></div>
    </header>
    <section className="business-document-overview">
      <div className="business-document-party"><span>{document.partyLabel}</span><strong>{document.partyName}</strong></div>
      <div className="business-document-metadata">{document.metadata.filter(([, value]) => value).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    </section>
    <table className="business-document-items"><thead><tr>{document.headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>
      {document.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.cells.map((cell, cellIndex) => <td key={cellIndex} className={row.numeric?.includes(cellIndex) ? "business-document-number" : ""}>{cell}</td>)}</tr>)}
    </tbody></table>
    {document.totals?.length ? <section className="business-document-totals">{document.totals.map((total) => <div key={total.label} className={total.emphasis ? "business-document-total-emphasis" : ""}><span>{total.label}</span><strong>{formatCurrency(total.value, document.currency)}</strong></div>)}</section> : null}
    {document.notes ? <section className="business-document-notes"><strong>Notes</strong><p>{document.notes}</p></section> : null}
    {document.acknowledgement ? <section className="business-document-acknowledgement"><div><strong>{document.acknowledgement.preparedBy}</strong><p>Name: ______________________________</p><p>Signature: ___________________________</p><p>Date: _______________________________</p></div><div><strong>{document.acknowledgement.receivedBy}</strong><p>Name: ______________________________</p><p>Signature: ___________________________</p><p>Date: _______________________________</p></div></section> : null}
    <footer className="business-document-footer"><span>{document.companyName || "Recurvos"}</span><span>Page 1 of 1</span></footer>
  </article>;
}

function documentStyles() {
  return Array.from(window.document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); }
    catch { return ""; }
  }).join("\n");
}

export function printBusinessDocument(document: BusinessDocumentPdf, page: HTMLElement) {
  const popup = window.open("", "_blank", "width=960,height=720");
  if (!popup) throw new Error("The print window was blocked.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${document.number}</title><style>${documentStyles()}</style></head><body class="business-document-print-surface">${page.outerHTML}</body></html>`);
  popup.document.close();
  const fontsReady = popup.document.fonts?.ready ?? Promise.resolve();
  void fontsReady.then(() => popup.requestAnimationFrame(() => { popup.focus(); popup.print(); }));
}

export function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    const previousBodyOverflow = window.document.body.style.overflow;
    const previousHtmlOverflow = window.document.documentElement.style.overflow;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.document.body.style.overflow = "hidden";
    window.document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", escape);
    return () => { window.document.body.style.overflow = previousBodyOverflow; window.document.documentElement.style.overflow = previousHtmlOverflow; window.removeEventListener("keydown", escape); };
  }, [onClose]);

  const handlePrint = () => {
    const page = pageRef.current?.firstElementChild;
    if (!(page instanceof HTMLElement)) return;
    setIsPrinting(true);
    try { printBusinessDocument(document, page); } catch { show("Unable to prepare this document for printing.", { tone: "error" }); }
    finally { setIsPrinting(false); }
  };

  const handleDownload = async () => {
    const page = pageRef.current?.firstElementChild;
    if (!(page instanceof HTMLElement) || isDownloading) return;
    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(page, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const imageHeight = canvas.height * pageWidth / canvas.width;
      let heightLeft = imageHeight;
      let position = 0;
      const image = canvas.toDataURL("image/png");
      pdf.addImage(image, "PNG", 0, position, pageWidth, imageHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) { position = heightLeft - imageHeight; pdf.addPage(); pdf.addImage(image, "PNG", 0, position, pageWidth, imageHeight); heightLeft -= pageHeight; }
      pdf.save(buildFileName(document));
    } catch { show("Unable to generate the PDF. Please try again.", { tone: "error" }); }
    finally { setIsDownloading(false); }
  };

  return <div className="modal-backdrop document-preview-backdrop" role="presentation" onClick={onClose}>
    <div className="card document-preview-modal" role="dialog" aria-modal="true" aria-labelledby="document-preview-title" onClick={(event) => event.stopPropagation()}>
      <header className="document-preview-header"><div><h3 id="document-preview-title">{document.title} {document.number}</h3><p className="muted">Preview</p></div><button type="button" className="file-preview-close" aria-label="Close preview" onClick={onClose}>×</button></header>
      <div className="document-preview-toolbar"><button type="button" className="button button-secondary button-compact" onClick={() => setZoom((current) => Math.max(60, current - 10))}>−</button><span>{zoom}%</span><button type="button" className="button button-secondary button-compact" onClick={() => setZoom((current) => Math.min(140, current + 10))}>+</button></div>
      <div className="document-preview-canvas"><div className="document-preview-scale" style={{ "--document-preview-zoom": zoom / 100 } as CSSProperties}><DocumentPage document={document} /></div></div>
      <footer className="document-preview-footer"><button type="button" className="button button-secondary" onClick={onClose}>Close</button><button type="button" className="button button-secondary" disabled={isPrinting} onClick={handlePrint}>{isPrinting ? "Preparing print…" : "Print"}</button><button type="button" className="button button-primary" disabled={isDownloading} onClick={() => void handleDownload()}>{isDownloading ? "Generating PDF…" : "Download PDF"}</button></footer>
      <div className="document-preview-print-page" aria-hidden="true" ref={pageRef}><DocumentPage document={document} /></div>
    </div>
  </div>;
}

function DocumentPrintSurface({ document, onComplete, onError }: { document: BusinessDocumentPdf; onComplete: () => void; onError: () => void }) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const page = pageRef.current?.firstElementChild;
    if (!(page instanceof HTMLElement)) return;
    try { printBusinessDocument(document, page); }
    catch { onError(); }
    onComplete();
  }, [document, onComplete, onError]);
  return <div className="document-preview-print-page" aria-hidden="true" ref={pageRef}><DocumentPage document={document} /></div>;
}

export function useBusinessDocumentPreview(): { previewDocument: (document: BusinessDocumentPdf) => void; printDocument: (document: BusinessDocumentPdf) => void; preview: ReactNode } {
  const [document, setDocument] = useState<BusinessDocumentPdf | null>(null);
  const [printDocument, setPrintDocument] = useState<BusinessDocumentPdf | null>(null);
  const { show } = useToast();
  return {
    previewDocument: setDocument,
    printDocument: setPrintDocument,
    preview: <>{document ? <DocumentPreviewModal document={document} onClose={() => setDocument(null)} /> : null}{printDocument ? <DocumentPrintSurface document={printDocument} onComplete={() => setPrintDocument(null)} onError={() => show("Unable to prepare this document for printing.", { tone: "error" })} /> : null}</>,
  };
}
