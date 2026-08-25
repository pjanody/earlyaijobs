// /company/[slug] — dedicated SEO page per approved company.
//
// Why this exists: "anthropic jobs" / "openai careers" searches have real
// volume, and a filter parameter on the homepage can't rank for them — a
// dedicated URL with its own title, description, and canonical can. The page
// reuses the exact same data functions as the homepage: no new tables, no
// pipeline changes, nothing to drift.

import {
  getJobs, getCompanyStats, APPROVED_COMPANIES, CATEGORY_LABELS,
  COMPANY_LABELS, COMPANY_LOGOS, COMPANY_DESCRIPTIONS, COMPANY_WEBSITES,
  WIDE_LOGOS, displayLocation, timeAgo, freshness,
} from "../../../lib/db";
import { notFound } from "next/navigation";

export const revalidate = 600;

// NO generateStaticParams — deliberately. With it, these pages prerender at
// BUILD time, and the build then needs database access. The website component
// has the public keys, but the scheduled-job component builds this same repo
// without them, so its build dies trying to fetch job counts (that exact
// failure took down the 2026-08-21 deploy). Rendering on demand with a
// 10-minute cache behaves identically for visitors and keeps both builds
// database-free.

export async function generateMetadata({ params }) {
  const { slug } = await params;
  if (!APPROVED_COMPANIES.includes(slug)) return { title: "Company not found — EarlyAIJobs" };
  const company = COMPANY_LABELS[slug] || slug;
  const { total } = await getCompanyStats(slug);
  return {
    title: `${company} Jobs — ${total.toLocaleString()} open positions | EarlyAIJobs`,
    description: `Browse ${total.toLocaleString()} open jobs at ${company} — engineering, research, sales, operations and more. Sourced directly from ${company}'s official career feed and updated hourly.`,
    alternates: { canonical: `https://www.earlyaijobs.com/company/${slug}` },
    openGraph: {
      title: `${company} Jobs — ${total.toLocaleString()} open positions`,
      description: `Every open role at ${company}, updated hourly from their official career feed.`,
      url: `https://www.earlyaijobs.com/company/${slug}`,
    },
  };
}

export default async function CompanyPage({ params }) {
  const { slug } = await params;
  if (!APPROVED_COMPANIES.includes(slug)) notFound();

  const company = COMPANY_LABELS[slug] || slug;
  const [stats, { jobs }] = await Promise.all([
    getCompanyStats(slug),
    getJobs({ company: slug, perPage: 30 }),
  ]);
  const sortedCats = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="detail-head" style={{ marginBottom: 4 }}>
            <span className={`logo lg${WIDE_LOGOS.has(slug) ? " wide" : ""}`} aria-hidden="true">
              <img src={COMPANY_LOGOS[slug] || "/companies/databricks.svg"} alt="" />
            </span>
            <div>
              <h1>{company} jobs</h1>
              <p style={{ margin: "6px 0 0" }}>
                {stats.total.toLocaleString()} open positions · sourced directly
                from {company}&apos;s official career feed, updated hourly.
              </p>
            </div>
          </div>

          {COMPANY_DESCRIPTIONS[slug] && (
            <p style={{ maxWidth: 720, margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.65, color: "var(--text-secondary)" }}>
              {COMPANY_DESCRIPTIONS[slug]}
              {COMPANY_WEBSITES[slug] && (
                <>
                  {" "}
                  <a
                    href={COMPANY_WEBSITES[slug]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--sage)", fontWeight: 500, whiteSpace: "nowrap" }}
                  >
                    Visit {company}&apos;s website ↗
                  </a>
                </>
              )}
            </p>
          )}

          <div className="stats">
            <div className="stat">
              <b>{stats.total.toLocaleString()}</b>
              <span>open jobs</span>
            </div>
            <div className="stat fresh">
              <b>{stats.fresh.toLocaleString()}</b>
              <span>new in 48h</span>
            </div>
            {stats.remote > 0 && (
              <div className="stat">
                <b>{stats.remote.toLocaleString()}</b>
                <span>remote roles</span>
              </div>
            )}
            {stats.countryCount > 0 && (
              <div className="stat">
                <b>{stats.countryCount}</b>
                <span>{stats.countryCount === 1 ? "country" : "countries"}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 26 }}>
        {/* Never render a heading with nothing under it. When newly-added
            companies haven't been classified yet, an empty "Jobs by category"
            section reads as a broken feature rather than a pending one. */}
        {sortedCats.length > 0 && (
          <section className="category-companies" aria-label={`Categories ${company} is hiring in`}>
            <h2>Hiring in these categories</h2>
            <div className="company-chips">
              {sortedCats.map(([cat, n]) => (
                <a key={cat} className="company-chip" style={{ padding: "6px 14px" }} href={`/?company=${slug}&category=${cat}`}>
                  {CATEGORY_LABELS[cat] || cat} <span className="n">{n}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="list-toolbar">
          <span className="count">
            {stats.total.toLocaleString()} open {stats.total === 1 ? "role" : "roles"} · newest first
          </span>
          <span className="toolbar-actions">
            {stats.remote > 0 && (
              <a className="toolbar-btn" href={`/?company=${slug}&remote=1`}>Remote only</a>
            )}
            <a className="toolbar-btn" href={`/?company=${slug}`}>Filter by category or location</a>
          </span>
        </div>
        {jobs.map((job) => {
          const when = timeAgo(job.first_published);
          const state = freshness(job.first_published);
          return (
            <a className="job" key={job.id} href={`/job/${job.id}`}>
              <div className="job-main">
                <h2>{job.title}</h2>
                <div className="meta">
                  {job.location && <span>{displayLocation(job.location)}</span>}
                  {job.category && (
                    <span className="tag">{CATEGORY_LABELS[job.category] || job.category}</span>
                  )}
                  {job.is_remote === true && <span className="tag tag-remote">Remote</span>}
                </div>
              </div>
              {when && (
                <span className={`when ${state}`}>
                  {state === "new" ? `NEW · ${when}` : when}
                </span>
              )}
            </a>
          );
        })}

        <p style={{ margin: "26px 0 40px" }}>
          <a href={`/?company=${slug}`} style={{ color: "var(--sage)", fontWeight: 500 }}>
            Browse all {stats.total.toLocaleString()} {company} jobs →
          </a>
        </p>
      </div>
    </>
  );
}
