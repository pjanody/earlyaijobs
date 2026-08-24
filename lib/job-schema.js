// lib/job-schema.js — JobPosting structured data for Google's job search.
//
// Pure module, no database import, unit-tested in plain Node (same pattern as
// lib/seo.js and lib/local-state.js). The page component passes the job row
// and the company label maps in; this returns the JSON-LD object, or null for
// a closed job.
//
// THE GOVERNING RULE is the project's oldest one: unknown is better than
// wrong. Google validates JobPosting strictly, and a fabricated field is worse
// than an absent one — so every field here is either derived from data the
// employer supplied, or omitted. Specifically:
//
//   - validThrough is OMITTED. Our 7-day retention window is OUR policy, not
//     the employer's expiry date, and the ATS feeds we ingest (Greenhouse,
//     Ashby) do not publish an expiration. Google's docs: if you don't know
//     when the posting expires, leave it out. (Review note, 2026-08-24: an
//     earlier draft proposed last_seen_at + 7 days; GPT's review correctly
//     rejected it as fabricated data.)
//   - identifier uses the employer's own requisition ID only when it can be
//     recovered from the job's ATS URL. Our internal serial is not the
//     employer's identifier, so it is never used as one.
//   - TELECOMMUTE is only declared for jobs the normaliser CONFIRMED remote
//     (is_remote === true; null never collapses to false — or to true).
//   - applicantLocationRequirements comes from parsed country codes. If a
//     remote job has no known countries and no physical location, we omit
//     TELECOMMUTE too: an unverifiable "remote anywhere" claim is exactly the
//     kind of guess this site does not make.

// ---------------------------------------------------------------------------
// Employer requisition ID, recovered from the ATS URL.
//   Greenhouse: https://job-boards.greenhouse.io/<board>/jobs/4567890004
//               https://boards.greenhouse.io/<board>/jobs/4567890
//   Ashby:      https://jobs.ashbyhq.com/<board>/<uuid>
//   Lever:      https://jobs.lever.co/<company>/<uuid>
// Anything else → null, and identifier is omitted.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sourceJobId(url) {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (host.endsWith("greenhouse.io")) {
    const i = parts.indexOf("jobs");
    const id = i >= 0 ? parts[i + 1] : null;
    return id && /^\d{5,}$/.test(id) ? id : null;
  }
  if (host.endsWith("ashbyhq.com") || host.endsWith("lever.co")) {
    const last = parts[parts.length - 1];
    return last && UUID_RE.test(last) ? last : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Locations. The feed gives one string, possibly several places separated by
// ";" or "|": "San Francisco, CA; New York, NY". Google requires an ARRAY of
// Place objects for multi-location jobs — a joined string in one
// addressLocality is invalid and can void the whole entity.
//
// Region/country extraction is deliberately conservative:
//   "San Francisco, CA"  → locality "San Francisco", region "CA" (2-letter US)
//   "London, UK"         → locality "London" (UK is not a US region; the
//                           country comes from location_countries, not text)
//   "Remote"             → not a place at all; skipped
// ---------------------------------------------------------------------------
const NOT_A_PLACE = /^(remote|anywhere|worldwide|global|hybrid|flexible|virtual)\b/i;
// Actual US state/territory codes — NOT a two-letter shape check, because
// "London, UK" would match a shape check and mint a US state called UK.
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR",
]);

function parsePlaces(raw) {
  const places = [];
  const seen = new Set();
  for (const part of String(raw || "").split(/[;|]/)) {
    const seg = part.trim().replace(/\s+/g, " ");
    if (!seg || NOT_A_PLACE.test(seg)) continue;
    const key = seg.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const address = { "@type": "PostalAddress" };
    const comma = seg.lastIndexOf(",");
    const tail = comma >= 0 ? seg.slice(comma + 1).trim() : "";
    if (comma >= 0 && US_STATES.has(tail)) {
      address.addressLocality = seg.slice(0, comma).trim();
      address.addressRegion = tail;
    } else {
      address.addressLocality = seg;
    }
    places.push({ "@type": "Place", address });
  }
  return places;
}

/** ISO country codes from the v1 normaliser, filtered to plausible codes. */
function countryCodes(job) {
  const list = Array.isArray(job && job.location_countries) ? job.location_countries : [];
  return list.filter((c) => typeof c === "string" && /^[A-Z]{2}$/.test(c));
}

// If every place lacks a country and the job has exactly ONE parsed country,
// that country applies to all of them. With multiple countries we cannot know
// which city is in which country, so we leave addressCountry off rather than
// guess wrong.
function applyCountry(places, codes) {
  if (codes.length === 1) {
    for (const p of places) p.address.addressCountry = codes[0];
  }
  return places;
}

