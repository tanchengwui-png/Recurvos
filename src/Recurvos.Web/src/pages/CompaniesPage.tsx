import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TablePagination } from "../components/TablePagination";
import { RowActionMenu } from "../components/RowActionMenu";
import { useDragToScroll } from "../hooks/useDragToScroll";
import { useClientPagination } from "../hooks/useClientPagination";
import { useSyncedHorizontalScroll } from "../hooks/useSyncedHorizontalScroll";
import { HelperText } from "../components/ui/HelperText";
import { api, buildApiUrl } from "../lib/api";
import { getAuth } from "../lib/auth";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { CompanyLookup, FeatureAccess, PlatformPackage, PlatformUploadPolicy } from "../types";

const emptyForm = {
  id: "",
  name: "",
  registrationNumber: "",
  email: "",
  phone: "",
  address: "",
  industry: "",
  natureOfBusiness: "",
  isActive: true,
};

export function CompaniesPage() {
  const navigate = useNavigate();
  const tableScrollRef = useDragToScroll<HTMLDivElement>();
  const [items, setItems] = useState<CompanyLookup[]>([]);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess | null>(null);
  const [packageLimit, setPackageLimit] = useState<number | null>(null);
  const pagination = useClientPagination(items, [items.length]);
  const { topScrollRef, topInnerRef, contentScrollRef, bottomScrollRef, bottomInnerRef } = useSyncedHorizontalScroll([pagination.pagedItems.length, pagination.currentPage, pagination.pageSize]);
  const [form, setForm] = useState(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoInsight, setLogoInsight] = useState("");
  const [logoMeta, setLogoMeta] = useState<{ width: number; height: number; warning: string; recommendation: string } | null>(null);
  const [error, setError] = useState("");
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  async function load() {
    const [companies, access, packages, policy] = await Promise.all([
      api.get<CompanyLookup[]>("/companies"),
      api.get<FeatureAccess>("/settings/feature-access").catch(() => null),
      api.get<PlatformPackage[]>("/public/packages").catch(() => []),
      api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
    ]);

    setItems(companies);
    setFeatureAccess(access);
    setUploadPolicy(policy);
    const activePackage = packages.find((item) => item.code === access?.packageCode);
    setPackageLimit(activePackage?.maxCompanies ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const payload = {
      name: form.name,
      registrationNumber: form.registrationNumber,
      email: form.email,
      phone: form.phone,
      address: form.address,
      industry: form.industry,
      natureOfBusiness: form.natureOfBusiness,
      isActive: form.isActive,
    };

    setConfirmState({
      title: form.id ? "Update company" : "Create company",
      description: form.id
        ? `Save changes to ${form.name || "this company"}?`
        : `Create ${form.name || "this company"} under your subscriber account?`,
      action: async () => {
        try {
          if (form.id) {
            const company = await api.put<CompanyLookup>(`/companies/${form.id}`, payload);
            setForm({
              id: company.id,
              name: company.name,
              registrationNumber: company.registrationNumber,
              email: company.email,
              phone: company.phone,
              address: company.address,
              industry: company.industry ?? "",
              natureOfBusiness: company.natureOfBusiness ?? "",
              isActive: company.isActive,
            });
          } else {
            const company = await api.post<CompanyLookup>("/companies", payload);
            setForm({
              id: company.id,
              name: company.name,
              registrationNumber: company.registrationNumber,
              email: company.email,
              phone: company.phone,
              address: company.address,
              industry: company.industry ?? "",
              natureOfBusiness: company.natureOfBusiness ?? "",
              isActive: company.isActive,
            });
          }

          setLogoFile(null);
          setConfirmState(null);
          await load();
        } catch (submitError) {
          setConfirmState(null);
          setError(submitError instanceof Error ? submitError.message : "Unable to save company.");
        }
      },
    });
  }

  function startEdit(item: CompanyLookup) {
    setError("");
    setLogoFile(null);
    setForm({
      id: item.id,
      name: item.name,
      registrationNumber: item.registrationNumber,
      email: item.email,
      phone: item.phone,
      address: item.address,
      industry: item.industry ?? "",
      natureOfBusiness: item.natureOfBusiness ?? "",
      isActive: item.isActive,
    });
  }

  const activeCompany = items.find((item) => item.id === form.id);

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    async function loadLogoPreview() {
      if (logoFile) {
        objectUrl = URL.createObjectURL(logoFile);
        if (isActive) {
          setLogoPreviewUrl(objectUrl);
        }
        return;
      }

      if (!form.id || !activeCompany?.hasLogo) {
        if (isActive) {
          setLogoPreviewUrl("");
        }
        return;
      }

      const session = getAuth();
      const response = await fetch(buildApiUrl(`/companies/${form.id}/logo`), {
        headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
      });

      if (!response.ok) {
        if (isActive) {
          setLogoPreviewUrl("");
        }
        return;
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      if (isActive) {
        setLogoPreviewUrl(objectUrl);
      }
    }

    void loadLogoPreview();

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [form.id, activeCompany?.hasLogo, logoFile]);

  useEffect(() => {
    if (!logoPreviewUrl) {
      setLogoInsight("");
      setLogoMeta(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      const ratio = image.width / image.height;
      const smallestSide = Math.min(image.width, image.height);
      let warning = "";
      let insight = "Looks good for invoices";
      let recommendation = "Best choice: a simple wide logo with large readable text.";

      if (ratio < 2.2) {
        insight = "This logo is a bit tall and may feel cramped";
        warning = "Wide logos usually fit invoices better than tall ones.";
      }
      else if (smallestSide < 120) {
        insight = "This logo may look too small on invoices";
        warning = "Use a larger image if you can. Small logos can look blurry or hard to read.";
      }
      else if (ratio > 5.5) {
        insight = "This logo is very wide";
        warning = "Check the invoice preview to make sure it still feels balanced.";
      }

      if (image.width < 280 || image.height < 88) {
        warning = "This file is smaller than recommended. Around 600 x 200 pixels usually works well.";
      }

      if (ratio >= 2.2 && ratio <= 5.5 && smallestSide >= 120 && image.width >= 280 && image.height >= 88) {
        recommendation = "Looks good. Customers will see the logo close to this size on invoices.";
      }

      setLogoInsight(insight);
      setLogoMeta({
        width: image.width,
        height: image.height,
        warning,
        recommendation,
      });
    };
    image.src = logoPreviewUrl;
  }, [logoPreviewUrl]);

  async function uploadLogo(companyId: string) {
    if (!logoFile) {
      setError("Choose a logo file before uploading.");
      return;
    }

    setConfirmState({
      title: "Upload company logo",
      description: `Upload this logo for ${form.name || "the selected company"}?`,
      action: async () => {
        try {
          const session = getAuth();
          const body = new FormData();
          body.append("file", logoFile);
          const response = await fetch(buildApiUrl(`/companies/${companyId}/logo`), {
            method: "POST",
            headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
            body,
          });

          if (!response.ok) {
            const raw = await response.text();
            try {
              const parsed = JSON.parse(raw) as { title?: string; detail?: string };
              setError(parsed.detail || parsed.title || "Unable to upload logo.");
              return;
            } catch {
              throw new Error(raw || "Unable to upload logo.");
            }
          }

          setLogoFile(null);
          setConfirmState(null);
          await load();
        } catch (uploadError) {
          setConfirmState(null);
          setError(uploadError instanceof Error ? uploadError.message : "Unable to upload logo.");
        }
      },
    });
  }

  const logoGuidance = useMemo(
    () => "Choose a clear logo that is easy to read. Wide logos usually fit invoices better than tall ones.",
    [],
  );
  const activeCompanies = items.filter((item) => item.isActive).length;
  const companiesWithLogo = items.filter((item) => item.hasLogo).length;
  const packageLimitLabel = packageLimit === null ? "-" : packageLimit <= 0 ? "Unlimited" : String(packageLimit);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Business setup</p>
          <h2>Companies</h2>
          <p className="muted">Manage the companies under your subscriber account.</p>
          <p className="muted">
            Billing profiles used: {items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}
          </p>
        </div>
      </header>
      <section className="management-summary-grid">
        <article className="management-summary-card">
          <p className="eyebrow">Usage</p>
          <h3>{items.length}{packageLimit !== null ? ` / ${packageLimitLabel}` : ""}</h3>
          <p className="muted">Billing profiles currently used under this subscriber account.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Active</p>
          <h3>{activeCompanies}</h3>
          <p className="muted">Companies that can appear on invoices and active billing flows.</p>
        </article>
        <article className="management-summary-card">
          <p className="eyebrow">Branding</p>
          <h3>{companiesWithLogo}</h3>
          <p className="muted">Billing profiles with invoice logo branding already uploaded.</p>
        </article>
      </section>
      <div className="grid-two company-page-grid">
        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">Billing profiles</p>
              <h3 className="section-title">Company list</h3>
              <p className="muted">Use one billing profile per legal entity or brand that issues invoices.</p>
            </div>
          </div>
          <div ref={topScrollRef} className="table-scroll table-scroll-top" aria-hidden="true">
            <div ref={topInnerRef} />
          </div>
          <div
            ref={(node) => {
              tableScrollRef.current = node;
              contentScrollRef.current = node;
            }}
            className="table-scroll table-scroll-bounded table-scroll-draggable"
          >
            <table className="catalog-table company-table">
              <thead>
                <tr>
                  <th className="sticky-cell sticky-cell-left">Name</th>
                  <th>Registration No.</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Logo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pagedItems.map((item) => (
                  <tr key={item.id}>
                    <td className="sticky-cell sticky-cell-left table-primary-cell">
                      <div className="table-primary-cell-inner">
                        <span>{item.name}</span>
                        <RowActionMenu items={[{ label: "Edit company", onClick: () => startEdit(item) }]} />
                      </div>
                    </td>
                    <td>{item.registrationNumber || "-"}</td>
                    <td>{item.email || "-"}</td>
                    <td>{item.phone || "-"}</td>
                    <td>{item.hasLogo ? "Uploaded" : "-"}</td>
                    <td>
                      <span className={`status-pill ${item.isActive ? "status-pill-active" : "status-pill-inactive"}`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 ? (
              <div className="empty-state">
                <h3>No companies yet</h3>
                <p className="muted">Start by adding the business entity that will appear on invoices, reminders, and payment records.</p>
                {featureAccess?.packageCode ? (
                  <p className="muted">
                    Package limit: {packageLimitLabel} billing profile{packageLimit === 1 ? "" : "s"} on {featureAccess.packageCode}.
                  </p>
                ) : null}
                <div className="empty-state-actions">
                  <button type="submit" className="button button-primary" form="company-form">Create first company</button>
                  <button type="button" className="button button-secondary" onClick={() => navigate("/help/quick-start")}>Quick Start</button>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={bottomScrollRef} className="table-scroll table-scroll-bottom" aria-hidden="true">
            <div ref={bottomInnerRef} />
          </div>
          <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
        </section>
        <section className="card">
          <div className="card-section-header">
            <div>
              <p className="eyebrow">{form.id ? "Edit company" : "Add company"}</p>
              <h3 className="section-title">{form.id ? "Update billing profile" : "Create billing profile"}</h3>
              <p className="muted form-intro">These details appear on invoices and payment reminders.</p>
            </div>
          </div>
          <form id="company-form" className="form-stack" onSubmit={submit}>
            <label className="form-label">
              Company name
              <input className="text-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="form-label">
              Registration number
              <input className="text-input" value={form.registrationNumber} onChange={(event) => setForm((current) => ({ ...current, registrationNumber: event.target.value }))} />
            </label>
            <label className="form-label">
              Email
              <input className="text-input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label className="form-label">
              Phone
              <input className="text-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label className="form-label">
              Address
              <input className="text-input" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
              Active
            </label>
            {form.id ? null : (
              <HelperText>Create the company first, then upload its logo in the Branding section.</HelperText>
            )}
            {error ? <HelperText tone="error">{error}</HelperText> : null}
            <div className="button-stack">
              <button type="submit" className="button button-primary">{form.id ? "Update company" : "Create company"}</button>
              {form.id ? <button type="button" className="button button-secondary" onClick={() => { setForm(emptyForm); setLogoFile(null); setError(""); }}>Cancel</button> : null}
            </div>
          </form>
        </section>
      </div>
      {form.id ? (
        <section className="card branding-section">
          <div className="branding-section-header">
            <div>
              <p className="eyebrow">Branding</p>
              <h3 className="section-title">Company logo</h3>
              <p className="muted">Upload the logo that appears on your invoice header. This is separate from updating company details.</p>
            </div>
            <div className="branding-status">
              <span className={`status-pill ${logoInsight === "Looks good for invoices" ? "status-pill-active" : "status-pill-inactive"}`}>
                {logoInsight || "Preview pending"}
              </span>
            </div>
          </div>
          <div className="branding-layout">
            <div className="branding-preview-card branding-preview-primary">
              <p className="eyebrow">Invoice Preview</p>
              <div className="invoice-preview-card invoice-preview-large">
                <div className="invoice-preview-header">
                  <div className="invoice-logo-block">
                    <span className="invoice-logo-caption">140 x 44 invoice logo area</span>
                    <div className="invoice-logo-slot">
                      {logoPreviewUrl ? <img src={logoPreviewUrl} alt="Invoice logo preview" className="invoice-logo-image" /> : <span className="muted">No logo selected</span>}
                    </div>
                  </div>
                  <div className="invoice-preview-meta">
                    <strong>INVOICE</strong>
                    <span>INV-001234</span>
                    <span className="muted">Issued today</span>
                  </div>
                </div>
                <div className="invoice-preview-lines">
                  <span />
                  <span />
                  <span />
                  <span className="invoice-preview-line-short" />
                </div>
              </div>
            </div>
            <div className="branding-sidebar">
              <div className="branding-preview-card">
                <p className="eyebrow">Original Preview</p>
                <div className="logo-preview-frame">
                  {logoPreviewUrl ? <img src={logoPreviewUrl} alt="Company logo preview" className="logo-preview-image" /> : <span className="muted">No logo selected yet</span>}
                </div>
              </div>
              <label className="form-label">
                Logo file
                <input
                  className="text-input"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) {
                      setLogoFile(null);
                      return;
                    }

                    void (async () => {
                      try {
                        const prepared = await prepareImageUpload(file, uploadPolicy);
                        setError("");
                        setLogoFile(prepared);
                      } catch (uploadError) {
                        setError(uploadError instanceof Error ? uploadError.message : `Logo must be ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)} or smaller.`);
                        event.target.value = "";
                        setLogoFile(null);
                      }
                    })();
                  }}
                />
                <span className="muted">
                  {logoFile
                    ? `Selected: ${logoFile.name}`
                    : `Current: ${activeCompany?.hasLogo ? "Logo uploaded" : "No logo uploaded"} | PNG, JPG, JPEG, or WEBP up to ${formatUploadSizeLabel(uploadPolicy.uploadMaxBytes)}.`}
                </span>
              </label>
              <HelperText>{logoGuidance}</HelperText>
              {logoMeta ? (
                <div className="branding-assist">
                  <p className="muted">{`Image size: ${logoMeta.width} x ${logoMeta.height}px`}</p>
                  <p className="muted">{logoMeta.recommendation}</p>
                  {logoMeta.warning ? <HelperText>{logoMeta.warning}</HelperText> : null}
                  <HelperText>Tip: PNG is usually the safest choice if you have it.</HelperText>
                </div>
              ) : (
                <div className="branding-assist">
                  <p className="muted">Recommended size: a wide logo around 600 x 200 pixels.</p>
                  <HelperText>If the preview looks small or hard to read, try a simpler version without a tiny tagline.</HelperText>
                </div>
              )}
              <div className="button-stack">
                <button type="button" className="button button-primary" onClick={() => void uploadLogo(form.id)}>Upload logo</button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel="Confirm"
        onConfirm={async () => { if (confirmState) await confirmState.action(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
