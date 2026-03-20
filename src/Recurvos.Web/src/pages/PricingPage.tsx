import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { getPackageDisplayName, getPackageMarketingContent } from "../lib/packages";
import { api } from "../lib/api";
import type { PlatformPackage } from "../types";

export function PricingPage() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PlatformPackage[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<PlatformPackage[]>("/public/packages")
      .then(setPackages)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load packages."));
  }, []);

  return (
    <AuthLayout wide title="Choose a package" subtitle="Pick the package that fits your billing workflow, then create your subscriber account.">
      {error ? <p className="helper-text helper-text-error">{error}</p> : null}
      <div className="pricing-grid">
        {packages.map((item) => {
          const marketing = getPackageMarketingContent(item.code);
          const displayName = getPackageDisplayName(item.code, item.name);
          const pricingToneClass = item.code === "growth"
            ? "pricing-card pricing-card-featured"
            : item.code === "premium"
              ? "pricing-card pricing-card-premium"
              : "pricing-card pricing-card-starter";

          return (
            <article key={item.id} className={pricingToneClass}>
              <div className="pricing-card-header">
                <div className="pricing-card-topline">
                  <p className="eyebrow">{displayName}</p>
                  {item.code === "growth" ? <span className="pricing-badge">Most popular</span> : null}
                </div>
                <h3>{item.priceLabel}</h3>
                <p className="pricing-fit-line">{marketing.fit}</p>
              </div>
              <div className="pricing-story">
                <p className="pricing-story-lead">{marketing.lead}</p>
                <div className="pricing-story-list">
                  {marketing.highlights.map((highlight) => (
                    <p key={highlight}>{highlight}</p>
                  ))}
                </div>
              </div>
              <div className="pricing-note">
                <p>{marketing.note}</p>
              </div>
              <Button type="button" onClick={() => navigate(`/onboarding?package=${item.code}`)}>
                {marketing.cta}
              </Button>
            </article>
          );
        })}
      </div>
      <div className="button-stack">
        <Button type="button" variant="secondary" onClick={() => navigate("/login")}>
          Sign in
        </Button>
      </div>
    </AuthLayout>
  );
}
