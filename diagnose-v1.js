// diagnose-v1.js — section 9 + 10 of the accepted plan. READ-ONLY.
// Runs the frozen-scope normalizer over every open job and reports exactly
// what the plan asks for, plus the ~50-row inspection sample.
//
//   node --env-file=.env diagnose-v1.js > v1-report.txt 2>&1
//
// The only question that matters for each sampled row:
//   "Will the Location filter and Remote checkbox return this job correctly?"
// No hybrid/on-site auditing. That scope is closed.

const { createClient } = require("@supabase/supabase-js");
const { normalizeV1 } = require("./normalize-v1");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral", "figureai", "coreweave"];
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

const PAGE = 200;
async function fetchPage(from) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from("jobs").select("id, title, company_name, source_platform, location, description, workplace_type")
        .eq("is_open", true).in("company_name", APPROVED)
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

async function main() {
  const jobs = await fetchAll();
  const rows = jobs.map((job) => ({ job, n: normalizeV1(job) }));

  // ---------- Section 9: adapter table ----------
  console.log("SECTION 9 — SOURCE ADAPTER TABLE (the four facts per company)");
  console.log("=".repeat(78));
  console.log("Company      | ATS        | Country source        | Remote source");
  console.log("-".repeat(78));
  for (const co of APPROVED) {
    const mine = rows.filter((r) => r.job.company_name === co);
    if (!mine.length) continue;
    const ats = [...new Set(mine.map((r) => r.job.source_platform))].join(",");
    const countrySrc = {};
    const remoteSrc = {};
    for (const r of mine) {
      countrySrc[r.n._parsed.location_source] = (countrySrc[r.n._parsed.location_source] || 0) + 1;
      if (r.n.is_remote === true) remoteSrc[r.n.remote_source] = (remoteSrc[r.n.remote_source] || 0) + 1;
    }
    const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ") || "—";
    console.log(`${co.padEnd(12)} | ${ats.padEnd(10)} | ${fmt(countrySrc).slice(0, 40)}`);
    console.log(`${"".padEnd(12)} |            | remote via: ${fmt(remoteSrc)}`);
  }

  // ---------- Section 10: corpus report ----------
  const withCountry = rows.filter((r) => r.n.location_countries.length >= 1);
  const multi = rows.filter((r) => r.n.location_countries.length > 1);
  const noCountry = rows.filter((r) => r.n.location_countries.length === 0);
  const remoteTrue = rows.filter((r) => r.n.is_remote === true);
  const remoteFalse = rows.filter((r) => r.n.is_remote === false);
  const remoteNull = rows.filter((r) => r.n.is_remote === null);
  const english = rows.filter((r) => r.n.posting_language === "en");
  const und = rows.filter((r) => r.n.posting_language === "und");
  const nonEnglish = rows.length - english.length - und.length;

  console.log(`\nSECTION 10 — CORPUS REPORT`);
  console.log("=".repeat(78));
  console.log(`total open jobs               : ${rows.length}`);
  console.log(`jobs with ≥1 country          : ${withCountry.length} (${pct(withCountry.length, rows.length)})`);
  console.log(`jobs with multiple countries  : ${multi.length} (${pct(multi.length, rows.length)})`);
  console.log(`jobs with NO country          : ${noCountry.length}`);
  noCountry.slice(0, 15).forEach((r) =>
    console.log(`    [${r.job.id}] ${r.job.company_name} — "${r.job.location || ""}" — ${String(r.job.title).slice(0, 50)}`));

  console.log(`\nis_remote = true              : ${remoteTrue.length} (${pct(remoteTrue.length, rows.length)})`);
  console.log(`is_remote = false             : ${remoteFalse.length}`);
  console.log(`is_remote = null (unknown)    : ${remoteNull.length}`);

  const bySrc = {};
  for (const r of remoteTrue) bySrc[r.n.remote_source] = (bySrc[r.n.remote_source] || 0) + 1;
  console.log(`\nconfirmed remote by source:`);
  Object.entries(bySrc).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(32)} ${String(v).padStart(5)}`));

  const invariantBreak = remoteTrue.filter((r) => !r.n.remote_source);
  console.log(`\nINVARIANT is_remote=true ⇒ documented source: ${invariantBreak.length ? `VIOLATED ×${invariantBreak.length}` : "holds"}`);

  console.log(`\nlanguage: en=${english.length} · non-English=${nonEnglish} · undetermined=${und.length}`);
  const langOther = {};
  for (const r of rows) if (!["en", "und"].includes(r.n.posting_language))
    langOther[r.n.posting_language] = (langOther[r.n.posting_language] || 0) + 1;
  if (Object.keys(langOther).length) console.log(`  non-English breakdown: ${JSON.stringify(langOther)}`);

  const codes = {};
  for (const r of rows) for (const c of r.n.location_countries) codes[c] = (codes[c] || 0) + 1;
  console.log(`\ndistinct country codes (${Object.keys(codes).length}):`);
  console.log(Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));

  const regionHits = {};
  for (const r of rows) for (const g of r.n.location_region_codes) regionHits[g] = (regionHits[g] || 0) + 1;
  console.log(`\nregion codes in corpus: ${JSON.stringify(regionHits)}`);

  const usca = rows.filter((r) => r.n.remote_source === "source-rule:usca");
  console.log(`source-specific rule hits: USCA ×${usca.length}`);

  // ---------- Section 10: inspection sample (~50) ----------
  console.log(`\nINSPECTION SAMPLE — question per row: "Will the Location filter and`);
  console.log(`Remote checkbox return this job correctly?"`);
  console.log("=".repeat(78));

  const strata = {
    "remote + Canada":        { want: 6, match: (r) => r.n.is_remote === true && r.n.location_countries.includes("CA") },
    "remote + US":            { want: 6, match: (r) => r.n.is_remote === true && r.n.location_countries.includes("US") },
    "remote + Poland":        { want: 4, match: (r) => r.n.is_remote === true && r.n.location_countries.includes("PL") },
    "multi-country":          { want: 8, match: (r) => r.n.location_countries.length > 1 },
    "USCA":                   { want: 4, match: (r) => r.n.remote_source === "source-rule:usca" },
    "Remote-Friendly":        { want: 6, match: (r) => /remote[-\s]?friendly/i.test(String(r.job.location)) },
    "ATS Remote":             { want: 8, match: (r) => r.n.remote_source === "ats" },
    "not-confirmed (null)":   { want: 8, match: (r) => r.n.is_remote === null },
  };

  const used = new Set();
  for (const [name, s] of Object.entries(strata)) {
    const total = rows.filter((r) => s.match(r));
    const pool = total.filter((r) => !used.has(r.job.id));
    const step = Math.max(1, Math.floor(pool.length / Math.min(s.want, pool.length || 1)));
    const picked = [];
    for (let i = 0; i < pool.length && picked.length < s.want; i += step) picked.push(pool[i]);

    console.log(`\n### ${name} — ${picked.length} sampled of ${total.length} corpus-wide`);
    for (const r of picked) {
      used.add(r.job.id);
      console.log("-".repeat(78));
      console.log(`[${r.job.id}] ${r.job.company_name} — ${String(r.job.title).slice(0, 66)}`);
      console.log(`  RAW      : "${r.job.location || ""}"  (ats workplace: ${r.job.workplace_type || "—"})`);
      console.log(`  FILTERS  : countries=[${r.n.location_countries}] regions=[${r.n.location_region_codes}] remote=${r.n.is_remote} (${r.n.remote_source || "no source"}) lang=${r.n.posting_language}`);
      console.log(`  VERDICT  : ____________`);
    }
  }

  console.log(`\nDone. ${used.size} rows to inspect. Nothing was written.`);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
