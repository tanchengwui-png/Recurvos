import { useNavigate } from "react-router-dom";
import { InlineLink } from "../components/ui/InlineLink";
import { buildAppSiteUrl } from "../lib/siteUrls";

type InfoSection = {
  title?: string;
  paragraphs?: string[];
  bullets?: string[];
};

export function InfoPage({
  eyebrow = "Recurvo",
  title,
  subtitle,
  sections,
  modal = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  sections?: InfoSection[];
  modal?: boolean;
}) {
  const navigate = useNavigate();
  const content = (
    <section className={`card auth-card auth-card-surface ${modal ? "info-modal-card modal-card" : ""}`.trim()}>
      {modal ? (
        <div className="info-modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="button button-secondary info-modal-close" onClick={() => navigate(-1)}>
            Close
          </button>
        </div>
      ) : (
        <>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        </>
      )}
      {sections?.length ? (
        <div className={`form-stack ${modal ? "info-modal-content" : ""}`.trim()}>
          {sections.map((section) => (
            <section
              key={section.title ?? section.paragraphs?.join("|") ?? section.bullets?.join("|")}
              className={`form-stack ${modal ? "info-modal-section" : ""}`.trim()}
            >
              {section.title ? <h3 className="section-title">{section.title}</h3> : null}
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="muted">{paragraph}</p>
              ))}
              {section.bullets?.length ? (
                <ul className="helper-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
      {modal ? null : <InlineLink href={buildAppSiteUrl("/login")}>Back to sign in</InlineLink>}
    </section>
  );

  if (modal) {
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => navigate(-1)}>
        <div className="info-modal-shell" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-stack auth-stack-wide">
        {content}
      </div>
    </div>
  );
}
