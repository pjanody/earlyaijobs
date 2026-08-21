import { getJob, CATEGORY_LABELS, COMPANY_LABELS, COMPANY_LOGOS, WIDE_LOGOS, timeAgo, isFresh } from "../../../lib/db";
import { notFound } from "next/navigation";

// ---------------------------------------------------------------------------
// Description rendering. Descriptions are stored as plain text with newlines
// (HTML structure was flattened at ingestion), so headings like "The impact
// you will have:" arrive as ordinary lines and the whole posting reads as an
// undifferentiated wall. We rebuild light structure deterministically:
//   heading  = a short line ending in ":", or a known ATS section title
//   bullet   = a line starting with a list marker
//   paragraph = everything else
// No parsing of meaning, no guessing — a line either matches or it doesn't.
// ---------------------------------------------------------------------------

// Common section titles that appear WITHOUT a trailing colon.
const KNOWN_HEADINGS = new Set([
  "about the role", "about the team", "about the company", "about us",
  "about you", "about this role", "the role", "the team", "requirements",
  "responsibilities", "qualifications", "benefits", "compensation",
  "who you are", "who we are", "what you'll do", "what you will do",
  "what you'll work on", "what you bring", "nice to have", "bonus points",
  "minimum qualifications", "preferred qualifications", "why join us",
  "our culture", "perks", "perks & benefits", "interview process",
  "equal opportunity", "what we offer", "your impact", "in this role",
]);

function lineKind(line) {
  if (/^[•·◦▪-]\s+/.test(line)) return "bullet";
  const bare = line.replace(/:$/, "").replace(/[’]/g, "'").toLowerCase();
  if (line.length <= 70 && line.endsWith(":") && !/[.!?] /.test(line)) return "heading";
  if (line.length <= 45 && KNOWN_HEADINGS.has(bare)) return "heading";
  return "text";
}

function Description({ text }) {
  const blocks = [];
  let bullets = [];
  const flushBullets = (key) => {
    if (!bullets.length) return;
    blocks.push(<ul key={`ul-${key}`}>{bullets}</ul>);
    bullets = [];
  };

  String(text).split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const kind = lineKind(line);
    if (kind === "bullet") {
      bullets.push(<li key={i}>{line.replace(/^[•·◦▪-]\s+/, "")}</li>);
      return;
    }
    flushBullets(i);
    if (kind === "heading") blocks.push(<p className="desc-h" key={i}>{line}</p>);
    else blocks.push(<p key={i}>{line}</p>);
  });
  flushBullets("end");
  return <div className="desc">{blocks}</div>;
}

export const revalidate = 600;

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

  // JobPosting structured data — this is what makes a listing eligible for
  // Google's jobs experience. Deliberately omitted for closed roles: marking
  // an expired posting as an active JobPosting is exactly what search engines
  // penalise. The page stays live and readable; the structured claim does not.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || `${job.title} at ${company}.`,
    datePosted: job.first_published || job.first_seen_at,
    employmentType:
      job.employment_type && job.employment_type !== "unknown"
        ? job.employment_type.toUpperCase().replace("-", "_")
        : undefined,
    hiringOrganization: {
      "@type": "Organization",
      name: company,
    },
    jobLocation: job.location
      ? {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressLocality: job.location },
        }
      : undefined,
    // Only positively-confirmed remote earns the structured-data claim —
    // same evidence standard as the site's Remote filter.
    jobLocationType: job.is_remote === true ? "TELECOMMUTE" : undefined,
    directApply: false,
    url: `https://www.earlyaijobs.com/job/${job.id}`,
  };

  return (
    <div className="wrap detail">
      {!isClosed && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <a className="back" href="/">← All jobs</a>
      <div className="detail-head">
        <span className={`logo lg${WIDE_LOGOS.has(job.company_name) ? " wide" : ""}`} aria-hidden="true">
          <img src={COMPANY_LOGOS[job.company_name] || "/companies/databricks.svg"} alt="" />
        </span>
        <div>
          <h1>{job.title}</h1>
          <div className="sub">
            {/* Links to the company page — the internal links crawlers follow
                are what make /company/<slug> rank, not the sitemap alone. */}
            <a href={`/company/${job.company_name}`} style={{ color: "var(--text)", fontWeight: 600 }}>{company}</a>
            {job.location && <><span>·</span><span>{job.location}</span></>}
            {when && <span className={fresh ? "when new" : "when"}>{when}</span>}
          </div>
        </div>
      </div>
      <div className="meta" style={{ marginTop: 12 }}>
        {job.category && <span className="tag">{CATEGORY_LABELS[job.category] || job.category}</span>}
        {/* Only the verified Remote badge — the raw ATS workplace field is
            wrong too often to display (Ashby marks work-from-anywhere jobs
            "on-site"). Unknown is better than wrong. */}
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
        <a className="apply" href={job.url} target="_blank" rel="noopener noreferrer">
          Apply on {company}&apos;s site →
        </a>
      )}

      {job.description && <Description text={job.description} />}

      <p style={{ marginTop: 34, color: "var(--muted)", fontSize: 13 }}>
        Listing collected from {company}&apos;s public job feed. Applications are
        handled entirely on their site — EarlyAIJobs never collects your details.
      </p>
    </div>
  );
}
