// lib/db.js — read-only data access for the website.
//
// Uses the PUBLISHABLE key, never the secret one. Row Level Security on the
// jobs table allows public SELECT and nothing else, so this key can safely
// ship to the browser and appear in the repo's environment config.

import { createClient } from "@supabase/supabase-js";

// Placeholder fallbacks matter: createClient throws immediately if the URL is
// missing, and this module is imported during the Next build. The scheduled-job
// component builds this same repo without the public keys, so a hard throw here
// fails the whole deployment. With placeholders the build completes; the real
// values are always present on the web service, which is the only component
// that actually serves pages.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder-key"
);

// Only these companies appear on the site.
export const APPROVED_COMPANIES = [
  "openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit",
  "cohere", "perplexity", "cursor", "cognition", "mistral",
  "figureai", "coreweave",
];

export const COMPANY_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  scaleai: "Scale AI",
  elevenlabs: "ElevenLabs",
  databricks: "Databricks",
  replit: "Replit",
  cohere: "Cohere",
  perplexity: "Perplexity",
  cursor: "Cursor",
  cognition: "Cognition",
  mistral: "Mistral AI",
  figureai: "Figure AI",
  coreweave: "CoreWeave",
};

// Official company websites for the /company pages.
export const COMPANY_WEBSITES = {
  openai: "https://openai.com",
  anthropic: "https://www.anthropic.com",
  databricks: "https://www.databricks.com",
  scaleai: "https://scale.com",
  elevenlabs: "https://elevenlabs.io",
  replit: "https://replit.com",
  cohere: "https://cohere.com",
  perplexity: "https://www.perplexity.ai",
  cursor: "https://cursor.com",
  cognition: "https://cognition.ai",
  mistral: "https://mistral.ai",
  figureai: "https://www.figure.ai",
  coreweave: "https://www.coreweave.com",
};

// Short factual company blurbs for the /company pages. Written from public
// information, kept neutral — no rankings, no hype, no claims we can't stand
// behind. Update by hand when a company's focus visibly changes.
export const COMPANY_DESCRIPTIONS = {
  openai:
    "OpenAI is the AI research and product company behind ChatGPT and the GPT series of models. " +
    "Headquartered in San Francisco, it builds AI systems and products used by consumers, developers, and enterprises worldwide, " +
    "and hires across research, engineering, go-to-market, policy, and operations.",
  anthropic:
    "Anthropic is an AI safety company and the maker of Claude, founded in 2021 and headquartered in San Francisco. " +
    "Structured as a public benefit corporation, it focuses on building reliable, interpretable, and steerable AI systems, " +
    "with roles spanning research, engineering, sales, policy, and operations.",
  databricks:
    "Databricks is the data and AI company behind the lakehouse architecture, founded by the original creators of Apache Spark. " +
    "Its platform combines data engineering, analytics, and machine learning, and is used by thousands of enterprises. " +
    "The company hires globally across engineering, field engineering, sales, and corporate functions.",
  scaleai:
    "Scale AI builds the data infrastructure behind modern AI — data labeling, evaluation, and fine-tuning services used by " +
    "leading AI labs, enterprises, and government agencies. Headquartered in San Francisco, it hires across engineering, " +
    "operations, public sector, and go-to-market teams.",
  elevenlabs:
    "ElevenLabs is an AI audio company known for its voice synthesis and text-to-speech technology, used in media, " +
    "gaming, accessibility, and enterprise products. Founded in 2022 with a largely distributed team, " +
    "it hires across engineering, research, sales, and operations in many countries.",
  replit:
    "Replit is a browser-based software development platform where people build and deploy apps with the help of AI agents. " +
    "Based in Foster City, California, it serves developers and increasingly non-developers building software with AI, " +
    "and hires across engineering, design, and go-to-market roles.",
  cohere:
    "Cohere is an enterprise AI company building foundation models — including the Command family — designed for secure, " +
    "private business deployment. Founded in 2019 with headquarters in Toronto, it hires across research, engineering, " +
    "sales, and corporate functions, with many remote-friendly roles.",
  perplexity:
    "Perplexity builds an AI-powered answer engine that combines search with conversational models, used by millions for " +
    "research and everyday questions. Headquartered in San Francisco, it hires across engineering, design, " +
    "go-to-market, and operations.",
  cursor:
    "Cursor, built by Anysphere, is an AI-powered code editor used by professional developers and engineering teams. " +
    "Based in San Francisco, the company hires across engineering, product, design, and a growing go-to-market organization.",
  cognition:
    "Cognition is the AI lab behind Devin, an autonomous software engineering agent, and the Windsurf development tools. " +
    "Headquartered in San Francisco, it hires across research, engineering, customer engineering, sales, and operations.",
  mistral:
    "Mistral AI is a French AI lab building frontier and open-weight models, along with the Le Chat assistant and " +
    "enterprise AI platform. Headquartered in Paris, it hires across science, engineering, go-to-market, " +
    "and corporate roles in Europe and beyond.",
  figureai:
    "Figure AI builds general-purpose humanoid robots powered by AI, designed for work in logistics, manufacturing, " +
    "and eventually the home. Based in the San Francisco Bay Area, it hires across robotics, AI, hardware, " +
    "software engineering, and manufacturing operations.",
  coreweave:
    "CoreWeave is an AI cloud infrastructure company operating large-scale GPU data centers used to train and run " +
    "AI models for leading labs and enterprises. Headquartered in New Jersey with sites across the US and Europe, " +
    "it hires across engineering, data center operations, and corporate functions.",
};

