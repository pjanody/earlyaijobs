import {
  getJobs, getCategoryCounts, getCompanyCounts, getTotalCount, getFreshCount,
  getLastUpdated, CATEGORY_LABELS, COMPANY_LABELS, COMPANY_LOGOS, WIDE_LOGOS,
  timeAgo, freshness,
} from "../lib/db";

export const revalidate = 300;

function qs(params) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const category = sp?.category || "";
  const company = sp?.company || "";
  const remote = sp?.remote || "";
  const q = sp?.q || "";
  const page = Math.max(1, Number(sp?.page) || 1);

  const [{ jobs, total }, catCounts, coCounts, totalAll, freshCount, lastUpdated] =
    await Promise.all([
      getJobs({ category, company, remote, q, page }),
      getCategoryCounts(),
      getCompanyCounts(),
      getTotalCount(),
      getFreshCount(),
      getLastUpdated(),
    ]);

  const perPage = 50;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const sortedCos = Object.entries(coCounts).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Fresh jobs from leading AI companies.</h1>
          <p>
            Every role — engineering, research, sales, finance, operations and
            more — sourced directly from company career feeds.
          </p>

          <div className="stats">
            <div className="stat">
              <b>{totalAll.toLocaleString()}</b>
              <span>open jobs</span>
            </div>
            <div className="stat fresh">
              <b>{freshCount.toLocaleString()}</b>
              <span>new in 48h</span>
            </div>
            <div className="stat">
              <b>{sortedCos.length}</b>
              <span>AI companies</span>
            </div>
          </div>

          {lastUpdated && (
            <div className="updated">
              <span className="pulse" />
              Updated hourly from official career feeds · last checked{" "}
              {timeAgo(lastUpdated)}
            </div>
          )}
        </div>
      </section>

      <div className="wrap layout">
        <aside className="filters">
          <h3>Company</h3>
          <a className={!company ? "on" : ""} href={qs({ category, q, remote })}>
            All companies <span className="n">{totalAll}</span>
          </a>
          {sortedCos.map(([slug, n]) => (
            <a
              key={slug}
              className={company === slug ? "on" : ""}
              href={qs({ company: company === slug ? "" : slug, category, q, remote })}
            >
              {COMPANY_LABELS[slug] || slug} <span className="n">{n}</span>
            </a>
          ))}

          <h3>Category</h3>
          <a className={!category ? "on" : ""} href={qs({ company, q, remote })}>
            All categories <span className="n">{totalAll}</span>
          </a>
          {sortedCats.map(([slug, n]) => (
            <a
              key={slug}
              className={category === slug ? "on" : ""}
              href={qs({ category: category === slug ? "" : slug, company, q, remote })}
            >
              {CATEGORY_LABELS[slug] || slug} <span className="n">{n}</span>
            </a>
          ))}

          <h3>Workplace</h3>
          <a
            className={remote === "1" ? "on" : ""}
            href={qs({ remote: remote === "1" ? "" : "1", category, company, q })}
          >
            Remote only
          </a>
        </aside>

        <main>
          <form className="search" action="/" method="get">
            {category && <input type="hidden" name="category" value={category} />}
            {company && <input type="hidden" name="company" value={company} />}
            {remote && <input type="hidden" name="remote" value={remote} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search job titles — e.g. engineer, research, sales"
              aria-label="Search job titles"
            />
            <button type="submit">Search</button>
          </form>

          <div className="count">
            {total.toLocaleString()} {total === 1 ? "job" : "jobs"}
            {q && <> matching “{q}”</>}
            {company && <> at {COMPANY_LABELS[company] || company}</>}
            {category && <> in {CATEGORY_LABELS[category] || category}</>}
          </div>

          {jobs.length === 0 && (
            <p style={{ color: "var(--text-muted)", padding: "24px 0" }}>
              No jobs match those filters.{" "}
              <a href="/" style={{ color: "var(--sage)", textDecoration: "underline" }}>
                Clear filters
              </a>
            </p>
          )}

          {jobs.map((job) => {
            const when = timeAgo(job.first_published);
            const state = freshness(job.first_published); // new | recent | old
            return (
              <a className="job" key={job.id} href={`/job/${job.id}`}>
                <span className={`logo${WIDE_LOGOS.has(job.company_name) ? " wide" : ""}`} aria-hidden="true">
                  <img
                    src={COMPANY_LOGOS[job.company_name] || "/companies/databricks.svg"}
                    alt=""
                    loading="lazy"
                  />
                </span>
                <div className="job-main">
                  <h2>{job.title}</h2>
                  <div className="meta">
                    <span className="co">
                      {COMPANY_LABELS[job.company_name] || job.company_name}
                    </span>
                    {job.location && (
                      <>
                        <span className="dot">·</span>
                        <span>{job.location}</span>
                      </>
                    )}
                    {job.category && (
                      <span className="tag">
                        {CATEGORY_LABELS[job.category] || job.category}
                      </span>
                    )}
                    {job.workplace_type === "remote" && <span className="tag">Remote</span>}
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

          {lastPage > 1 && (
            <div className="pager">
              {page > 1 ? (
                <a href={qs({ category, company, q, remote, page: page - 1 })}>← Previous</a>
              ) : (
                <span className="disabled">← Previous</span>
              )}
              <span style={{ border: 0, background: "transparent" }}>
                Page {page} of {lastPage}
              </span>
              {page < lastPage ? (
                <a href={qs({ category, company, q, remote, page: page + 1 })}>Next →</a>
              ) : (
                <span className="disabled">Next →</span>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
