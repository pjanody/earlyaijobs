// /jobs/[category] — the permanent home of each job category.
//
// Batch C of the SEO plan (2026-08-24). Before this route existed, categories
// were only reachable as /?category=engineering — query-string views that
// Google indexes poorly and nobody can meaningfully link to. This page is the
// destination version: stable URL, category-specific metadata, a factual
// intro, the companies actually hiring in the category, and the live listing.
//
// Whitelist-only: a slug not in CATEGORY_LABELS is a 404, never a rendered
// page — same untrusted-input rule as the filter metadata. The query-string
// view keeps working for filter UX, but canonicalises here (lib/seo.js).

import SaveButton from "../../save-button";
import { notFound } from "next/navigation";
import {
  getJobs, getCategoryCompanyCounts, CATEGORY_LABELS, COMPANY_LABELS,
  COMPANY_LOGOS, WIDE_LOGOS, COUNTRY_LABELS, REGION_LABELS, POSTED_WINDOWS,
  displayLocation, timeAgo, freshness,
} from "../../../lib/db";
import { buildCategoryMetadata, buildHeading, buildSubheading, readFilters } from "../../../lib/seo";
import { CATEGORY_INTROS } from "../../../lib/category-content";

export const revalidate = 300;

const seoLabels = () => ({
  categories: CATEGORY_LABELS, companies: COMPANY_LABELS,
  countries: COUNTRY_LABELS, regions: REGION_LABELS, postedWindows: POSTED_WINDOWS,
});

export async function generateMetadata({ params, searchParams }) {
  const { category } = await params;
  const meta = buildCategoryMetadata(category, seoLabels(), { intro: CATEGORY_INTROS[category] });
  if (!meta) return { title: "Category not found — EarlyAIJobs" };
  // Pages 2+ are for readers paging through, not for the index — the same
  // crawl-trap rule the homepage filters follow.
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);
  if (page > 1) {
    return { ...meta, title: `${meta.title.replace(" | EarlyAIJobs", "")} — Page ${page} | EarlyAIJobs`, robots: { index: false, follow: true } };
  }
  return meta;
}

export default async function CategoryPage({ params, searchParams }) {
  const { category } = await params;
  if (!CATEGORY_LABELS[category]) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);

  const [{ jobs, total }, companies] = await Promise.all([
    getJobs({ category, page }),
    getCategoryCompanyCounts(category),
  ]);

  const labels = seoLabels();
  const f = readFilters({ category }, labels);
  const heading = buildHeading(f, labels);
  const subheading = buildSubheading(f, labels, total);
  const intro = CATEGORY_INTROS[category];
  const label = CATEGORY_LABELS[category];

  const perPage = 50;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const pageHref = (p) => (p > 1 ? `/jobs/${category}?page=${p}` : `/jobs/${category}`);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "All jobs", item: "https://www.earlyaijobs.com/" },
      { "@type": "ListItem", position: 2, name: label, item: `https://www.earlyaijobs.com/jobs/${category}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <section className="hero">
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb" style={{ marginBottom: 10 }}>
            <a href="/">← All jobs</a>
            <span className="sep">/</span>
            <span>{label}</span>
          </nav>
          <h1>{heading}</h1>
          <p>{subheading}</p>
          {intro && <p className="category-intro">{intro}</p>}
        </div>
      </section>

      <div className="wrap">
        {companies.length > 0 && (
          <section className="category-companies" aria-label={`Companies hiring in ${label}`}>
            <h2>Hiring {label.toLowerCase()} now</h2>
            <div className="company-chips">
              {companies.map(({ slug, count }) => (
                <a key={slug} className="company-chip" href={`/company/${slug}`}>
                  <span className={`logo${WIDE_LOGOS.has(slug) ? " wide" : ""}`} aria-hidden="true">
                    <img src={COMPANY_LOGOS[slug] || "/companies/databricks.svg"} alt="" loading="lazy" />
                  </span>
                  {COMPANY_LABELS[slug] || slug} <span className="n">{count}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <main>
          {/* Statement on the left, actions on the right as sage pill
              buttons. Earlier drafts rendered the actions as inline muted
              text ("· remote only ·"), which read as claims about the list
              rather than things you can click. */}
          <div className="list-toolbar">
            <span className="count">
              {total.toLocaleString()} open {label.toLowerCase()} {total === 1 ? "job" : "jobs"} · newest first
            </span>
            <span className="toolbar-actions">
              <a className="toolbar-btn" href={`/?category=${category}&remote=1`}>Remote only</a>
              {/* Category pages carry no filter sidebar by design; the full
                  machinery lives on the homepage. This sends the reader there
                  with the category pre-applied. Labelled by WHAT IT DOES —
                  an earlier "All filters" label landed users on a page with
                  the same jobs and no visible change, which read as a no-op. */}
              <a className="toolbar-btn" href={`/?category=${category}`}>Filter by company or location</a>
            </span>
          </div>

          {jobs.length === 0 && (
            <p style={{ color: "var(--text-muted)", padding: "24px 0" }}>
              No open {label.toLowerCase()} roles right now. <a href="/">See all jobs</a>.
            </p>
          )}

          {jobs.map((job) => {
            const when = timeAgo(job.first_published);
            const state = freshness(job.first_published);
            return (
              <a className="job" key={job.id} href={`/job/${job.id}`}>
                <span className={`logo${WIDE_LOGOS.has(job.company_name) ? " wide" : ""}`} aria-hidden="true">
                  <img src={COMPANY_LOGOS[job.company_name] || "/companies/databricks.svg"} alt="" loading="lazy" />
                </span>
                <div className="job-main">
                  <h2>{job.title}</h2>
                  <div className="meta">
                    <span className="co">{COMPANY_LABELS[job.company_name] || job.company_name}</span>
                    {job.location && (
                      <>
                        <span className="dot">·</span>
                        <span>{displayLocation(job.location)}</span>
                      </>
                    )}
                    {job.is_remote === true && <span className="tag tag-remote">Remote</span>}
                  </div>
                </div>
                <span className="save-slot"><SaveButton jobId={job.id} /></span>
                {when && <span className={`when ${state}`}>{state === "new" ? `NEW · ${when}` : when}</span>}
              </a>
            );
          })}

          {lastPage > 1 && (
            <div className="pager">
              {page > 1 ? <a href={pageHref(1)} title="First page">« First</a> : <span className="disabled">« First</span>}
              {page > 1 ? <a href={pageHref(page - 1)}>← Previous</a> : <span className="disabled">← Previous</span>}
              <span style={{ border: 0, background: "transparent" }}>Page {page} of {lastPage}</span>
              {page < lastPage ? <a href={pageHref(page + 1)}>Next →</a> : <span className="disabled">Next →</span>}
              {page < lastPage ? <a href={pageHref(lastPage)} title="Last page">Last »</a> : <span className="disabled">Last »</span>}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
