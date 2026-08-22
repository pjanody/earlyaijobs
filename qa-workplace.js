// qa-workplace.js — READ-ONLY QA closure phase requested by Codex.
//
//   node --env-file=.env qa-workplace.js > qa-workplace.txt 2>&1
//
// Answers four things:
//   1. AGREEMENT TEST — for jobs where the ATS says hybrid, does the
//      description parser INDEPENDENTLY agree? This is the real test of the
//      description rules; matching totals prove nothing (Codex was right).
//   2. HYBRID RULE BREAKDOWN — which rule produced each of the ~522
//      description-derived hybrid labels, with sampled matched sentences.
//   3. CONFLICT EVIDENCE — every conflict with source A, source B, the rule
//      that fired, the matched text, and which precedence won.
//   4. CONFLICT COUNT RECONCILIATION — the 79-vs-71 discrepancy.

const { createClient } = require("@supabase/supabase-js");
const { parseLocation, detectWorkplaceFromDescription, DESC_RULES } = require("./location-parser");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral", "figureai", "coreweave"];
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

// Descriptions are stored in full now, so a 1,000-row page can be many MB and
// the request sometimes dies mid-flight ("fetch failed"). Small pages + retries,
// same defensive shape we already use for upserts in upload-jobs.js.
const PAGE = 200;

