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

// Safety valve. If a "successful" fetch would close more than this share of a
// company's open jobs, we refuse and log loudly instead. A feed that returns
// HTTP 200 with a partial or truncated list looks exactly like a company that
// closed most of its roles — and only one of those is real.
const MAX_CLOSE_SHARE = 0.40;

async function openCount(slug) {
  const { count } = await supabase
    .from("jobs").select("id", { count: "exact", head: true })
    .eq("company_name", slug).eq("is_open", true);
  return count || 0;
}

/**
 * Fetch one company and upsert its jobs.
 * Returns { status, fetched, closed } — reconciliation happens HERE, per
 * company, and only after an authoritative successful fetch.
 */
async function processCompany(slug, platform, fetcher, report) {
  const before = await openCount(slug);
  let rows;

  try {
    rows = await fetcher(slug);
  } catch (err) {
    console.log(`${slug} (${platform}): FETCH FAILED — ${err.message} — existing jobs left untouched`);
    report.push({ slug, platform, status: "fetch-failed", before, fetched: 0, closed: 0, after: before });
    return;
  }

  if (!rows) {
    console.log(`${slug} (${platform}): feed not found — existing jobs left untouched`);
    report.push({ slug, platform, status: "not-found", before, fetched: 0, closed: 0, after: before });
    return;
  }

  // An empty-but-successful response is ambiguous: either the company really
  // has no openings, or the feed is broken. Never reconcile on zero.
  if (rows.length === 0) {
    console.log(`${slug} (${platform}): returned 0 jobs — NOT reconciling (ambiguous), existing jobs left untouched`);
    report.push({ slug, platform, status: "empty-feed", before, fetched: 0, closed: 0, after: before });
    return;
  }

  const runStamp = new Date().toISOString();
  for (const row of rows) {
    row.last_seen_at = runStamp;
    row.is_open = true;
  }

  let upsertFailed = false;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("jobs")
      .upsert(batch, { onConflict: "source_platform,source_id" });
    if (error) { console.log(`${slug}: database error — ${error.message}`); upsertFailed = true; }
    else saved += batch.length;
  }

  if (upsertFailed) {
    console.log(`${slug} (${platform}): ${rows.length} fetched but a write failed — NOT reconciling`);
    report.push({ slug, platform, status: "write-failed", before, fetched: rows.length, closed: 0, after: await openCount(slug) });
    return;
  }

  // Reconciliation: close only THIS company's jobs that this successful fetch
  // did not include.
  const { count: staleCount } = await supabase
    .from("jobs").select("id", { count: "exact", head: true })
    .eq("company_name", slug).eq("is_open", true).lt("last_seen_at", runStamp);
  const stale = staleCount || 0;

  let closed = 0;
  if (stale === 0) {
    // nothing to close
  } else if (before > 0 && stale / before > MAX_CLOSE_SHARE) {
    console.log(`${slug} (${platform}): ⚠ REFUSING to close ${stale}/${before} jobs ` +
      `(${Math.round((stale / before) * 100)}% > ${MAX_CLOSE_SHARE * 100}% limit) — needs manual review`);
    report.push({ slug, platform, status: "close-refused", before, fetched: rows.length, closed: 0, stale, after: await openCount(slug) });
    console.log(`${slug} (${platform}): ${rows.length} jobs saved/updated`);
    return;
  } else {
    const { error } = await supabase.from("jobs")
      .update({ is_open: false })
      .eq("company_name", slug).eq("is_open", true).lt("last_seen_at", runStamp);
    if (error) console.log(`${slug}: close sweep error — ${error.message}`);
    else closed = stale;
  }

  console.log(`${slug} (${platform}): ${rows.length} saved/updated${closed ? `, ${closed} closed` : ""}`);
  report.push({ slug, platform, status: "ok", before, fetched: rows.length, closed, after: await openCount(slug) });
}

async function main() {
  const started = Date.now();
  const runStarted = new Date().toISOString();
  const report = [];

  for (const slug of greenhouseCompanies) await processCompany(slug, "greenhouse", fetchGreenhouse, report);
  for (const slug of leverCompanies)      await processCompany(slug, "lever", fetchLever, report);
  for (const slug of ashbyCompanies)      await processCompany(slug, "ashby", fetchAshby, report);

  // Jobs inserted during this run: first_seen_at is set by the database default
  // on INSERT only, so upserts of existing rows never touch it.
  const { count: newJobs } = await supabase
    .from("jobs").select("id", { count: "exact", head: true })
    .gte("first_seen_at", runStarted);

  const totalFetched = report.reduce((a, r) => a + r.fetched, 0);
  const totalClosed = report.reduce((a, r) => a + r.closed, 0);
  const problems = report.filter(r => r.status !== "ok");

  console.log(`\n=== RUN REPORT ===`);
  console.log(`Runtime          : ${((Date.now() - started) / 60000).toFixed(1)} min`);
  console.log(`Jobs fetched     : ${totalFetched}`);
  console.log(`New jobs         : ${newJobs || 0}`);
  console.log(`Updated jobs     : ${Math.max(0, totalFetched - (newJobs || 0))}`);
  console.log(`Jobs closed      : ${totalClosed}`);
  console.log(`Companies OK     : ${report.length - problems.length}/${report.length}`);

  console.log(`\nPer company (open before → after):`);
  for (const r of report) {
    const flag = r.status === "ok" ? "" : `   [${r.status.toUpperCase()}]`;
    const delta = r.after - r.before;
    console.log(`  ${r.slug.padEnd(14)} ${String(r.before).padStart(5)} → ${String(r.after).padEnd(5)}` +
      ` (${delta >= 0 ? "+" : ""}${delta})  fetched ${String(r.fetched).padStart(4)}` +
      `  closed ${String(r.closed).padStart(3)}${flag}`);
  }

  if (problems.length) {
    console.log(`\n⚠ ${problems.length} companies did not reconcile — their existing jobs were left untouched:`);
    for (const p of problems) {
      console.log(`  ${p.slug} (${p.platform}): ${p.status}${p.stale ? ` — ${p.stale} jobs would have closed` : ""}`);
    }
  }
  console.log(`\nDone. ${saved} jobs saved/updated this run.`);
}

main();