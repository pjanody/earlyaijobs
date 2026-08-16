import { getJob, CATEGORY_LABELS, COMPANY_LABELS, timeAgo, isFresh } from "../../../lib/db";
import { notFound } from "next/navigation";

export const revalidate = 600;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return { title: "Job not found — EarlyAIJobs" };
  const company = COMPANY_LABELS[job.company_name] || job.company_name;
  return {
    title: `${job.title} at ${company} — EarlyAIJobs`,
    description: `${job.title} at ${company}${job.location ? ` · ${job.location}` : ""}. Apply directly on the company's careers page.`,
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
    jobLocationType: job.workplace_type === "remote" ? "TELECOMMUTE" : undefined,
    directApply: false,
    url: `https://earlyaijobs.com/job/${job.id}`,
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
      <h1 style={{ marginTop: 14 }}>{job.title}</h1>
      <div className="sub">
        <strong style={{ color: "var(--text)" }}>{company}</strong>
        {job.location && <><span>·</span><span>{job.location}</span></>}
        {when && <span className={fresh ? "when fresh" : "when"}>{when}</span>}
      </div>
      <div className="meta" style={{ marginTop: 12 }}>
        {job.category && <span className="tag">{CATEGORY_LABELS[job.category] || job.category}</span>}
        {job.workplace_type && job.workplace_type !== "unknown" && <span className="tag">{job.workplace_type}</span>}
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

      {job.description && <div className="desc">{job.description}</div>}

      <p style={{ marginTop: 34, color: "var(--muted)", fontSize: 13 }}>
        Listing collected from {company}&apos;s public job feed. Applications are
        handled entirely on their site — EarlyAIJobs never collects your details.
      </p>
    </div>
  );
}