// ATS employment-type values → human labels. Displayed ONLY when the ATS
// provided the value (never inferred), per the Option-B decision. Anything
// unrecognized renders nothing rather than raw database strings.
const EMPLOYMENT_LABELS = {
  fulltime: "Full-time", "full-time": "Full-time", "full time": "Full-time",
  parttime: "Part-time", "part-time": "Part-time", "part time": "Part-time",
  contract: "Contract", contractor: "Contract", temporary: "Temporary",
  intern: "Internship", internship: "Internship",
};
export function employmentLabel(value) {
  if (!value || value === "unknown") return null;
  return EMPLOYMENT_LABELS[String(value).toLowerCase().trim()] || null;
}

// Feed-specific location codes → human display. "Austin, Texas · USCA" is
// parser jargon nobody outside this codebase should ever read.
const LOCATION_ALIASES = { usca: "United States & Canada" };

/** Display-only location cleanup for job CARDS. ATS strings often repeat the
 *  same place ("San Francisco, CA; ... | San Francisco, CA") — dedupe segments
 *  for presentation. The raw string is never modified in the database, and
 *  the job DETAIL page still shows it verbatim. */
export function displayLocation(raw, maxSegments = 3) {
  if (!raw) return null;
  const seen = new Set();
  const segments = [];
  for (const part of String(raw).split(/[;|]/)) {
    let seg = part.trim().replace(/\s+/g, " ");
    if (!seg) continue;
    const key = seg.toLowerCase();
    if (LOCATION_ALIASES[key]) seg = LOCATION_ALIASES[key];
    if (seen.has(key)) continue;
    seen.add(key);
    segments.push(seg);
  }
  if (!segments.length) return null;
  const shown = segments.slice(0, maxSegments).join(" · ");
  const more = segments.length - maxSegments;
  return more > 0 ? `${shown} +${more} more` : shown;
}

// Logo filenames differ by source format (official SVG, webp, avif), so the
// mapping is explicit rather than assuming "<slug>.svg". Every mark sits on a
// light tile in both themes — several of these are black wordmarks that would
// disappear on the dark background otherwise.
export const COMPANY_LOGOS = {
  openai: "/companies/openai.svg",
  anthropic: "/companies/anthropic.png",      // square glyph — best at card size
  elevenlabs: "/companies/elevenlabs.svg",    // wordmark
  scaleai: "/companies/scaleai.webp",
  replit: "/companies/replit.avif",
  databricks: "/companies/databricks.svg",    // official lockup, viewBox cropped to the glyph
  // Batch-2 companies use letter-tile placeholders — swap in official marks
  // later by replacing the file, no code change needed.
  cohere: "/companies/cohere.svg",
  perplexity: "/companies/perplexity.svg",
  cursor: "/companies/cursor.svg",
  cognition: "/companies/cognition.svg",
  mistral: "/companies/mistral.svg",
  figureai: "/companies/figureai.svg",
  coreweave: "/companies/coreweave.svg",
};

