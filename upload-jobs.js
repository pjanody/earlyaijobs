// upload-jobs.js — Day 2 v2: three platforms, one pantry.
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

// Three "translators". Each fetches one company's feed and returns
// rows reshaped into OUR table's columns — or null if the feed isn't there.

async function fetchGreenhouse(slug) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
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
  }));
}

async function fetchLever(slug) {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) return null;
  const data = await res.json(); // Lever returns a bare list — no wrapper box
  return data.map((job) => ({
    source_platform: "lever",
    source_id: String(job.id),
    company_name: slug,
    title: job.text, // Lever's word for "title"
    location: job.categories ? job.categories.location : null,
    url: job.hostedUrl,
    // Lever dates are raw milliseconds — convert to a proper timestamp
    first_published: job.createdAt ? new Date(job.createdAt).toISOString() : null,
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
  }));
}

let saved = 0;

// One shared worker: fetch via the given translator, stamp, and upsert.
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

  // Jobs not seen this run have vanished from their feeds → mark closed.
  await supabase.from("jobs").update({ is_open: false }).lt("last_seen_at", runStarted);
  console.log(`\nDone. ${saved} jobs saved/updated this run.`);
}

main();