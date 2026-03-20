import { useEffect, useMemo, useState } from "react";
import { HelperText } from "../components/ui/HelperText";
import { api } from "../lib/api";
import type { CompanyLookup, FeedbackItem } from "../types";

const categoryOptions = [
  { value: "Bug", label: "Bug" },
  { value: "FeatureRequest", label: "Feature request" },
  { value: "BillingIssue", label: "Billing issue" },
  { value: "GeneralFeedback", label: "General feedback" },
] as const;

const priorityOptions = [
  { value: "Low", label: "Low" },
  { value: "Normal", label: "Normal" },
  { value: "Urgent", label: "Urgent" },
] as const;

function formatFeedbackLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFeedbackMessage(message: string) {
  const [summaryPart, detailPart] = message.split("\n\n[Bug details]\n");
  const detailLines = (detailPart ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const detailMap = Object.fromEntries(
    detailLines.map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        return [line, ""];
      }

      return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
    }),
  );

  return {
    summary: summaryPart.trim(),
    details: [
      ["Steps to reproduce", detailMap["Steps to reproduce"]],
      ["Expected result", detailMap["Expected result"]],
      ["Actual result", detailMap["Actual result"]],
      ["Page", detailMap.Page],
      ["Browser", detailMap.Browser],
      ["Reported at", detailMap["Reported at"]],
    ].filter(([, value]) => Boolean(value)),
  };
}