// Wide wordmarks need a landscape tile or they render as a thin sliver inside
// a square. Square glyphs use the standard tile.
export const WIDE_LOGOS = new Set(["elevenlabs"]);

export const CATEGORY_LABELS = {
  engineering: "Engineering",
  research: "Research",
  data: "Data",
  product: "Product",
  design: "Design",
  infrastructure: "Infrastructure",
  security: "Security",
  solutions: "Solutions",
  sales: "Sales",
  marketing: "Marketing",
  "customer-success": "Customer Success",
  operations: "Operations",
  "legal-compliance": "Legal & Compliance",
  policy: "Policy",
  people: "People",
  finance: "Finance",
  education: "Education",
  other: "Other",
};

// Country/region display names for the Location filter. Codes come from the
// deterministic parser; anything not listed falls back to the raw code.
export const COUNTRY_LABELS = {
  US: "United States", GB: "United Kingdom", CA: "Canada", IN: "India",
  SG: "Singapore", JP: "Japan", DE: "Germany", AU: "Australia", FR: "France",
  NL: "Netherlands", IE: "Ireland", MX: "Mexico", KR: "South Korea",
  SE: "Sweden", BR: "Brazil", DK: "Denmark", AE: "United Arab Emirates",
  ES: "Spain", IT: "Italy", CH: "Switzerland", QA: "Qatar", RS: "Serbia",
  PL: "Poland", SA: "Saudi Arabia", BE: "Belgium", CO: "Colombia",
  CR: "Costa Rica", FI: "Finland", AR: "Argentina", IL: "Israel",
  NZ: "New Zealand", CN: "China", HU: "Hungary", AT: "Austria",
  NO: "Norway", PT: "Portugal", CZ: "Czechia", GR: "Greece", TR: "Türkiye",
  TW: "Taiwan", HK: "Hong Kong", TH: "Thailand", VN: "Vietnam",
  PH: "Philippines", ID: "Indonesia", MY: "Malaysia", ZA: "South Africa",
  NG: "Nigeria", KE: "Kenya", EG: "Egypt", UA: "Ukraine", CL: "Chile",
  PE: "Peru", EE: "Estonia", LV: "Latvia", LT: "Lithuania", SK: "Slovakia",
  SI: "Slovenia", HR: "Croatia", BG: "Bulgaria", LU: "Luxembourg",
  IS: "Iceland", RO: "Romania",
};

// A few postings are region-wide ("Remote - Europe") with no single country.
// They appear under these entries rather than vanishing. Deliberately
// conservative the other way too: selecting Poland does NOT pull in every
// Europe-wide job.
export const REGION_LABELS = { europe: "Europe (region-wide)", emea: "EMEA (region-wide)" };

// Language rule: only English publishes. NULL is also allowed through —
// a job ingested minutes ago hasn't been normalized yet, and hiding brand-new
// jobs would contradict the whole "fresh" premise. Confirmed non-English
// (ja, de, …) stays in the database but never renders.
const LANG_FILTER = "posting_language.eq.en,posting_language.is.null,posting_language.eq.und";
const applyLang = (q) => q.or(LANG_FILTER);

const SELECT = "id, title, company_name, location, url, category, workplace_type, " +
  "is_remote, location_countries, employment_type, first_published, first_seen_at";

// Posted-date filter: whitelisted day windows only, so the query can never be
// driven by arbitrary user input.
export const POSTED_WINDOWS = { 1: "Last 24 hours", 3: "Last 3 days", 7: "Last 7 days", 30: "Last 30 days" };

// since= filter validation lives with the rest of the local-state logic so
// its rules are unit-tested; re-exported here for the server components.
import { validSince } from "./local-state";
export { validSince };

