// lib/seo.js — how a filtered job list describes itself to search engines.
//
// Kept separate from app/page.jsx and free of any database import so it can be
// unit-tested in plain Node, the same way lib/local-state.js is. Everything
// here is a pure function of (query string, label maps).
//
// THE PROBLEM THIS SOLVES. The sitemap advertises ~55 filter URLs to Google
// (/?category=engineering, /?country=US, /?remote=1 …). Before this existed,
// every one of them served the SAME title and description inherited from
// layout.jsx — so to a crawler they were 55 copies of one page. Google picks a
// single winner and drops the rest, and none of them rank for the terms they
// should ("ai engineering jobs", "remote ai jobs", "ai jobs canada").
//
// Three rules:
//   1. Every indexable view gets a title and description that describe IT.
//   2. Every view declares a canonical URL built in a FIXED parameter order,
//      so /?company=openai&category=sales and /?category=sales&company=openai
//      resolve to one address instead of competing with each other.
//   3. Views that should not be in an index say so — free-text searches,
//      personal "since last visit" views, time-window filters, and pages 2+.
//      Those are crawl traps: 4,251 jobs at 50 per page is 85 pages per
//      filter, and multiplying that across filter combinations burns the
//      crawl budget that should be spent on job pages.

const SITE_TITLE = "EarlyAIJobs — fresh jobs from leading AI companies";
// Canonicals must be ABSOLUTE. Discovered in production on 2026-08-24: when a
// RELATIVE canonical with a query string ("/?category=engineering") is passed
// through Next's metadata resolver, the query is dropped and every filter view
// declared the bare homepage as its canonical — telling Google all 55 filter
// pages were duplicates of "/". Job pages, which always passed absolute URLs,
// were unaffected. That asymmetry was the clue.
const SITE_URL = "https://www.earlyaijobs.com";

/**
 * Filter values arrive from the query string, which is untrusted input. A
 * value is only allowed into a <title> if we recognise it; anything else is
 * treated as absent and the view is dropped from the index. Without this a
 * crafted URL could place arbitrary text in the page title and — because the
 * sitemap actively invites crawlers in — get it indexed.
 */
export function readFilters(sp, { categories, companies, countries, regions, postedWindows }) {
  const rawCategory = sp?.category || "";
  const rawCompany = sp?.company || "";
  const rawCountry = sp?.country || "";

  const category = categories[rawCategory] ? rawCategory : "";
  const company = companies[rawCompany] ? rawCompany : "";
  const country =
    regions[rawCountry] || countries[String(rawCountry).toUpperCase()] ? rawCountry : "";

  return {
    category,
    company,
    country,
    remote: sp?.remote === "1" ? "1" : "",
    posted: postedWindows[sp?.posted] ? sp.posted : "",
    page: Math.max(1, Number(sp?.page) || 1),
    hasSearch: Boolean(sp?.q),
    hasSince: Boolean(sp?.since),
    // An unrecognised value means someone (or something) is probing URLs we
    // did not generate. Serve the page, keep it out of the index.
    unknown: Boolean(
      (rawCategory && !category) || (rawCompany && !company) || (rawCountry && !country)
    ),
  };
}

function countryName(code, { countries, regions }) {
  return regions[code] || countries[String(code).toUpperCase()] || code;
}

/**
 * Titles read like the phrase a person would type into Google:
 *   "Remote Engineering Jobs at OpenAI in Canada | EarlyAIJobs"
 *   "AI Research Jobs | EarlyAIJobs"
 *   "Anthropic Jobs | EarlyAIJobs"
 */
export function buildTitle(f, labels) {
  const catLabel = f.category ? labels.categories[f.category] : "";
  const coLabel = f.company ? labels.companies[f.company] : "";
  // Page number is appended for the reader's benefit (browser tabs, history);
  // these views are noindexed, so it has no bearing on duplicate content.
  const pageSuffix = f.page > 1 ? ` — Page ${f.page}` : "";
  if (!catLabel && !coLabel && !f.country && !f.remote) {
    return pageSuffix ? `${SITE_TITLE}${pageSuffix}` : SITE_TITLE;
  }

  const parts = [];
  if (f.remote) parts.push("Remote");

  if (coLabel && !catLabel) {
    // "OpenAI Jobs" — this is the phrase people actually type. Putting the
    // company first also front-loads the word that carries the search intent.
    parts.push(`${coLabel} Jobs`);
  } else if (coLabel) {
    // "Engineering Jobs at OpenAI" — the company already supplies the AI
    // context, so prefixing "AI" would just pad the title.
    parts.push(catLabel, "Jobs", `at ${coLabel}`);
  } else {
    // "AI Engineering Jobs" / "AI Jobs" when nothing else sets the context.
    parts.push(catLabel ? `AI ${catLabel}` : "AI", "Jobs");
  }

  if (f.country) parts.push(`in ${countryName(f.country, labels)}`);
  return `${parts.join(" ")}${pageSuffix} | EarlyAIJobs`;
}

/**
 * The description mirrors the title, then adds the promise that separates this
 * site from a scraper: listings come from the employers' own feeds and link
 * straight to their application form.
 */
