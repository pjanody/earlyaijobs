import { COMPANY_LABELS, COMPANY_LOGOS, WIDE_LOGOS, APPROVED_COMPANIES, getCompanyCounts, getTotalCount } from "../../lib/db";

export const revalidate = 3600;

export const metadata = {
  title: "About — EarlyAIJobs",
  description:
    "EarlyAIJobs tracks every open role at leading AI companies — engineering, research, sales, legal, operations and more — sourced from official career feeds and refreshed continuously.",
};

export default async function About() {
  const [counts, total] = await Promise.all([getCompanyCounts(), getTotalCount()]);

  return (
    <div className="wrap detail">
      <a className="back" href="/">← All jobs</a>
      <h1 style={{ marginTop: 14 }}>About EarlyAIJobs</h1>

      <div className="prose">
        <p>
          EarlyAIJobs tracks open positions at leading artificial intelligence
          companies.
        </p>

        <p>
          Most AI job boards list only machine learning and engineering roles.
          EarlyAIJobs lists <strong>every open job</strong> at the companies we
          track — research and engineering, but equally product, design, sales,
          marketing, finance, legal, operations and recruiting. AI companies are
          hiring across every function, and the people who want to work at them
          are not all engineers.
        </p>

        <p>
          Listings come directly from each company&apos;s official career feed and
          are refreshed continuously, then sorted newest first — so you can
          discover roles while they&apos;re still fresh. When you find
          something, we send you straight to the employer&apos;s own application
          page. EarlyAIJobs never collects your details and never charges you.
        </p>

        <h2>Companies we track</h2>
        <ul className="company-list">
          {APPROVED_COMPANIES.map((slug) => (
            <li key={slug}>
              <a href={`/?company=${slug}`}>
                <span className={`logo${WIDE_LOGOS.has(slug) ? " wide" : ""}`} aria-hidden="true">
                  <img src={COMPANY_LOGOS[slug] || "/companies/databricks.svg"} alt="" />
                </span>
                <span>{COMPANY_LABELS[slug] || slug}</span>
                <span className="n">{counts[slug] || 0} open roles</span>
              </a>
            </li>
          ))}
        </ul>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          {total.toLocaleString()} open roles tracked in total. We&apos;re
          expanding coverage as we identify reliable career feeds from additional
          AI companies.
        </p>

        <h2>How it works</h2>
        <p>
          An automated pipeline reads each company&apos;s public job feed, stores
          new and updated listings, marks roles closed once they disappear from
          the source, and assigns each job a category so you can filter by
          function. Published categories and filters come from deterministic,
          inspectable rules — no AI decides what you see, and when a label is
          wrong we can trace exactly why and correct it.
        </p>

        <h2>Who made it</h2>
        <p>
          EarlyAIJobs was built by Patrick Janody, a community and account
          manager — not a software engineer — as a way to learn modern tooling by
          shipping something real, and to solve a problem he had himself: finding
          non-engineering roles at AI companies without wading through listings
          aimed at ML researchers.
        </p>

        <p style={{ marginTop: 28 }}>
          <a className="apply" href="/">Browse open jobs →</a>
        </p>
      </div>
    </div>
  );
}