export function FeedbackPage() {
  const [companies, setCompanies] = useState<CompanyLookup[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof categoryOptions)[number]["value"]>("GeneralFeedback");
  const [priority, setPriority] = useState<(typeof priorityOptions)[number]["value"]>("Normal");
  const [message, setMessage] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPastFeedback, setShowPastFeedback] = useState(false);

  async function markRepliesRead(companyId: string) {
    await api.post<void>(`/feedback/mark-read?companyId=${companyId}`);
    setFeedbackItems((current) => current.map((item) => item.companyId === companyId ? { ...item, hasUnreadPlatformUpdate: false } : item));
    window.dispatchEvent(new Event("feedback-notifications-updated"));
  }

  useEffect(() => {
    void (async () => {
      const companyList = await api.get<CompanyLookup[]>("/companies");
      setCompanies(companyList);
      const initialCompanyId = companyList[0]?.id ?? "";
      setSelectedCompanyId(initialCompanyId);
      const items = await api.get<FeedbackItem[]>(initialCompanyId ? `/feedback?companyId=${initialCompanyId}` : "/feedback");
      setFeedbackItems(items);
      if (initialCompanyId && items.some((item) => item.hasUnreadPlatformUpdate)) {
        await markRepliesRead(initialCompanyId);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      return;
    }

    void api.get<FeedbackItem[]>(`/feedback?companyId=${selectedCompanyId}`)
      .then(async (items) => {
        setFeedbackItems(items);
        if (items.some((item) => item.hasUnreadPlatformUpdate)) {
          await markRepliesRead(selectedCompanyId);
        }
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load feedback."));
  }, [selectedCompanyId]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId),
    [companies, selectedCompanyId],
  );
  const isBugReport = category === "Bug";
  const activeFeedbackItems = useMemo(
    () => feedbackItems.filter((item) => item.status !== "Resolved" && item.status !== "Closed"),
    [feedbackItems],
  );
  const pastFeedbackItems = useMemo(
    () => feedbackItems.filter((item) => item.status === "Resolved" || item.status === "Closed"),
    [feedbackItems],
  );
  const unreadReplyCount = useMemo(
    () => feedbackItems.filter((item) => item.hasUnreadPlatformUpdate).length,
    [feedbackItems],
  );

  function buildStructuredMessage() {
    const sections = [message.trim()];

    if (isBugReport) {
      sections.push("");
      sections.push("[Bug details]");
      if (stepsToReproduce.trim()) {
        sections.push(`Steps to reproduce: ${stepsToReproduce.trim()}`);
      }
      if (expectedResult.trim()) {
        sections.push(`Expected result: ${expectedResult.trim()}`);
      }
      if (actualResult.trim()) {
        sections.push(`Actual result: ${actualResult.trim()}`);
      }

      const pageUrl = window.location.href;
      const browserInfo = navigator.userAgent;
      sections.push(`Page: ${pageUrl}`);
      sections.push(`Browser: ${browserInfo}`);
      sections.push(`Reported at: ${new Date().toISOString()}`);
    }

    return sections.join("\n");
  }

  async function submitFeedback() {
    if (!selectedCompanyId) {
      setError("Choose a company before sending feedback.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const created = await api.post<FeedbackItem>("/feedback", {
        companyId: selectedCompanyId,
        subject,
        category,
        priority,
        message: buildStructuredMessage(),
      });

      setFeedbackItems((current) => [created, ...current]);
      setSubject("");
      setCategory("GeneralFeedback");
      setPriority("Normal");
      setMessage("");
      setStepsToReproduce("");
      setExpectedResult("");
      setActualResult("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to send feedback.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Support</p>
          <h2>Feedback</h2>
          <p className="muted">Share bugs, suggestions, or billing issues with the platform owner.</p>
        </div>
      </header>

      {error ? <HelperText tone="error">{error}</HelperText> : null}
      {unreadReplyCount > 0 ? (
        <HelperText>{`${unreadReplyCount} feedback ${unreadReplyCount === 1 ? "reply is" : "replies are"} new from the platform owner.`}</HelperText>
      ) : null}

      <section className="card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">Send feedback</p>
            <h3 className="section-title">Tell us what needs attention</h3>
          </div>
        </div>
        {companies.length === 0 ? (
          <HelperText>Create a company first before sending feedback.</HelperText>
        ) : (
          <div className="form-stack">
            <label className="form-label">
              Company
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <div className="inline-fields settings-inline-fields-wide">
              <label className="form-label">
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Priority
                <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-label">
              Subject
              <input className="text-input" value={subject} maxLength={150} onChange={(event) => setSubject(event.target.value)} placeholder="Short summary" />
            </label>
            <label className="form-label">
              Message
              <textarea className="text-input settings-message-template" rows={7} value={message} maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what happened, what you expected, or what you want improved." />
            </label>
            {isBugReport ? (
              <>
                <label className="form-label">
                  Steps to reproduce
                  <textarea className="text-input settings-message-template" rows={4} value={stepsToReproduce} maxLength={2000} onChange={(event) => setStepsToReproduce(event.target.value)} placeholder="Tell us the exact steps so we can reproduce the bug." />
                </label>
                <div className="inline-fields settings-inline-fields-wide">
                  <label className="form-label">
                    Expected result
                    <textarea className="text-input settings-message-template" rows={4} value={expectedResult} maxLength={1000} onChange={(event) => setExpectedResult(event.target.value)} placeholder="What should have happened?" />
                  </label>
                  <label className="form-label">
                    Actual result
                    <textarea className="text-input settings-message-template" rows={4} value={actualResult} maxLength={1000} onChange={(event) => setActualResult(event.target.value)} placeholder="What happened instead?" />
                  </label>
                </div>
                <HelperText>
                  Page URL, browser info, and report time are added automatically for bug reports.
                </HelperText>
              </>
            ) : null}
            <div className="button-stack">
              <button type="button" className="button button-primary" disabled={saving || !subject.trim() || !message.trim()} onClick={() => void submitFeedback()}>
                {saving ? "Sending..." : "Send feedback"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-section-header">
          <div>
            <p className="eyebrow">History</p>
            <h3 className="section-title">Your submitted feedback</h3>
          </div>
        </div>
        {loading ? (
          <HelperText>Loading feedback...</HelperText>
        ) : feedbackItems.length === 0 ? (
          <HelperText>{selectedCompany ? `No feedback submitted for ${selectedCompany.name} yet.` : "No feedback submitted yet."}</HelperText>
        ) : (
          <div className="feedback-history-stack">
            <div className="feedback-history-group">
              <div className="feedback-history-header">
                <div>
                  <p className="eyebrow">Needs attention</p>
                  <strong>{activeFeedbackItems.length > 0 ? "Open feedback" : "No active feedback"}</strong>
                </div>
              </div>
              {activeFeedbackItems.length === 0 ? (
                <HelperText>No open or in-progress feedback right now.</HelperText>
              ) : (
                <div className="feedback-list">
                  {activeFeedbackItems.map((item) => {
                    const parsed = parseFeedbackMessage(item.message);

                    return (
                      <details key={item.id} className="feedback-card feedback-card-collapsible" open>
                        <summary className="feedback-card-summary">
                          <div>
                            <strong>{item.subject}</strong>
                            <div className="table-meta">
                              <span className="table-meta-item">{item.companyName}</span>
                              <span className="table-meta-item">{formatFeedbackLabel(item.category)}</span>
                              <span className="table-meta-item">{item.priority}</span>
                              <span className="table-meta-item">{new Date(item.createdAtUtc).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <span className={`status-pill ${item.status === "New" ? "status-pill-inactive" : ""}`}>
                            {formatFeedbackLabel(item.status)}
                          </span>
                        </summary>
                        <div className="feedback-card-body">
                          {item.hasUnreadPlatformUpdate ? (
                            <div className="feedback-unread-banner">New platform reply</div>
                          ) : null}
                          <p>{parsed.summary}</p>
                          {parsed.details.length > 0 ? (
                            <div className="feedback-detail-grid">
                              {parsed.details.map(([label, value]) => (
                                <div key={label} className="feedback-detail-item">
                                  <p className="eyebrow">{label}</p>
                                  <p>{value}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {item.adminNote ? (
                            <div className="feedback-admin-note">
                              <p className="eyebrow">Platform reply</p>
                              <p>{item.adminNote}</p>
                            </div>
                          ) : null}
                          <p className="muted">Submitted {new Date(item.createdAtUtc).toLocaleString()}</p>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>

            {pastFeedbackItems.length > 0 ? (
              <div className="feedback-history-group">
                <div className="feedback-history-header">
                  <div>
                    <p className="eyebrow">Past feedback</p>
                    <strong>{pastFeedbackItems.length} resolved or closed</strong>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary button-compact"
                    onClick={() => setShowPastFeedback((current) => !current)}
                  >
                    {showPastFeedback ? "Hide past feedback" : "View past feedback"}
                  </button>
                </div>
                {showPastFeedback ? (
                  <div className="feedback-list">
                    {pastFeedbackItems.map((item) => {
                      const parsed = parseFeedbackMessage(item.message);

                      return (
                        <details key={item.id} className="feedback-card feedback-card-collapsible">
                          <summary className="feedback-card-summary">
                            <div>
                              <strong>{item.subject}</strong>
                              <div className="table-meta">
                                <span className="table-meta-item">{item.companyName}</span>
                                <span className="table-meta-item">{formatFeedbackLabel(item.category)}</span>
                                <span className="table-meta-item">{item.priority}</span>
                                <span className="table-meta-item">{new Date(item.createdAtUtc).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <span className="status-pill status-pill-active">
                              {formatFeedbackLabel(item.status)}
                            </span>
                          </summary>
                          <div className="feedback-card-body">
                            {item.hasUnreadPlatformUpdate ? (
                              <div className="feedback-unread-banner">New platform reply</div>
                            ) : null}
                            <p>{parsed.summary}</p>
                            {parsed.details.length > 0 ? (
                              <div className="feedback-detail-grid">
                                {parsed.details.map(([label, value]) => (
                                  <div key={label} className="feedback-detail-item">
                                    <p className="eyebrow">{label}</p>
                                    <p>{value}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {item.adminNote ? (
                              <div className="feedback-admin-note">
                                <p className="eyebrow">Platform reply</p>
                                <p>{item.adminNote}</p>
                              </div>
                            ) : null}
                            <p className="muted">Submitted {new Date(item.createdAtUtc).toLocaleString()}</p>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
