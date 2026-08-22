// diagnose-parsers.js — Gate C: dry-run both parsers over the whole corpus.
// READ-ONLY. No writes, no AI, no cost.
//
//   node --env-file=.env diagnose-parsers.js > parser-report.txt 2>&1
//
// Produces the §27 diagnostic report AND writes audit-sample.txt — the Gate D
// stratified sample (~130 jobs) for manual precision review.
//
// Note: ats_locations (structured Greenhouse offices / Ashby secondary
// locations) does not exist in the schema until Gate E, so this dry run
// exercises the raw-string path — the same evidence the backfill would use
// today. Structured evidence is additive later.

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { parseLocation } = require("./location-parser");
const { detectPostingLanguage, SUPPORTED_LANGUAGES } = require("./language-parser");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral", "figureai", "coreweave"];

const tally = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;

async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, title, company_name, location, description, workplace_type")
      .eq("is_open", true).in("company_name", APPROVED)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function main_report(results, n) {
  const lang = {}, wp = {}, wpSrc = {}, scope = {}, src = {}, region = {}, country = {}, multi = {}, qa = {};
  let excluded = 0, maxLocs = 0, maxLocsJob = "";

  for (const r of results) {
    tally(lang, r.lang.language);
    if (!SUPPORTED_LANGUAGES.has(r.lang.language)) excluded++;
    tally(wp, r.loc.workplace_type);
    tally(wpSrc, `${r.loc.workplace_type} ← ${r.loc.workplace_source}`);
    tally(scope, r.loc.location_scope);
    tally(src, r.loc.location_source);
    for (const rc of r.loc.location_region_codes) tally(region, rc);
    for (const cc of r.loc.location_countries) tally(country, cc);
    const k = r.loc.location_list.length;
    tally(multi, k === 0 ? "0" : k === 1 ? "1" : k === 2 ? "2" : "3+");
    if (k > maxLocs) { maxLocs = k; maxLocsJob = `${r.job.company_name}: "${String(r.job.location).slice(0, 60)}"`; }
    for (const f of r.loc.location_qa_flags) tally(qa, f);
  }

  const section = (name, obj) => {
    console.log(`\n${name}`);
    Object.entries(obj).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${String(k).padEnd(28)} ${String(v).padStart(5)}  ${pct(v, n)}`));
  };

  console.log(`EarlyAIJobs — Gate C parser diagnostics (read-only) · ${n} open jobs`);
  section("LANGUAGE", lang);
  console.log(`  → excluded from publication: ${excluded} (${pct(excluded, n)})`);
  section("WORKPLACE", wp);
  section("WORKPLACE ← SOURCE", wpSrc);
  section("LOCATION SCOPE (resolution of primary)", scope);
  section("MULTIPLICITY (location_list length)", multi);
  console.log(`  max locations on one posting: ${maxLocs} — ${maxLocsJob}`);
  section("LOCATION SOURCE", src);
  section("REGION CODES", region);
  section("QA FLAGS", qa);

  console.log(`\nTOP 20 COUNTRIES (all eligible, not just primary)`);
  Object.entries(country).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(4)} ${String(v).padStart(5)}  ${pct(v, n)}`));
}

// ---- Gate D stratified audit sample ----

