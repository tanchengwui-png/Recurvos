import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { HelperText } from "../components/ui/HelperText";
import { api, buildApiUrl } from "../lib/api";
import { getAuth } from "../lib/auth";
import { DEFAULT_UPLOAD_POLICY, formatUploadSizeLabel, prepareImageUpload } from "../lib/uploads";
import type { CompanyLookup, PlatformUploadPolicy } from "../types";

const emptyForm = {
  name: "",
  registrationNumber: "",
  email: "",
  phone: "",
  address: "",
  industry: "",
  natureOfBusiness: "",
  isActive: true,
};

export function CompanyFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingCompanyId = id ?? null;
  const [items, setItems] = useState<CompanyLookup[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoInsight, setLogoInsight] = useState("");
  const [logoMeta, setLogoMeta] = useState<{ width: number; height: number; warning: string; recommendation: string } | null>(null);
  const [error, setError] = useState("");
  const [uploadPolicy, setUploadPolicy] = useState<PlatformUploadPolicy>(DEFAULT_UPLOAD_POLICY);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);

  const activeCompany = items.find((item) => item.id === editingCompanyId);

  useEffect(() => {
    async function load() {
      const [companies, policy] = await Promise.all([
        api.get<CompanyLookup[]>("/companies"),
        api.get<PlatformUploadPolicy>("/settings/upload-policy").catch(() => DEFAULT_UPLOAD_POLICY),
      ]);

      setItems(companies);
      setUploadPolicy(policy);

      if (!editingCompanyId) {
        return;
      }

      const company = companies.find((item) => item.id === editingCompanyId);
      if (!company) {
        setError("Company not found.");
        return;
      }

      setForm({
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

    void load();
  }, [editingCompanyId]);

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

      if (!editingCompanyId || !activeCompany?.hasLogo) {
        if (isActive) {
          setLogoPreviewUrl("");
        }
        return;
      }

      const session = getAuth();
      const response = await fetch(buildApiUrl(`/companies/${editingCompanyId}/logo`), {
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
  }, [activeCompany?.hasLogo, editingCompanyId, logoFile]);

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
      } else if (smallestSide < 120) {
        insight = "This logo may look too small on invoices";
        warning = "Use a larger image if you can. Small logos can look blurry or hard to read.";
      } else if (ratio > 5.5) {
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
      title: editingCompanyId ? "Update company" : "Create company",
      description: editingCompanyId
        ? `Save changes to ${form.name || "this company"}?`
        : `Create ${form.name || "this company"} under your subscriber account?`,
      action: async () => {
        try {
          if (editingCompanyId) {
            await api.put(`/companies/${editingCompanyId}`, payload);
          } else {
            await api.post("/companies", payload);
          }

          navigate("/companies", {
            replace: true,
            state: { flashMessage: editingCompanyId ? `Company updated: ${payload.name || "Company"}.` : `Company created: ${payload.name || "Company"}.` },
          });
        } catch (submitError) {
          const nextError = submitError instanceof Error ? submitError.message : "Unable to save company.";
          setError(nextError);
          throw new Error(nextError);
        }
      },
    });
  }

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
          navigate("/companies", {
            replace: true,
            state: { flashMessage: `Logo uploaded for ${form.name || "Company"}.` },
          });
        } catch (uploadError) {
          const nextError = uploadError instanceof Error ? uploadError.message : "Unable to upload logo.";
          setError(nextError);
          throw new Error(nextError);
        }
      },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{editingCompanyId ? "Edit company" : "Add company"}</p>
          <h2>{editingCompanyId ? "Update billing profile" : "Create billing profile"}</h2>
          <p className="muted">These details appear on invoices, reminders, and payment records.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/companies")}>Back to companies</button>
      </header>
      <section className="card subscription-create-page-card">
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
          <label className="form-label">
            Industry
            <input className="text-input" value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} />
          </label>
          <label className="form-label">
            Nature of business
            <input className="text-input" value={form.natureOfBusiness} onChange={(event) => setForm((current) => ({ ...current, natureOfBusiness: event.target.value }))} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
            Active
          </label>
          {!editingCompanyId ? <HelperText>Create the company first, then return to upload its logo if needed.</HelperText> : null}
          {error ? <HelperText tone="error">{error}</HelperText> : null}
          <div className="subscription-create-actions">
            <button type="submit" className="button button-primary">{editingCompanyId ? "Update company" : "Create company"}</button>
            <button type="button" className="button button-secondary" onClick={() => navigate("/companies")}>Cancel</button>
          </div>
        </form>
      </section>
      {editingCompanyId ? (
        <section className="card branding-section">
          <div className="branding-section-header">
            <div>
              <p className="eyebrow">Branding</p>
              <h3 className="section-title">Company logo</h3>
              <p className="muted">Upload the logo that appears on your invoice header. This is separate from the company details above.</p>
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
              <HelperText>Choose a clear logo that is easy to read. Wide logos usually fit invoices better than tall ones.</HelperText>
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
                <button type="button" className="button button-primary" onClick={() => void uploadLogo(editingCompanyId)}>Upload logo</button>
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