async function fetchPage(from) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from("jobs").select("id, title, company_name, location, description, workplace_type")
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
  const rows = jobs.map((job) => ({ job, loc: parseLocation(job) }));
  console.log(`EarlyAIJobs — workplace QA · ${jobs.length} open jobs\n`);

  // ---------- 1. AGREEMENT TEST ----------
  console.log("=".repeat(78));
  console.log("1. AGREEMENT TEST — do ATS and description agree on the SAME jobs?");
  console.log("=".repeat(78));
  console.log("Counts matching is not corroboration. This measures per-record agreement.\n");

  for (const atsValue of ["hybrid", "remote", "on-site"]) {
    const subset = rows.filter((r) => r.loc.workplace_evidence && r.loc.workplace_evidence.ats === atsValue);
    if (!subset.length) continue;
    const tally = {};
    for (const r of subset) {
      const d = r.loc.workplace_evidence.description;
      tally[d || "no-opinion"] = (tally[d || "no-opinion"] || 0) + 1;
    }
    const agree = tally[atsValue] || 0;
    const silent = tally["no-opinion"] || 0;
    const disagree = subset.length - agree - silent;
    console.log(`ATS says ${atsValue.toUpperCase()} — ${subset.length} jobs`);
    console.log(`  description agrees      : ${agree} (${pct(agree, subset.length)})`);
    console.log(`  description has no view : ${silent} (${pct(silent, subset.length)})`);
    console.log(`  description DISAGREES   : ${disagree} (${pct(disagree, subset.length)})`);
    const nonSilent = subset.length - silent;
    console.log(`  → agreement where both spoke: ${pct(agree, nonSilent)} (${agree}/${nonSilent})`);
    console.log(`  breakdown: ${JSON.stringify(tally)}\n`);
  }

  // ---------- 2. HYBRID RULE BREAKDOWN ----------
  console.log("=".repeat(78));
  console.log("2. DESCRIPTION-DERIVED CLASSIFICATIONS BY RULE");
  console.log("=".repeat(78));

  const byRule = {};
  for (const r of rows) {
    if (r.loc.workplace_source !== "description") continue;
    const rule = r.loc.workplace_rule || "unknown-rule";
    (byRule[rule] = byRule[rule] || []).push(r);
  }
  const ruleEntries = Object.entries(byRule).sort((a, b) => b[1].length - a[1].length);
  for (const [rule, list] of ruleEntries) {
    console.log(`\n${rule.padEnd(26)} ${String(list.length).padStart(5)} jobs`);
    for (const r of list.slice(0, 3)) {
      console.log(`    [${r.job.company_name}] ${String(r.job.title).slice(0, 58)}`);
      console.log(`      matched: …${String(r.loc.workplace_evidence.description_text).slice(0, 150)}…`);
    }
  }

  console.log(`\nRules that never fired: ${DESC_RULES.map((r) => r.id).filter((id) => !byRule[id]).join(", ") || "none"}`);

  // ---------- 3. CONFLICT EVIDENCE ----------
  const conflicts = rows.filter((r) => r.loc.location_qa_flags.includes("workplace-source-conflict"));
  console.log(`\n${"=".repeat(78)}`);
  console.log(`3. CONFLICT EVIDENCE — ${conflicts.length} jobs where sources disagree`);
  console.log("=".repeat(78));

  const families = {};
  for (const r of conflicts) {
    const e = r.loc.workplace_evidence;
    const primary = e.ats ? `ats=${e.ats}` : `location-text=${e.location_text}`;
    const key = `${primary} VS description=${e.description}`;
    (families[key] = families[key] || []).push(r);
  }
  console.log("\nConflict families:");
  Object.entries(families).sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v]) => console.log(`  ${String(v.length).padStart(4)}  ${k}`));

  console.log(`\nDetail (up to 30, spread across families):`);
  let shown = 0;
  for (const [family, list] of Object.entries(families)) {
    const take = Math.max(1, Math.round(30 * (list.length / conflicts.length)));
    for (const r of list.slice(0, take)) {
      if (shown++ >= 30) break;
      const e = r.loc.workplace_evidence;
      console.log(`\n${"-".repeat(78)}`);
      console.log(`[${r.job.id}] ${r.job.company_name} — ${String(r.job.title).slice(0, 62)}`);
      console.log(`  raw location    : "${r.job.location || ""}"`);
      console.log(`  SOURCE A (ats)  : ${e.ats || "—"}`);
      console.log(`  SOURCE B (text) : ${e.location_text || "—"}`);
      console.log(`  SOURCE C (desc) : ${e.description || "—"}   rule: ${e.description_rule || "—"}`);
      console.log(`  matched text    : …${String(e.description_text || "").slice(0, 200)}…`);
      console.log(`  CHOSEN          : ${r.loc.workplace_type}  (precedence: ${r.loc.workplace_source})`);
      console.log(`  VERDICT         : ____________`);
    }
  }

  // ---------- 5. IS ONE FEED BROKEN? ----------
  // The on-site agreement rate came back 0/27. Either every description is
  // wrong, or one company's ATS field is junk. Split by company to find out —
  // trust should be per-feed, not global.
  console.log(`\n${"=".repeat(78)}`);
  console.log("5. ATS TRUSTWORTHINESS BY COMPANY");
  console.log("=".repeat(78));

  for (const co of APPROVED) {
    const mine = rows.filter((r) => r.job.company_name === co);
    if (!mine.length) continue;
    console.log(`\n${co} — ${mine.length} jobs`);
    for (const v of ["remote", "hybrid", "on-site"]) {
      const subset = mine.filter((r) => r.loc.workplace_evidence && r.loc.workplace_evidence.ats === v);
      if (!subset.length) continue;
      let agree = 0, silent = 0, contra = 0;
      for (const r of subset) {
        const d = r.loc.workplace_evidence.description;
        if (!d) silent++; else if (d === v) agree++; else contra++;
      }
      const spoke = agree + contra;
      console.log(`  ats=${v.padEnd(8)} ${String(subset.length).padStart(4)} jobs · agree ${agree} · silent ${silent} · CONTRADICT ${contra}`
        + `   → ${spoke ? pct(agree, spoke) + " agreement where both spoke" : "description never spoke"}`);
    }
    const noAts = mine.filter((r) => r.loc.workplace_evidence && !r.loc.workplace_evidence.ats).length;
    if (noAts) console.log(`  (no ats value on ${noAts} jobs)`);
  }

  // ---------- 6. BOILERPLATE DETECTION ----------
  // A sentence printed on 90% of a company's postings tells you about the
  // COMPANY, not the JOB. Anthropic's "we expect all staff in an office 25% of
  // the time" appears even on postings Anthropic itself labels Remote-Friendly.
  // Deterministic test: what share of a company's jobs does each rule fire on?
  console.log(`\n${"=".repeat(78)}`);
  console.log("6. IS THIS RULE READING THE JOB, OR THE COMPANY'S FOOTER?");
  console.log("=".repeat(78));
  console.log("A rule firing on most of a company's postings is boilerplate: it cannot");
  console.log("distinguish one job from another, so it is not per-job evidence.\n");

  for (const co of APPROVED) {
    const mine = rows.filter((r) => r.job.company_name === co);
    if (!mine.length) continue;
    const hits = {};
    for (const r of mine) {
      const e = r.loc.workplace_evidence;
      if (e && e.description_rule) (hits[e.description_rule] = hits[e.description_rule] || []).push(r);
    }
    const entries = Object.entries(hits).sort((a, b) => b[1].length - a[1].length);
    if (!entries.length) continue;
    console.log(`${co} — ${mine.length} jobs`);
    for (const [rule, list] of entries) {
      const share = list.length / mine.length;
      // The tell: does it also fire on jobs the company itself calls remote?
      const onRemote = list.filter((r) => /remote/i.test(String(r.job.location || ""))).length;
      const verdict = share >= 0.7 ? "BOILERPLATE" : share >= 0.3 ? "suspicious" : "job-specific";
      console.log(`  ${rule.padEnd(24)} ${String(list.length).padStart(4)} jobs (${(share * 100).toFixed(0)}% of company) `
        + `· also fires on ${onRemote} jobs whose location says "remote"  → ${verdict}`);
    }
    console.log("");
  }

  // ---------- 4. COUNT RECONCILIATION ----------
  console.log(`\n${"=".repeat(78)}`);
  console.log("4. CONFLICT COUNT RECONCILIATION");
  console.log("=".repeat(78));
  console.log(`Conflicts in this run: ${conflicts.length}`);
  console.log(`\nThe audit sampler assigns each job to ONE stratum and marks it used, so`);
  console.log(`strata evaluated earlier (multi-location, remote+geography, hybrid) consume`);
  console.log(`conflict jobs before the conflict stratum is reached. The conflict stratum`);
  console.log(`therefore reports a smaller "of N matching" figure than the corpus total.`);
  console.log(`That is a sampling artefact, not a corpus discrepancy — both files come`);
  console.log(`from one in-memory run of the same fetch.`);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
