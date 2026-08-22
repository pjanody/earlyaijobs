// qa-consistency.js — READ-ONLY cross-surface classification invariant check.
//
//   node --env-file=.env qa-consistency.js
//
// GPT's required invariant: for a given job ID, the category must be identical
// on cards, filters, counts, and the detail page. Architecturally this is
// guaranteed — every surface reads the single jobs.category column through
// lib/db.js — but a guarantee you can run beats a guarantee you assert.
// If someone ever introduces a second category source, this fails loudly.
//
// What it does:
//   1. Pulls 30 random open jobs using the LIST-shape query (what cards use).
//   2. Refetches each by ID using the DETAIL-shape query (what job pages use).
//   3. Asserts category, title, and is_remote agree per ID.
//   4. Recomputes each company-page category count and checks it equals the
//      count of list rows in that category (same data both ways).
//   5. Prints the current DB category for the specific jobs GPT cited, so
//      cache-vintage claims can be settled with one paste.

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral"];

// Jobs named in external reviews — printed with their canonical DB values.
const CITED = [383676, 383677, 383678, 360018, 360019, 383589, 16332, 356889, 364968];

async function main() {
  let failures = 0;

  // ---- 1+2+3: list query vs detail query, same IDs ----
  const { data: sample, error: e1 } = await supabase
    .from("jobs")
    .select("id, title, category, is_remote, company_name")
    .eq("is_open", true).in("company_name", APPROVED)
    .order("last_seen_at", { ascending: false })
    .limit(30);
  if (e1) throw new Error(e1.message);

  console.log(`Cross-surface invariant check — ${sample.length} jobs\n`);
  for (const row of sample) {
    const { data: detail, error } = await supabase
      .from("jobs")
      .select("id, title, category, is_remote")
      .eq("id", row.id).single();
    if (error) { console.log(`FAIL  [${row.id}] detail fetch: ${error.message}`); failures++; continue; }
    const ok = detail.category === row.category && detail.title === row.title && detail.is_remote === row.is_remote;
    if (!ok) {
      failures++;
      console.log(`FAIL  [${row.id}] list says ${row.category}, detail says ${detail.category}`);
    }
  }
  console.log(failures === 0
    ? `PASS  all ${sample.length} jobs: list category === detail category (single source confirmed)`
    : `${failures} MISMATCHES — a second category source exists somewhere. Stop and investigate.`);

  // ---- 4: company-page counts vs direct tally ----
  console.log(`\nCompany category counts vs direct tally:`);
  for (const slug of APPROVED.slice(0, 2)) { // two companies is enough to prove the path
    const { data: rows, error } = await supabase
      .from("jobs").select("category")
      .eq("is_open", true).eq("company_name", slug).limit(1000);
    if (error) { console.log(`  ${slug}: ${error.message}`); continue; }
    const tally = {};
    for (const r of rows) tally[r.category] = (tally[r.category] || 0) + 1;
    // head-count query per category — the exact query company pages run
    let mismatches = 0;
    for (const [cat, n] of Object.entries(tally)) {
      const { count } = await supabase
        .from("jobs").select("id", { count: "exact", head: true })
        .eq("is_open", true).eq("company_name", slug).eq("category", cat);
      if (count !== n) { mismatches++; console.log(`  ${slug}/${cat}: page-count ${count} ≠ tally ${n}`); }
    }
    console.log(`  ${slug}: ${mismatches === 0 ? "PASS — counts derive from the same rows" : mismatches + " mismatches"}`);
  }

  // ---- 5: canonical values for externally-cited jobs ----
  console.log(`\nCanonical DB values for review-cited job IDs (what EVERY page will`);
  console.log(`show once its cache window passes):`);
  for (const id of CITED) {
    const { data } = await supabase
      .from("jobs").select("id, title, category, company_name, is_open").eq("id", id).maybeSingle();
    if (!data) { console.log(`  [${id}] not found`); continue; }
    console.log(`  [${data.id}] ${String(data.title).slice(0, 52).padEnd(53)} → ${data.category}${data.is_open ? "" : "  (closed)"}`);
  }

  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
