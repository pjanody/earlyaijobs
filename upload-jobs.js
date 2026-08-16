// upload-jobs.js — Day 3 v3: collectors now bring home descriptions + ATS facts.
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const greenhouseCompanies = [
  "anthropic", "stripe", "duolingo", "databricks", "figma",
  "gitlab", "discord", "reddit", "robinhood", "brex",
  "gusto", "mongodb", "airtable", "asana", "affirm",
  "doordashusa", "instacart", "lyft", "pinterest", "dropbox",
  "elastic", "vercel", "scaleai"
];
const leverCompanies = ["plaid", "palantir", "cohere", "mistral"];
const ashbyCompanies = ["openai", "ramp", "linear", "notion", "elevenlabs", "replit"];

// Cleans a description: un-escapes HTML codes, strips tags, KEEPS THE FULL TEXT.
//
// History: 800 chars -> 6000 chars -> no limit.
// At 800 a Greenhouse posting was still inside the company preamble, so the
// responsibilities never reached the database. At 6000, 56% of sampled
// postings were still hitting the cap. Storage is cheap; discarded evidence is
// not recoverable without re-scraping. Length limiting now happens downstream
// at classification time, after boilerplate removal and section extraction.

function cleanDescription(html) {
  if (!html) return null;
  const unescaped = html
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&nbsp;", " ");
  return unescaped
    // Preserve document structure: block-level tags become newlines so that
    // headings ("Responsibilities", "About the role") survive on their own
    // lines. Flattening everything to spaces makes heading detection —
    // and therefore boilerplate removal — unreliable.
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*[^>]*>/gi, "\n")
    .replace(/<\s*(p|div|li|h[1-6])\s*[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n").map(l => l.trim()).join("\n")
    .trim();
}

async function fetchGreenhouse(slug) {
  // ?content=true asks Greenhouse to include full job descriptions.
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.jobs.map((job) => ({
    source_platform: "greenhouse",
    source_id: String(job.id),
    company_name: slug,
    title: job.title,
    location: job.location ? job.location.name : null,
    url: job.absolute_url,
    first_published: job.first_published,
    description: cleanDescription(job.content),
    workplace_type: null,       // Greenhouse doesn't say — the classifier will infer
    employment_type: null,
  }));
}

async function fetchLever(slug) {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.map((job) => ({
    source_platform: "lever",
    source_id: String(job.id),
    company_name: slug,
    title: job.text,
    location: job.categories ? job.categories.location : null,
    url: job.hostedUrl,
    first_published: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    description: job.descriptionPlain
      ? job.descriptionPlain.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
      : null,
    // ATS facts, free of charge — no AI guessing needed:
    workplace_type: job.workplaceType || null,
    employment_type: job.categories?.commitment?.toLowerCase() || null,
  }));
}

async function fetchAshby(slug) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.jobs) return null;
  return data.jobs.map((job) => ({
    source_platform: "ashby",
    source_id: String(job.id),
    company_name: slug,
    title: job.title,
    location: job.location,
    url: job.jobUrl,
    first_published: job.publishedAt,
    description: cleanDescription(job.descriptionHtml),
    workplace_type: job.isRemote === true ? "remote" : null,   // Ashby states it outright
    employment_type: job.employmentType ? String(job.employmentType).toLowerCase() : null,
  }));
}

let saved = 0;

async function processCompany(slug, platform, fetcher) {
  let rows;
  try {
    rows = await fetcher(slug);
  } catch (err) {
    console.log(`${slug} (${platform}): failed — ${err.message}`);
    return;
  }
  if (!rows) {
    console.log(`${slug} (${platform}): not found — skipped`);
    return;
  }
  const runStamp = new Date().toISOString();
  for (const row of rows) { row.last_seen_at = runStamp; row.is_open = true; }

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("jobs")
      .upsert(batch, { onConflict: "source_platform,source_id" });
    if (error) console.log(`${slug}: database error — ${error.message}`);
    else saved += batch.length;
  }
  console.log(`${slug} (${platform}): ${rows.length} jobs saved/updated`);
}

async function main() {
  const runStarted = new Date().toISOString();

  for (const slug of greenhouseCompanies) await processCompany(slug, "greenhouse", fetchGreenhouse);
  for (const slug of leverCompanies)      await processCompany(slug, "lever", fetchLever);
  for (const slug of ashbyCompanies)      await processCompany(slug, "ashby", fetchAshby);

  await supabase.from("jobs").update({ is_open: false }).lt("last_seen_at", runStarted);
  console.log(`\nDone. ${saved} jobs saved/updated this run.`);
}

main();