function buildAuditSample(results) {
  const strata = {
    "multi-location (2+)":      { want: 20, match: (r) => r.loc.location_list.length > 1 },
    "state-level":              { want: 15, match: (r) => r.loc.location_scope === "state" },
    "worldwide (all)":          { want: 999, match: (r) => r.loc.location_scope === "worldwide" },
    "country-only":             { want: 15, match: (r) => r.loc.location_scope === "country" && r.loc.location_list.length === 1 },
    "city-level":               { want: 15, match: (r) => r.loc.location_scope === "city" && r.loc.location_list.length === 1 },
    "remote + geography":       { want: 15, match: (r) => r.loc.workplace_type === "remote" && r.loc.location_countries.length > 0 },
    "hybrid":                   { want: 10, match: (r) => r.loc.workplace_type === "hybrid" },
    "semicolon/slash raw":      { want: 10, match: (r) => /[;\/|]/.test(String(r.job.location)) },
    "region (all)":             { want: 999, match: (r) => r.loc.location_region_codes.length > 0 },
    "source aliases (all)":     { want: 999, match: (r) => r.loc.location_source === "source-specific-rule" },
    // Conflicts turned out to be ~290 corpus-wide — sample 30 spread across
    // companies rather than all of them, so the audit stays hand-labelable.
    "workplace conflicts (sampled)": { want: 30, match: (r) => r.loc.location_qa_flags.includes("workplace-source-conflict") },
    "unknown location (all)":   { want: 999, match: (r) => r.loc.location_scope === "unknown" },
  };

  const used = new Set();
  const lines = [];
  lines.push("EarlyAIJobs — Gate D stratified precision audit sample");
  lines.push("For each row, label: CORRECT / PARTIAL / INCORRECT / SHOULD-PARSE / CORRECTLY-UNKNOWN");
  lines.push("=".repeat(90));

  for (const [name, s] of Object.entries(strata)) {
    // A job belongs to exactly one stratum: the first that claims it. So a
    // stratum's pool is only the jobs no EARLIER stratum already took. Report
    // both numbers — reporting only the pool made the conflict stratum look
    // smaller than the corpus-wide conflict count in parser-report.txt, which
    // is what Codex flagged. Same run, same corpus; the gap is claimed jobs.
    const total = results.filter((r) => s.match(r));
    const pool = total.filter((r) => !used.has(r.job.id));
    const claimed = total.length - pool.length;
    // deterministic spread: take evenly across the pool rather than the head
    const step = Math.max(1, Math.floor(pool.length / Math.min(s.want, pool.length || 1)));
    const picked = [];
    for (let i = 0; i < pool.length && picked.length < s.want; i += step) picked.push(pool[i]);

    lines.push(`\n### ${name} — ${picked.length} sampled of ${pool.length} unclaimed`
      + ` (${total.length} match corpus-wide; ${claimed} already sampled under an earlier stratum)`);
    for (const r of picked) {
      used.add(r.job.id);
      const L = r.loc;
      lines.push("-".repeat(90));
      lines.push(`[${r.job.id}] ${r.job.company_name} — ${String(r.job.title).slice(0, 70)}`);
      lines.push(`  RAW location   : "${r.job.location || ""}"`);
      lines.push(`  ATS workplace  : ${r.job.workplace_type || "—"}`);
      lines.push(`  NORMALIZED     : workplace=${L.workplace_type}(${L.workplace_source}) scope=${L.location_scope} rel=${L.location_relationship}`);
      lines.push(`                   countries=[${L.location_countries}] states=[${L.location_states}] cities=[${L.location_cities}] regions=[${L.location_region_codes}]`);
      lines.push(`                   list=${JSON.stringify(L.location_list)} source=${L.location_source}${L.location_qa_flags.length ? " qa=" + L.location_qa_flags.join(",") : ""}`);
      lines.push(`  LANGUAGE       : ${r.lang.language} (${r.lang.method}, ${r.lang.basis})`);
      // Show the reasoning whenever sources disagree, so a conflict row can be
      // judged without re-deriving anything by hand.
      if (L.location_qa_flags.includes("workplace-source-conflict")) {
        const e = L.workplace_evidence || {};
        lines.push(`  CONFLICT       : ats=${e.ats || "—"} | location-text=${e.location_text || "—"} | description=${e.description || "—"}`);
        lines.push(`    desc rule    : ${e.description_rule || "—"}`);
        lines.push(`    matched text : …${String(e.description_text || "").replace(/\s+/g, " ").slice(0, 180)}…`);
        lines.push(`    resolved to  : ${L.workplace_type} (precedence: ${L.workplace_source})`);
      }
      lines.push(`  VERDICT        : ____________`);
    }
  }

  fs.writeFileSync("audit-sample.txt", lines.join("\n"));
  return used.size;
}

async function main() {
  const jobs = await fetchAll();
  const results = jobs.map((job) => ({
    job,
    lang: detectPostingLanguage(job),
    loc: parseLocation(job),
  }));

  main_report(results, jobs.length);
  const sampled = buildAuditSample(results);
  console.log(`\nAUDIT SAMPLE: ${sampled} jobs written to audit-sample.txt (Gate D — label each VERDICT line).`);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