/** Jobs list with optional filters. */
export async function getJobs({ category, company, remote, country, posted, since, q, page = 1, perPage = 50 } = {}) {
  let query = applyLang(
    supabase
      .from("jobs")
      .select(SELECT, { count: "exact" })
      .eq("is_open", true)
      .in("company_name", APPROVED_COMPANIES)
  );

  if (category) query = query.eq("category", category);
  if (company) query = query.eq("company_name", company);
  // The Remote checkbox: ONLY positively-confirmed remote. Unchecked shows
  // everything — unknown is never treated as "not remote".
  if (remote === "1") query = query.eq("is_remote", true);
  if (country) {
    query = REGION_LABELS[country]
      ? query.contains("location_region_codes", [country])
      : query.contains("location_countries", [country.toUpperCase()]);
  }
  if (q) {
    // Search titles AND descriptions: "python" should surface the ML jobs
    // that require Python, not only jobs with python in the title.
    // Commas/parens are stripped because they are PostgREST .or() syntax —
    // no user search term needs them. At ~2,600 rows ILIKE is instant;
    // revisit with real full-text search when the corpus is 10× larger.
    const safe = String(q).replace(/[,()]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  if (posted && POSTED_WINDOWS[posted]) {
    const cutoff = new Date(Date.now() - Number(posted) * 24 * 3600000).toISOString();
    query = query.gte("first_published", cutoff);
  }
  // "New since your last visit": first_seen_at = when EarlyAIJobs discovered
  // the job (the site's own freshness clock, per the retention brief §8).
  // validSince whitelists real, recent ISO timestamps — the value comes from
  // a URL and is untrusted.
  const sinceIso = validSince(since);
  if (sinceIso) query = query.gte("first_seen_at", sinceIso);

  const from = (page - 1) * perPage;
  query = query
    .order("first_published", { ascending: false, nullsFirst: false })
    .range(from, from + perPage - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { jobs: data || [], total: count || 0 };
}

/** One job, for the detail page. Closed jobs are still returned — the page
 *  shows a "no longer accepting applications" notice and drops its JobPosting
 *  structured data, rather than 404-ing and discarding accumulated SEO value. */
export async function getJob(id) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company_name, location, url, category, workplace_type, is_remote, employment_type, description, description_html, first_published, first_seen_at, last_seen_at, is_open")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

/** Deterministic "similar jobs": same category, open, newest first, current
 *  job excluded. No AI, no scoring — rules a person can predict. */
export async function getSimilarJobs(job, limit = 5) {
  if (!job || !job.category) return [];
  const { data, error } = await applyLang(
    supabase
      .from("jobs")
      .select("id, title, company_name, location, first_published")
      .eq("is_open", true)
      .in("company_name", APPROVED_COMPANIES)
      .eq("category", job.category)
      .neq("id", job.id)
  )
    .order("first_published", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// Counting note: Supabase caps a single response at 1,000 rows, so counting
// by fetching rows and tallying them in JavaScript silently under-reports on
// any table larger than that. Instead we ask Postgres for the count directly
// with { count: "exact", head: true } — no rows travel over the network, just
// the number. One small query per filter, run in parallel.

async function countMatching(apply) {
  let q = applyLang(
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("is_open", true)
      .in("company_name", APPROVED_COMPANIES)
  );
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) return 0;
  return count || 0;
}

/** Country + region counts for the Location filter, tallied from the actual
 *  corpus (so the dropdown only ever offers countries that have jobs).
 *  Fetches one narrow column in pages — responses cap at 1,000 rows, so
 *  counting client-side without pagination would silently under-report. */
export async function getCountryCounts() {
  const countries = {};
  const regions = {};
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await applyLang(
      supabase
        .from("jobs")
        .select("location_countries, location_region_codes")
        .eq("is_open", true)
        .in("company_name", APPROVED_COMPANIES)
    ).range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      for (const c of row.location_countries || []) countries[c] = (countries[c] || 0) + 1;
      for (const r of row.location_region_codes || []) regions[r] = (regions[r] || 0) + 1;
    }
    if (data.length < PAGE) break;
  }
  return { countries, regions };
}

/** Total open jobs across approved companies. */
export async function getTotalCount() {
  return countMatching(null);
}

/** Positively-confirmed remote jobs — the checkbox count. */
export async function getRemoteCount() {
  return countMatching((q) => q.eq("is_remote", true));
}

/** Everything the /company/[slug] page needs, in parallel queries.
 *  Every number is verifiable: remote uses is_remote=true (same standard as
 *  the site-wide checkbox), countries are counted from normalized codes. */
export async function getCompanyStats(slug) {
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const cats = Object.keys(CATEGORY_LABELS);

  const [total, fresh, remote, ...catResults] = await Promise.all([
    countMatching((q) => q.eq("company_name", slug)),
    countMatching((q) => q.eq("company_name", slug).gte("first_published", since)),
    countMatching((q) => q.eq("company_name", slug).eq("is_remote", true)),
    ...cats.map((c) => countMatching((q) => q.eq("company_name", slug).eq("category", c))),
  ]);

  const categories = {};
  cats.forEach((c, i) => { if (catResults[i] > 0) categories[c] = catResults[i]; });

  // Distinct countries for this company — one narrow column, paginated
  // (responses cap at 1,000 rows).
  const countrySet = new Set();
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await applyLang(
      supabase
        .from("jobs")
        .select("location_countries")
        .eq("is_open", true)
        .eq("company_name", slug)
    ).range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) for (const c of row.location_countries || []) countrySet.add(c);
    if (data.length < PAGE) break;
  }

  return { total, fresh, remote, categories, countryCount: countrySet.size };
}

