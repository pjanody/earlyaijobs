// /companies — hub page for company discovery. Six cards, each linking to the
// existing /company/[slug] pages (those URLs are live and indexed — the hub
// points at them, it does not replace them). Also an SEO page in its own
// right for "AI companies hiring" searches.

import {
  getCompanyHubStats, COMPANY_LABELS, COMPANY_LOGOS, WIDE_LOGOS,
} from "../../lib/db";

// Same window as the homepage so the two never show different totals for
// longer than a cache cycle.
export const revalidate = 300;

export const metadata = {
  title: "AI Companies Hiring Now — EarlyAIJobs",
  description:
    "Browse every company on EarlyAIJobs — OpenAI, Anthropic, Databricks, Scale AI, ElevenLabs and Replit — with live open-role counts, updated hourly from official career feeds.",
  alternates: { canonical: "https://www.earlyaijobs.com/companies" },
};

export default async function CompaniesPage() {
  const stats = await getCompanyHubStats();
  const sorted = [...stats].sort((a, b) => b.total - a.total);
  const totalAll = stats.reduce((n, s) => n + s.total, 0);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>AI companies hiring now.</h1>
          <p>
            {totalAll.toLocaleString()} open roles across {stats.length} companies,
            sourced directly from official career feeds and updated hourly.
          </p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 26, paddingBottom: 40 }}>
        <div className="company-grid">
          {sorted.map(({ slug, total, fresh }) => (
            <a className="company-card" key={slug} href={`/company/${slug}`}>
              <span className={`logo lg${WIDE_LOGOS.has(slug) ? " wide" : ""}`} aria-hidden="true">
                <img src={COMPANY_LOGOS[slug] || "/companies/databricks.svg"} alt="" loading="lazy" />
              </span>
              <div className="company-card-main">
                <h2>{COMPANY_LABELS[slug] || slug}</h2>
                <div className="meta">
                  <span>{total.toLocaleString()} open {total === 1 ? "role" : "roles"}</span>
                  {fresh > 0 && (
                    <>
                      <span className="dot">·</span>
                      <span style={{ color: "var(--sage)" }}>{fresh} new in 48h</span>
                    </>
                  )}
                </div>
              </div>
              <span className="company-card-cta">View jobs →</span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
