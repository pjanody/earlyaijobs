import {
  getJobs, getCategoryCounts, getCompanyCounts,
  CATEGORY_LABELS, COMPANY_LABELS, timeAgo, isFresh,
} from "../lib/db";

export const revalidate = 300; // rebuild the page at most every 5 minutes

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

  const [{ jobs, total }, catCounts, coCounts] = await Promise.all([
    getJobs({ category, company, remote, q, page }),
    getCategoryCounts(),
    getCompanyCounts(),
  ]);

  const totalAll = Object.values(coCounts).reduce((a, b) => a + b, 0);
  const freshCount = jobs.filter((j) => isFresh(j.first_published)).length;
  const perPage = 50;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const sortedCos = Object.entries(coCounts).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Every open job at the leading AI companies.</h1>
          <p>
            Continuously refreshed from company job feeds and sorted newest first,
            so you see roles while they are still fresh.
          </p>
          <div className="stats">
            <div className="stat">
              <b>{totalAll.toLocaleString()}</b>
              <span>open jobs</span>
            </div>
            <div className="stat">
              <b>{sortedCos.length}</b>
              <span>AI companies</span>
            </div>
            <div className="stat">
              <b>{sortedCats.length}</b>
              <span>categories</span>
            </div>
          </div>
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
            />
            <button type="submit">Search</button>
          </form>

          <div className="count">
            {total.toLocaleString()} {total === 1 ? "job" : "jobs"}
            {q && <> matching “{q}”</>}
            {company && <> at {COMPANY_LABELS[company] || company}</>}
            {category && <> in {CATEGORY_LABELS[category] || category}</>}
            {freshCount > 0 && <> · {freshCount} posted in the last 48h</>}
          </div>

          {jobs.length === 0 && (
            <p style={{ color: "var(--muted)", padding: "26px 0" }}>
              No jobs match those filters. <a href="/" style={{ textDecoration: "underline" }}>Clear filters</a>
            </p>
          )}

          {jobs.map((job) => {
            const when = timeAgo(job.first_published);
            const fresh = isFresh(job.first_published);
            return (
              <a className="job" key={job.id} href={`/job/${job.id}`}>
                <div className="job-top">
                  <h2>{job.title}</h2>
                  {when && <span className={fresh ? "when fresh" : "when"}>{when}</span>}
                </div>
                <div className="meta">
                  <span className="co">{COMPANY_LABELS[job.company_name] || job.company_name}</span>
                  {job.location && (<><span className="dot">·</span><span>{job.location}</span></>)}
                  {job.category && <span className="tag">{CATEGORY_LABELS[job.category] || job.category}</span>}
                  {job.workplace_type === "remote" && <span className="tag">Remote</span>}
                </div>
              </a>
            );
          })}

          {lastPage > 1 && (
            <div className="pager">
              {page > 1
                ? <a href={qs({ category, company, q, remote, page: page - 1 })}>← Previous</a>
                : <span>← Previous</span>}
              <span style={{ border: 0, color: "var(--muted)" }}>Page {page} of {lastPage}</span>
              {page < lastPage
                ? <a href={qs({ category, company, q, remote, page: page + 1 })}>Next →</a>
                : <span>Next →</span>}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