/** Jobs published in the last 48 hours — the freshness headline. */
export async function getFreshCount() {
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  return countMatching((q) => q.gte("first_published", since));
}

/** Counts per category, for the filter sidebar. */
export async function getCategoryCounts() {
  const cats = Object.keys(CATEGORY_LABELS);
  const results = await Promise.all(
    cats.map((c) => countMatching((q) => q.eq("category", c)))
  );
  const counts = {};
  cats.forEach((c, i) => { if (results[i] > 0) counts[c] = results[i]; });
  return counts;
}

/** Per-company open + fresh counts for the /companies hub — parallel head
 *  counts, same pattern as everything else. */
export async function getCompanyHubStats() {
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const results = await Promise.all(
    APPROVED_COMPANIES.flatMap((slug) => [
      countMatching((q) => q.eq("company_name", slug)),
      countMatching((q) => q.eq("company_name", slug).gte("first_published", since)),
    ])
  );
  return APPROVED_COMPANIES.map((slug, i) => ({
    slug, total: results[i * 2], fresh: results[i * 2 + 1],
  }));
}

/** Counts per company. */
export async function getCompanyCounts() {
  const results = await Promise.all(
    APPROVED_COMPANIES.map((slug) => countMatching((q) => q.eq("company_name", slug)))
  );
  const counts = {};
  APPROVED_COMPANIES.forEach((slug, i) => { if (results[i] > 0) counts[slug] = results[i]; });
  return counts;
}

/** When the pipeline last touched the data. Shown on the homepage so the
 *  freshness claim is evidence rather than marketing — if the scheduler stops,
 *  the site says so by itself. */
export async function getLastUpdated() {
  const { data, error } = await supabase
    .from("jobs")
    .select("last_seen_at")
    .in("company_name", APPROVED_COMPANIES)
    .order("last_seen_at", { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0].last_seen_at;
}

/** "3h ago" / "2d ago" — the freshness signal that gives the site its name. */
export function timeAgo(dateString) {
  if (!dateString) return null;
  const then = new Date(dateString).getTime();
  const hours = Math.floor((Date.now() - then) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Jobs posted within the last 48 hours get the "new" treatment. */
export function isFresh(dateString) {
  if (!dateString) return false;
  return Date.now() - new Date(dateString).getTime() < 48 * 3600000;
}

/** Freshness tiers for the badge treatment:
 *  "new" (under 6h, sage NEW badge) · "recent" (6–24h, sage text) · "old".
 *  Tight window on purpose — if half the list says NEW, nothing is new. */
export function freshness(dateString) {
  if (!dateString) return "old";
  const hours = (Date.now() - new Date(dateString).getTime()) / 3600000;
  if (hours < 6) return "new";
  if (hours < 24) return "recent";
  return "old";
}