// ---------------------------------------------------------------------------
// Employment type: schema.org enum, only from source-supplied values.
// ---------------------------------------------------------------------------
const EMPLOYMENT_TYPES = {
  fulltime: "FULL_TIME", "full-time": "FULL_TIME", "full time": "FULL_TIME",
  parttime: "PART_TIME", "part-time": "PART_TIME", "part time": "PART_TIME",
  contract: "CONTRACTOR", contractor: "CONTRACTOR",
  temporary: "TEMPORARY",
  intern: "INTERN", internship: "INTERN",
};

function employmentType(value) {
  if (!value || value === "unknown") return undefined;
  return EMPLOYMENT_TYPES[String(value).toLowerCase().trim()];
}

// ---------------------------------------------------------------------------
// The entity.
// ---------------------------------------------------------------------------

/**
 * @param {object} job     Row from the jobs table.
 * @param {object} opts    { companyLabels, companyWebsites, companyLogos, baseUrl }
 * @returns {object|null}  JSON-LD object, or null when the job must not carry
 *                         JobPosting markup (closed, or no data to stand on).
 */
function buildJobPosting(job, opts) {
  if (!job || job.is_open === false) return null;
  const { companyLabels = {}, companyWebsites = {}, companyLogos = {}, baseUrl } = opts || {};
  const base = String(baseUrl || "https://www.earlyaijobs.com").replace(/\/$/, "");
  const company = companyLabels[job.company_name] || job.company_name;

  const org = { "@type": "Organization", name: company };
  if (companyWebsites[job.company_name]) org.sameAs = companyWebsites[job.company_name];
  if (companyLogos[job.company_name]) org.logo = `${base}${companyLogos[job.company_name]}`;

  const codes = countryCodes(job);
  const places = applyCountry(parsePlaces(job.location), codes);
  const confirmedRemote = job.is_remote === true;

  const entity = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description_html || job.description || `${job.title} at ${company}.`,
    datePosted: job.first_published || job.first_seen_at,
    hiringOrganization: org,
    directApply: false,
    url: `${base}/job/${job.id}`,
  };

  const et = employmentType(job.employment_type);
  if (et) entity.employmentType = et;

  const srcId = sourceJobId(job.url);
  if (srcId) entity.identifier = { "@type": "PropertyValue", name: company, value: srcId };

  if (places.length === 1) entity.jobLocation = places[0];
  else if (places.length > 1) entity.jobLocation = places;

  if (confirmedRemote) {
    if (codes.length) {
      // Google requires applicantLocationRequirements when TELECOMMUTE is the
      // only location. We have parsed countries — say exactly those.
      entity.jobLocationType = "TELECOMMUTE";
      const reqs = codes.map((c) => ({ "@type": "Country", name: c }));
      entity.applicantLocationRequirements = reqs.length === 1 ? reqs[0] : reqs;
    } else if (places.length) {
      // Remote, eligibility unknown, but a physical office exists: declare
      // TELECOMMUTE alongside the place. Valid per Google's docs.
      entity.jobLocationType = "TELECOMMUTE";
    }
    // Remote with no countries and no place: no TELECOMMUTE. We will not
    // assert worldwide eligibility we cannot back up.
  }

  // A job with neither a location nor a remote declaration is not eligible
  // for Google's job experience anyway; emitting a location-less JobPosting
  // just accumulates validation errors against the domain.
  if (!entity.jobLocation && entity.jobLocationType !== "TELECOMMUTE") return null;

  // NOTE validThrough is intentionally absent — see header comment.
  return entity;
}

// ---------------------------------------------------------------------------
// BreadcrumbList — mirrors the visual breadcrumbs on the job page.
// ---------------------------------------------------------------------------
function buildBreadcrumbs(job, opts) {
  const { companyLabels = {}, categoryLabels = {}, baseUrl } = opts || {};
  const base = String(baseUrl || "https://www.earlyaijobs.com").replace(/\/$/, "");
  const items = [{ name: "All jobs", item: `${base}/` }];
  if (job.category && categoryLabels[job.category]) {
    items.push({ name: categoryLabels[job.category], item: `${base}/?category=${job.category}` });
  }
  items.push({
    name: companyLabels[job.company_name] || job.company_name,
    item: `${base}/company/${job.company_name}`,
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

// ---------------------------------------------------------------------------
// Site identity — homepage only. One WebSite node, one Organization node.
// No sameAs until real social profiles exist.
// ---------------------------------------------------------------------------
function buildSiteIdentity(baseUrl) {
  const base = String(baseUrl || "https://www.earlyaijobs.com").replace(/\/$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "EarlyAIJobs",
      alternateName: "earlyaijobs.com",
      url: `${base}/`,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "EarlyAIJobs",
      url: `${base}/`,
      logo: `${base}/icon`,
    },
  ];
}

module.exports = {
  buildJobPosting, buildBreadcrumbs, buildSiteIdentity,
  sourceJobId, parsePlaces, employmentType, countryCodes,
};
