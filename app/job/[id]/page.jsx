import {
  getJob, getSimilarJobs, CATEGORY_LABELS, COMPANY_LABELS, COMPANY_LOGOS,
  WIDE_LOGOS, timeAgo, isFresh,
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
  return (
    <div className="desc">
      {blocksOf(text).map((b, i) => {
        if (b.kind === "bullet-list") {
          return <ul key={i}>{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>;
        }
        if (b.kind === "heading") return <h2 className="desc-h" key={i}>{b.text}</h2>;
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}

/** Employer HTML was sanitized at ingestion (allowlist tags, validated links,
 *  no attributes survive from the source). The only render-time adjustment:
 *  demote any h1 to h2 so the page keeps a single h1 — a tag swap, never a
 *  text change. */
function HtmlDescription({ html }) {
  const demoted = html.replace(/<(\/?)h1>/gi, "<$1h2>");
  return <div className="desc desc-html" dangerouslySetInnerHTML={{ __html: demoted }} />;
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
            {job.is_remote === true && <span className="tag">remote</span>}
            {job.employment_type && job.employment_type !== "unknown" && <span className="tag">{job.employment_type}</span>}
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
              {job.employment_type && job.employment_type !== "unknown" && (
                <><dt>Type</dt><dd>{job.employment_type}</dd></>
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
                    {s.location ? ` · ${String(s.location).slice(0, 34)}` : ""}
                    {timeAgo(s.first_published) ? ` · ${timeAgo(s.first_published)}` : ""}
                  </span>
                </a>
              ))}
            </div>
          )}

          <div className="side-card">
            <h2>Share this job</h2>
            <div className="share-row">
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noopener noreferrer">X</a>
              <a href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(pageUrl)}`}>Email</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
