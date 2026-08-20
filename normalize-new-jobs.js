// normalize-new-jobs.js — pipeline step: apply the v1 normalizer to jobs that
// don't have it yet (posting_language is NULL). Runs every cycle after
// ingestion, so a brand-new job gets its country/remote/language fields within
// the same hour it appears. Same deterministic code as the backfill — no
// second implementation to drift.
//
//   node --env-file=.env normalize-new-jobs.js
//
// Pass --all to re-normalize the entire table (after a rule change).

const { createClient } = require("@supabase/supabase-js");
const { normalizeV1 } = require("./normalize-v1");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ALL = process.argv.includes("--all");
const PAGE = 200;

async function fetchBatch(from) {
  let q = supabase
    .from("jobs")
    .select("id, title, company_name, location, description, workplace_type")
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);
  if (!ALL) q = q.is("posting_language", null); // NULL = not yet normalized
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function main() {
  let processed = 0;
  let remoteTrue = 0;

  // In default mode every write removes rows from the "posting_language IS
  // NULL" pool, so we always fetch from offset 0. In --all mode we walk.
  for (let from = 0; ; ) {
    const batch = await fetchBatch(ALL ? from : 0);
    if (!batch.length) break;

    for (const job of batch) {
      const n = normalizeV1(job);
      const { error } = await supabase.from("jobs").update({
        is_remote: n.is_remote,
        remote_source: n.remote_source,
        location_countries: n.location_countries,
        location_region_codes: n.location_region_codes,
        posting_language: n.posting_language,
      }).eq("id", job.id);
      if (error) throw new Error(`[${job.id}] ${error.message}`);
      processed++;
      if (n.is_remote === true) remoteTrue++;
    }

    if (ALL) { from += PAGE; if (batch.length < PAGE) break; }
  }

  console.log(`[normalize] ${processed} job(s) normalized (${remoteTrue} confirmed remote).`);
}

main().catch((e) => { console.error(`[normalize] STOPPED: ${e.message}`); process.exit(1); });
