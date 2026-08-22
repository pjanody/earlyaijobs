import {
  getJob, getSimilarJobs, CATEGORY_LABELS, COMPANY_LABELS, COMPANY_LOGOS,
  WIDE_LOGOS, displayLocation, employmentLabel, timeAgo, isFresh,
} from "../../../lib/db";
import { notFound } from "next/navigation";

export const revalidate = 600;

// ---------------------------------------------------------------------------
// Description rendering — two paths, one contract: every employer word is
// shown, in the employer's order, with zero AI involvement.
//
//   description_html  (Phase B) — the employer's own structure, sanitized at
//                     ingestion through our allowlist. Preferred when present.
//   description       (plain text) — fallback for rows ingested before the
//                     html column existed. Deterministic heading/bullet/
//                     paragraph detection rebuilds light structure.
// ---------------------------------------------------------------------------

// Formatting logic lives in description-format.js so the fidelity tests run
// against the exact code production uses. This component only maps blocks to
// markup. Semantic h2s: the job title above is the page's only h1.
import { blocksOf } from "../../../description-format";

function TextDescription({ text }) {
  let sec = 0;
  return (
    <div className="desc">
      {blocksOf(text).map((b, i) => {
        if (b.kind === "bullet-list") {
          return <ul key={i}>{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>;
        }
        if (b.kind === "heading") return <h2 className="desc-h" id={`sec-${sec++}`} key={i}>{b.text}</h2>;
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}

/** Employer HTML was sanitized at ingestion (allowlist tags, validated links,
 *  no attributes survive from the source). Render-time adjustments are
 *  markup-only, never text: h1 demoted to h2 (the job title is the page's
 *  only h1), and each h2 gets a stable id so the jump-nav can anchor to it. */
function prepareHtml(html) {
  let i = 0;
  return html
    .replace(/<(\/?)h1>/gi, "<$1h2>")
    .replace(/<h2>/gi, () => `<h2 id="sec-${i++}">`);
}

/** Section labels for the jump-nav, from whichever description path renders.
 *  Purely derived — nothing is invented; a posting with no headings gets no nav. */
function sectionLabels(job) {
  if (job.description_html) {
    const withH2 = job.description_html.replace(/<(\/?)h1>/gi, "<$1h2>");
    return [...withH2.matchAll(/<h2>([\s\S]*?)<\/h2>/gi)]
      .map((m) => m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  if (job.description) {
    return blocksOf(job.description).filter((b) => b.kind === "heading").map((b) => b.text);
  }
  return [];
}

function HtmlDescription({ html }) {
  return <div className="desc desc-html" dangerouslySetInnerHTML={{ __html: prepareHtml(html) }} />;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return { title: "Job not found — EarlyAIJobs" };
  const company = COMPANY_LABELS[job.company_name] || job.company_name;
  return {
    title: `${job.title} at ${company} — EarlyAIJobs`,
    description: `${job.title} at ${company}${job.location ? ` · ${job.location}` : ""}. Apply directly on the company's careers page.`,
    alternates: { canonical: `https://www.earlyaijobs.com/job/${job.id}` },
  };
}

export default async function JobPage({ params }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const company = COMPANY_LABELS[job.company_name] || job.company_name;
  const when = timeAgo(job.first_published);
  const fresh = isFresh(job.first_published);
  const isClosed = job.is_open === false;
  const similar = isClosed ? [] : await getSimilarJobs(job);

  const pageUrl = `https://www.earlyaijobs.com/job/${job.id}`;
  const shareText = `${job.title} at ${company}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description_html || job.description || `${job.title} at ${company}.`,
    datePosted: job.first_published || job.first_seen_at,
    employmentType:
      job.employment_type && job.employment_type !== "unknown"
        ? job.employment_type.toUpperCase().replace("-", "_")
        : undefined,
    hiringOrganization: { "@type": "Organization", name: company },
    jobLocation: job.location
      ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } }
      : undefined,
    jobLocationType: job.is_remote === true ? "TELECOMMUTE" : undefined,
    directApply: false,
    url: pageUrl,
  };

  const applyCta = (
    <a className="apply" href={job.url} target="_blank" rel="noopener noreferrer">
      Apply on {company}&apos;s site ↗
    </a>
  );

  return (
    <div className="wrap detail">
      {!isClosed && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}

      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/">← All jobs</a>
        {job.category && (
          <>
            <span className="sep">/</span>
            <a href={`/?category=${job.category}`}>{CATEGORY_LABELS[job.category] || job.category}</a>
          </>
        )}
        <span className="sep">/</span>
        <a href={`/company/${job.company_name}`}>{company}</a>
      </nav>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="detail-head">
            <span className={`logo lg${WIDE_LOGOS.has(job.company_name) ? " wide" : ""}`} aria-hidden="true">
              <img src={COMPANY_LOGOS[job.company_name] || "/companies/databricks.svg"} alt="" />
            </span>
            <div>
              <h1>{job.title}</h1>
              <div className="sub">
                <a href={`/company/${job.company_name}`} style={{ color: "var(--text)", fontWeight: 600 }}>{company}</a>
                {job.location && <><span>·</span><span>{job.location}</span></>}
                {when && <span className={fresh ? "when new" : "when"}>{when}</span>}
              </div>
            </div>
          </div>

          <div className="meta" style={{ marginTop: 12 }}>
            {job.category && <span className="tag">{CATEGORY_LABELS[job.category] || job.category}</span>}
            {job.is_remote === true && <span className="tag tag-remote">Remote</span>}
            {employmentLabel(job.employment_type) && <span className="tag">{employmentLabel(job.employment_type)}</span>}
          </div>

          {isClosed ? (
            <div className="closed-notice">
              <strong>This role is no longer accepting applications.</strong>
              <div>
                It was removed from {company}&apos;s job feed
                {job.last_seen_at ? ` around ${new Date(job.last_seen_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}.
                Browse <a href="/">current openings</a>
                {job.category ? <> or see other <a href={`/?category=${job.category}`}>{(CATEGORY_LABELS[job.category] || job.category).toLowerCase()} roles</a></> : null}.
              </div>
            </div>
          ) : (
            <div className="apply-inline">{applyCta}</div>
          )}

          {(() => {
            const labels = sectionLabels(job);
            // Only long, well-structured postings earn a jump-nav; a short
            // posting with two sections doesn't need navigation chrome.
            if (labels.length < 4) return null;
            return (
              <nav className="toc" aria-label="Sections of this job posting">
                <span className="toc-label">On this page:</span>
                {labels.map((label, i) => (
                  <a key={i} href={`#sec-${i}`}>{label}</a>
                ))}
              </nav>
            );
          })()}

          {job.description_html
            ? <HtmlDescription html={job.description_html} />
            : job.description && <TextDescription text={job.description} />}

          <p className="provenance">
            Listing collected from {company}&apos;s official careers feed.
            EarlyAIJobs is not affiliated with {company}; applications are
            handled entirely on their site and EarlyAIJobs never collects your
            details.
          </p>
        </div>

        <aside className="detail-side">
          {!isClosed && (
            <div className="side-card apply-card">
              <h2>Apply now</h2>
              {applyCta}
              <p>You&apos;ll continue on {company}&apos;s official careers site.</p>
            </div>
          )}

          <div className="side-card">
            <h2>Job snapshot</h2>
            <dl className="snapshot">
              <dt>Company</dt><dd><a href={`/company/${job.company_name}`}>{company}</a></dd>
              {job.category && <><dt>Category</dt><dd>{CATEGORY_LABELS[job.category] || job.category}</dd></>}
              {job.location && <><dt>Location</dt><dd>{job.location}</dd></>}
              {when && <><dt>Posted</dt><dd>{when}</dd></>}
              {job.is_remote === true && <><dt>Workplace</dt><dd>Remote</dd></>}
              {employmentLabel(job.employment_type) && (
                <><dt>Type</dt><dd>{employmentLabel(job.employment_type)}</dd></>
              )}
            </dl>
          </div>

          {similar.length > 0 && (
            <div className="side-card">
              <h2>Similar jobs</h2>
              {similar.map((s) => (
                <a className="similar" key={s.id} href={`/job/${s.id}`}>
                  <span className="similar-title">{s.title}</span>
                  <span className="similar-meta">
                    {COMPANY_LABELS[s.company_name] || s.company_name}
                    {s.location ? ` · ${String(displayLocation(s.location, 1)).slice(0, 38)}` : ""}
                    {timeAgo(s.first_published) ? ` · ${timeAgo(s.first_published)}` : ""}
                  </span>
                </a>
              ))}
            </div>
          )}

          <div className="side-card">
            <h2>Share this job</h2>
            <div className="share-row">
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noopener noreferrer">
                {/* LinkedIn mark, drawn inline so it inherits theme colors */}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                  <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.32 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.1 20.45H3.53V9H7.1v11.45z" />
                </svg>
                LinkedIn
              </a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noopener noreferrer">
                {/* X mark */}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
                </svg>
                X
              </a>
              <a href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(pageUrl)}`}>
                {/* envelope */}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
                  <path d="m3 6 9 7 9-7" />
                </svg>
                Email
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile-only sticky Apply bar — long postings are exactly where the
          top button scrolls out of reach. Hidden on desktop (the sidebar
          card is sticky there) and on closed roles. */}
      {!isClosed && (
        <div className="mobile-apply-bar">
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Apply on {company}&apos;s site ↗
          </a>
        </div>
      )}
    </div>
  );
}