export function buildDescription(f, labels) {
  const catLabel = f.category ? labels.categories[f.category] : "";
  const coLabel = f.company ? labels.companies[f.company] : "";
  const scope = [
    f.remote ? "Remote" : "",
    catLabel ? catLabel.toLowerCase() : "",
    coLabel ? `roles at ${coLabel}` : "roles at leading AI companies",
    f.country ? `in ${countryName(f.country, labels)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    `${scope.charAt(0).toUpperCase()}${scope.slice(1)}, sourced directly from company career ` +
    `feeds and updated hourly. Every listing links straight to the employer's own application page.`
  );
}

/**
 * Canonical URL: indexable filters only, always in the same order. Page number
 * is included so a paginated view is self-canonical rather than claiming to be
 * page 1 — it is noindexed anyway, so it never competes for a ranking.
 */
/** The stable route for a category: /jobs/engineering. */
export function categoryPath(slug) {
  return `/jobs/${slug}`;
}

export function buildCanonical(f) {
  // Batch C (2026-08-24): a PURE category view canonicalises to its dedicated
  // route — /?category=engineering keeps working, but declares /jobs/engineering
  // as its one true address, so Google consolidates there. Only the pure view:
  // any additional filter (company, country, remote) is a distinct user-intent
  // view and stays self-canonical on its query URL, per the reviewed plan.
  if (f.category && !f.company && !f.country && !f.remote && f.page <= 1) {
    return `${SITE_URL}${categoryPath(f.category)}`;
  }
  const p = new URLSearchParams();
  if (f.category) p.set("category", f.category);
  if (f.company) p.set("company", f.company);
  if (f.country) p.set("country", f.country);
  if (f.remote) p.set("remote", "1");
  if (f.page > 1) p.set("page", String(f.page));
  const q = p.toString();
  return q ? `${SITE_URL}/?${q}` : `${SITE_URL}/`;
}

/**
 * Metadata for a /jobs/[category] route page. Whitelist-only: an unknown slug
 * returns null and the route 404s — the same rule the query filters follow.
 */
export function buildCategoryMetadata(slug, labels, { intro } = {}) {
  if (!labels.categories[slug]) return null;
  const f = readFilters({ category: slug }, labels);
  const title = buildTitle(f, labels);
  // The intro's first sentence makes a better description than the generic
  // template — it is specific to the category, which is the entire point.
  const firstSentence = intro ? `${String(intro).split(". ")[0]}.` : null;
  const description = firstSentence
    ? `${firstSentence} Sourced directly from company career feeds and updated hourly.`
    : buildDescription(f, labels);
  const canonical = `${SITE_URL}${categoryPath(slug)}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: canonical, siteName: "EarlyAIJobs", type: "website" },
  };
}

/** True when this view should be kept out of search indexes. */
export function isNoindex(f) {
  return Boolean(f.hasSearch || f.hasSince || f.posted || f.page > 1 || f.unknown);
}

/**
 * Visible <h1> for a filtered view. Must describe the same subject as the
 * <title> — a page titled "AI Engineering Jobs" whose largest text still says
 * "Fresh jobs from leading AI companies." sends two different topic signals
 * (and reads wrong to people, which is the part that actually matters).
 * Same words as the title, minus the site suffix; the homepage keeps its
 * original sentence.
 */
export function buildHeading(f, labels) {
  const catLabel = f.category ? labels.categories[f.category] : "";
  const coLabel = f.company ? labels.companies[f.company] : "";
  if (!catLabel && !coLabel && !f.country && !f.remote) {
    return "Fresh jobs from leading AI companies.";
  }
  // Reuse the title text, drop the "| EarlyAIJobs" suffix and any page number.
  return buildTitle({ ...f, page: 1 }, labels).replace(/ \| EarlyAIJobs$/, "");
}

/** One-line sub-heading with the live result count. */
export function buildSubheading(f, labels, total) {
  const n = Number(total);
  if (!Number.isFinite(n) || n < 0) return null;
  const catLabel = f.category ? labels.categories[f.category] : "";
  const coLabel = f.company ? labels.companies[f.company] : "";
  const noun = catLabel ? `${catLabel.toLowerCase()} role${n === 1 ? "" : "s"}` : `open role${n === 1 ? "" : "s"}`;
  const where = coLabel ? `at ${coLabel}` : "across leading AI companies";
  const suffix = f.country ? ` in ${countryName(f.country, labels)}` : "";
  return `${n.toLocaleString()} ${f.remote ? "remote " : ""}${noun} ${where}${suffix}, sourced directly from company career feeds.`;
}

/** Everything Next.js needs for one filtered view. */
export function buildMetadata(sp, labels) {
  const f = readFilters(sp, {
    categories: labels.categories,
    companies: labels.companies,
    countries: labels.countries,
    regions: labels.regions,
    postedWindows: labels.postedWindows,
  });
  const title = buildTitle(f, labels);
  const description = buildDescription(f, labels);
  const canonical = buildCanonical(f);
  // "follow" stays true everywhere: a view we don't want indexed is still a
  // legitimate route for a crawler to discover job pages through.
  const robots = isNoindex(f) ? { index: false, follow: true } : { index: true, follow: true };
  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: { title, description, url: canonical, siteName: "EarlyAIJobs", type: "website" },
  };
}
