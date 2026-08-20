// backfill-v1.js — one-time backfill of the v1 fields over all jobs.
// GATED: run only after (1) Patrick approves v1-report.txt and (2) the
// additive migration has been applied in Supabase.
//
//   node --env-file=.env backfill-v1.js --dry-run   # compute + report, write NOTHING
//   node --env-file=.env backfill-v1.js --execute   # snapshot, write, verify invariants
//
// Safety properties:
//   - refuses to run without an explicit flag
//   - snapshots every row's current generated fields to backfill-v1-snapshot.json
//     BEFORE the first write
//   - touches ONLY the five new columns; raw ATS data untouched
//   - verifies section-11 invariants after writing and prints pass/fail

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { normalizeV1 } = require("./normalize-v1");
const { COUNTRIES, COUNTRY_CODES, REGION_MEMBERS } = require("./location-parser");

// Every ISO code the parser is capable of emitting. If a backfilled value
// isn't in this set, something upstream invented a country.
const VALID_CODES = new Set([
  ...Object.values(COUNTRY_CODES),
  ...Object.values(COUNTRIES),
  ...Object.values(REGION_MEMBERS).flat(),
].filter((v) => typeof v === "string" && /^[A-Z]{2}$/.test(v)));

const MODE = process.argv.includes("--execute") ? "execute"
           : process.argv.includes("--dry-run") ? "dry-run" : null;
if (!MODE) {
  console.log("Refusing to run without a flag. Use --dry-run first, then --execute.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const PAGE = 200;

async function fetchPage(from) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, company_name, location, description, workplace_type, is_open")
        .order("id", { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      return data || [];
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const page = await fetchPage(from);
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

// The backfill covers ALL rows (open and closed) so nothing is left
// half-migrated, but invariant reporting focuses on open jobs — those are
// what the site serves.
async function main() {
  const jobs = await fetchAll();
  console.log(`Fetched ${jobs.length} jobs (${jobs.filter((j) => j.is_open).length} open). Mode: ${MODE}`);

  const updates = jobs.map((job) => {
    const n = normalizeV1(job);
    return {
      id: job.id,
      is_remote: n.is_remote,
      remote_source: n.remote_source,
      location_countries: n.location_countries,
      location_region_codes: n.location_region_codes,
      posting_language: n.posting_language,
    };
  });

  // ---- invariants, computed BEFORE any write so --dry-run reports them too ----
  const problems = [];
  for (const u of updates) {
    for (const c of u.location_countries)
      if (!VALID_CODES.has(c)) problems.push(`[${u.id}] invalid country code ${c}`);
    if (new Set(u.location_countries).size !== u.location_countries.length)
      problems.push(`[${u.id}] duplicate country codes`);
    if (u.is_remote === true && !u.remote_source)
      problems.push(`[${u.id}] is_remote=true without documented source`);
    if (u.remote_source === "source-rule:usca" &&
        !(u.location_countries.includes("US") && u.location_countries.includes("CA")))
      problems.push(`[${u.id}] USCA row missing US or CA`);
  }
  console.log(`\nPre-write invariants: ${problems.length ? "FAILED" : "all hold"}`);
  problems.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  if (problems.length && MODE === "execute") {
    console.log("Refusing to write with invariant violations. Fix first.");
    process.exit(1);
  }

  const remoteTrue = updates.filter((u) => u.is_remote === true).length;
  const withCountry = updates.filter((u) => u.location_countries.length).length;
  console.log(`\nWould set: remote=true ×${remoteTrue}, ≥1 country ×${withCountry} of ${updates.length}`);

  if (MODE === "dry-run") {
    console.log("\nDry run complete. Nothing written.");
    return;
  }

  // ---- snapshot before first write ----
  const snapshotFile = `backfill-v1-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(snapshotFile, JSON.stringify(jobs, null, 1));
  console.log(`Snapshot of pre-backfill rows → ${snapshotFile}`);

  // ---- write in small batches, only the five new columns ----
  let written = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Per-row update: upsert would require every NOT NULL column.
        const results = await Promise.all(batch.map((u) =>
          supabase.from("jobs").update({
            is_remote: u.is_remote,
            remote_source: u.remote_source,
            location_countries: u.location_countries,
            location_region_codes: u.location_region_codes,
            posting_language: u.posting_language,
          }).eq("id", u.id)));
        const failed = results.find((r) => r.error);
        if (failed) throw new Error(failed.error.message);
        break;
      } catch (e) {
        if (attempt === 3) { console.error(`Batch at ${i} failed 3×: ${e.message}`); process.exit(1); }
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    written += batch.length;
    if (written % 500 === 0 || written === updates.length) console.log(`  ${written}/${updates.length}`);
  }

  // ---- post-write verification: read back and spot-check ----
  const { count: trueCount, error: e1 } = await supabase
    .from("jobs").select("id", { count: "exact", head: true }).eq("is_remote", true);
  const { count: nullSrc, error: e2 } = await supabase
    .from("jobs").select("id", { count: "exact", head: true }).eq("is_remote", true).is("remote_source", null);
  if (e1 || e2) { console.error("Verification query failed"); process.exit(1); }
  console.log(`\nPost-write: is_remote=true in DB: ${trueCount} (expected ${remoteTrue})`);
  console.log(`is_remote=true with NULL source: ${nullSrc} (must be 0)`);
  console.log(trueCount === remoteTrue && nullSrc === 0 ? "\nBACKFILL VERIFIED." : "\nMISMATCH — investigate before wiring UI.");
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
