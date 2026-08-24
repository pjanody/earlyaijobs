import SaveButton from "./save-button";
import NewSinceBanner from "./new-since-banner";
import {
  getJobs, getCategoryCounts, getCompanyCounts, getCountryCounts, getTotalCount,
  getFreshCount, getRemoteCount, getLastUpdated, CATEGORY_LABELS, COMPANY_LABELS,
  COMPANY_LOGOS, WIDE_LOGOS, COUNTRY_LABELS, REGION_LABELS, POSTED_WINDOWS,
  displayLocation, validSince, timeAgo, freshness,
} from "../lib/db";
import { buildMetadata, buildHeading, buildSubheading, readFilters } from "../lib/seo";

// Auto-submit the filter form when a control changes (falls back to the Apply
// button with JavaScript off), and open the mobile filters drawer by default
// on desktop widths.
const filterScript = `
(function(){
  var form = document.getElementById('filter-form');
  if (form) form.addEventListener('change', function(){ form.submit(); });
  var drawer = document.getElementById('filters-drawer');
  if (drawer && window.matchMedia('(min-width: 861px)').matches) drawer.open = true;
})();
`;

export const revalidate = 300;

// Per-filter SEO metadata. The logic lives in lib/seo.js so it can be unit
// tested without a database or a browser; this is just the wiring. See that
// file for why it exists — in short, ~55 sitemap URLs were all serving the
// same title, so search engines saw them as one page.
export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  return buildMetadata(sp, {
    categories: CATEGORY_LABELS,
    companies: COMPANY_LABELS,
    countries: COUNTRY_LABELS,
    regions: REGION_LABELS,
    postedWindows: POSTED_WINDOWS,
  });
}

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
  const country = sp?.country || "";
  const posted = POSTED_WINDOWS[sp?.posted] ? sp.posted : "";
  const since = validSince(sp?.since) ? sp.since : "";
  const q = sp?.q || "";
  const page = Math.max(1, Number(sp?.page) || 1);

  const [{ jobs, total }, catCounts, coCounts, countryCounts, totalAll, freshCount, remoteCount, lastUpdated] =
    await Promise.all([
      getJobs({ category, company, remote, country, posted, since, q, page }),
      getCategoryCounts(),
      getCompanyCounts(),
      getCountryCounts(),
      getTotalCount(),
      getFreshCount(),
      getRemoteCount(),
      getLastUpdated(),
    ]);

  const perPage = 50;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const sortedCos = Object.entries(coCounts).sort((a, b) => b[1] - a[1]);
  // Countries by job count; region-wide entries appended at the end. Only
  // places that actually have jobs ever appear.
  const sortedCountries = Object.entries(countryCounts.countries).sort((a, b) => b[1] - a[1]);
  const sortedRegions = Object.entries(countryCounts.regions)
    .filter(([code]) => REGION_LABELS[code])
    .sort((a, b) => b[1] - a[1]);
  const hasFilters = Boolean(category || company || remote === "1" || country || posted || since || q);

  // Active-filter chips: each links to the same view with that one filter
  // removed, so removal is plain navigation — no client state.
  const chips = [
    company && { label: COMPANY_LABELS[company] || company, href: qs({ category, q, remote, country, posted, since }) },
    category && { label: CATEGORY_LABELS[category] || category, href: qs({ company, q, remote, country, posted, since }) },
    country && { label: REGION_LABELS[country] || COUNTRY_LABELS[country] || country, href: qs({ category, company, q, remote, posted, since }) },
    remote === "1" && { label: "Remote", href: qs({ category, company, q, country, posted, since }) },
    posted && { label: POSTED_WINDOWS[posted], href: qs({ category, company, q, remote, country, since }) },
    since && { label: "New since last visit", href: qs({ category, company, q, remote, country, posted }) },
    q && { label: `“${q}”`, href: qs({ category, company, remote, country, posted, since }) },
  ].filter(Boolean);

  // The <h1> must describe the same subject as the <title> generated in
  // generateMetadata — both derive from the same lib/seo.js filter object.
  // On a filtered view the sub-line carries the live result count (already
  // fetched for the results header; no extra query).
  const seoLabels = {
    categories: CATEGORY_LABELS, companies: COMPANY_LABELS,
    countries: COUNTRY_LABELS, regions: REGION_LABELS, postedWindows: POSTED_WINDOWS,
  };
  const seoFilters = readFilters(sp, seoLabels);
  const heading = buildHeading(seoFilters, seoLabels);
  const isFiltered = heading !== "Fresh jobs from leading AI companies.";
  const subheading = isFiltered ? buildSubheading(seoFilters, seoLabels, total) : null;

  // Homepage-only structured data: the site's name and identity. One WebSite
  // node, one Organization node, emitted nowhere else to avoid duplicates.
  const identityLd = !hasFilters
    ? [
        { "@context": "https://schema.org", "@type": "WebSite", name: "EarlyAIJobs", alternateName: "earlyaijobs.com", url: "https://www.earlyaijobs.com/" },
        { "@context": "https://schema.org", "@type": "Organization", name: "EarlyAIJobs", url: "https://www.earlyaijobs.com/", logo: "https://www.earlyaijobs.com/icon" },
      ]
    : null;

  return (
    <>
      {identityLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(identityLd) }} />
      )}
      <section className="hero">
        <div className="wrap">
          <h1>{heading}</h1>
          <p>
            {subheading ||
              "Every role — engineering, research, sales, finance, operations and more — sourced directly from company career feeds."}
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
          {/* suppressHydrationWarning: the inline script opens this drawer on
              desktop BEFORE React hydrates (so there's no flash of collapsed
              filters), which makes the server HTML and client DOM differ on
              the `open` attribute — deliberately. Same pattern as the theme
              attribute on <html>. */}
          <details id="filters-drawer" className="filters-drawer" suppressHydrationWarning>
            <summary>Filters{hasFilters ? " · active" : ""}</summary>
            <div className="filters-body">
              <h3>Company</h3>
              <a className={!company ? "on" : ""} href={qs({ category, q, remote, country, posted, since })}>
                All companies <span className="n">{totalAll}</span>
              </a>
              {sortedCos.map(([slug, n]) => (
                <a
                  key={slug}
                  className={company === slug ? "on" : ""}
                  href={qs({ company: company === slug ? "" : slug, category, q, remote, country, posted, since })}
                >
                  {COMPANY_LABELS[slug] || slug} <span className="n">{n}</span>
                </a>
              ))}

              <form id="filter-form" className="filter-form" action="/" method="get">
                {q && <input type="hidden" name="q" value={q} />}
                {company && <input type="hidden" name="company" value={company} />}
                {since && <input type="hidden" name="since" value={since} />}

                <h3><label htmlFor="f-category">Category</label></h3>
                <select id="f-category" name="category" defaultValue={category}>
                  <option value="">All categories</option>
                  {sortedCats.map(([slug, n]) => (
                    <option key={slug} value={slug}>
                      {CATEGORY_LABELS[slug] || slug} ({n})
                    </option>
                  ))}
                </select>

                <h3><label htmlFor="f-country">Location</label></h3>
                <select id="f-country" name="country" defaultValue={country}>
                  <option value="">All locations</option>
                  {sortedCountries.map(([code, n]) => (
                    <option key={code} value={code}>
                      {COUNTRY_LABELS[code] || code} ({n})
                    </option>
                  ))}
                  {sortedRegions.map(([code, n]) => (
                    <option key={code} value={code}>
                      {REGION_LABELS[code]} ({n})
                    </option>
                  ))}
                </select>

                <h3><label htmlFor="f-posted">Posted</label></h3>
                <select id="f-posted" name="posted" defaultValue={posted}>
                  <option value="">Any time</option>
                  {Object.entries(POSTED_WINDOWS).map(([days, label]) => (
                    <option key={days} value={days}>{label}</option>
                  ))}
                </select>

                <label className="check">
                  <input type="checkbox" name="remote" value="1" defaultChecked={remote === "1"} />
                  Remote jobs only <span className="n">{remoteCount}</span>
                </label>

                <noscript>
                  <button type="submit" className="apply-filters">Apply filters</button>
                </noscript>
              </form>

              {hasFilters && (
                <a className="clear-filters" href="/">Clear all filters</a>
              )}
            </div>
          </details>
          <script dangerouslySetInnerHTML={{ __html: filterScript }} />
        </aside>

        <main>
          <NewSinceBanner />

          <form className="search" action="/" method="get">
            {category && <input type="hidden" name="category" value={category} />}
            {company && <input type="hidden" name="company" value={company} />}
            {remote && <input type="hidden" name="remote" value={remote} />}
            {country && <input type="hidden" name="country" value={country} />}
            {posted && <input type="hidden" name="posted" value={posted} />}
            {since && <input type="hidden" name="since" value={since} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search job titles — e.g. engineer, research, sales"
              aria-label="Search job titles"
            />
            <button type="submit">Search</button>
          </form>

          {chips.length > 0 && (
            <div className="chips">
              {chips.map((chip) => (
                <a key={chip.label} className="chip" href={chip.href} title={`Remove ${chip.label} filter`}>
                  {chip.label} <span aria-hidden="true">×</span>
                </a>
              ))}
              <a className="chip clear" href="/">Clear all</a>
            </div>
          )}

          <div className="count">
            {total.toLocaleString()} {total === 1 ? "job" : "jobs"}
            {q && <> matching “{q}”</>}
            {company && <> at {COMPANY_LABELS[company] || company}</>}
            {category && <> in {CATEGORY_LABELS[category] || category}</>}
            {country && <> · {REGION_LABELS[country] || COUNTRY_LABELS[country] || country}</>}
            {remote === "1" && <> · remote</>}
            {posted && <> · {POSTED_WINDOWS[posted].toLowerCase()}</>}
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
                        <span>{displayLocation(job.location)}</span>
                      </>
                    )}
                    {job.category && (
                      <span className="tag">
                        {CATEGORY_LABELS[job.category] || job.category}
                      </span>
                    )}
                    {job.is_remote === true && <span className="tag tag-remote">Remote</span>}
                  </div>
                </div>
                <span className="save-slot"><SaveButton jobId={job.id} /></span>
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
                <a href={qs({ category, company, q, remote, country, posted, since })} title="First page">« First</a>
              ) : (
                <span className="disabled">« First</span>
              )}
              {page > 1 ? (
                <a href={qs({ category, company, q, remote, country, posted, since, page: page - 1 })}>← Previous</a>
              ) : (
                <span className="disabled">← Previous</span>
              )}
              <span style={{ border: 0, background: "transparent" }}>
                Page {page} of {lastPage}
              </span>
              {page < lastPage ? (
                <a href={qs({ category, company, q, remote, country, posted, since, page: page + 1 })}>Next →</a>
              ) : (
                <span className="disabled">Next →</span>
              )}
              {page < lastPage ? (
                <a href={qs({ category, company, q, remote, country, posted, page: lastPage })} title="Last page">Last »</a>
              ) : (
                <span className="disabled">Last »</span>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
