// diagnose-salary.js — READ-ONLY salary extraction dry run.
//
//   node --env-file=.env diagnose-salary.js > salary-report.txt 2>&1
//
// Writes NOTHING. Runs the parser over every open job and reports what it
// would store, so the numbers can be reviewed before any backfill — same gate
// we used for the location/remote backfill.
//
// What to look for in the output:
//   - "parsed" share per company: does it match how often that employer
//     actually discloses pay? (US pay-transparency laws mean Anthropic,
//     OpenAI and Databricks disclose a lot; European postings much less.)
//   - the FALSE-POSITIVE HUNT section: descriptions with many dollar figures
//     where we still parsed something. That's where a bad rule would show up.

const { createClient } = require("@supabase/supabase-js");
const { extractSalary, formatSalary } = require("./lib/salary");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral", "figureai", "coreweave", "togetherai", "sierra", "harvey"];
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

const PAGE = 200;
async function fetchPage(from) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, company_name, location_countries, description, description_html")
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
  const rows = jobs.map((job) => ({ job, s: extractSalary(job) }));

  const parsed = rows.filter((r) => r.s.status === "parsed");
  const nonUsd = rows.filter((r) => r.s.status === "non-usd");
  const ambiguous = rows.filter((r) => r.s.status === "ambiguous");
  const none = rows.filter((r) => r.s.status === "none");

  console.log(`EarlyAIJobs — salary extraction dry run (READ-ONLY) · ${rows.length} open jobs\n`);
  console.log("=".repeat(78));
  console.log("1. OVERALL");
  console.log("=".repeat(78));
  console.log(`  parsed    : ${parsed.length} (${pct(parsed.length, rows.length)})   ← would display a salary`);
  console.log(`  non-usd   : ${nonUsd.length} (${pct(nonUsd.length, rows.length)})   ← pay disclosed in another currency; recorded, never displayed`);
  console.log(`  ambiguous : ${ambiguous.length} (${pct(ambiguous.length, rows.length)})   ← pay mentioned, not safely parseable; display nothing`);
  console.log(`  none      : ${none.length} (${pct(none.length, rows.length)})   ← employer disclosed no pay`);

  // ---------- by company ----------
  console.log(`\n${"=".repeat(78)}\n2. BY COMPANY\n${"=".repeat(78)}`);
  console.log("company       parsed  nonUSD  ambig   none    total   parsed%");
  for (const co of APPROVED) {
    const mine = rows.filter((r) => r.job.company_name === co);
    if (!mine.length) continue;
    const p = mine.filter((r) => r.s.status === "parsed").length;
    const u = mine.filter((r) => r.s.status === "non-usd").length;
    const a = mine.filter((r) => r.s.status === "ambiguous").length;
    const n = mine.filter((r) => r.s.status === "none").length;
    console.log(`${co.padEnd(13)} ${String(p).padStart(6)} ${String(u).padStart(7)} ${String(a).padStart(6)} ${String(n).padStart(6)} ${String(mine.length).padStart(7)}   ${pct(p, mine.length)}`);
  }

  // ---------- distributions ----------
  const tally = (arr, f) => arr.reduce((o, x) => { const k = f(x) || "—"; o[k] = (o[k] || 0) + 1; return o; }, {});
  console.log(`\n${"=".repeat(78)}\n3. DISTRIBUTIONS (parsed only)\n${"=".repeat(78)}`);
  console.log("currency:", JSON.stringify(tally(parsed, (r) => r.s.currency)));
  console.log("period  :", JSON.stringify(tally(parsed, (r) => r.s.period)));
  console.log("open-ended (from/up-to):", parsed.filter((r) => r.s.min === null || r.s.max === null).length);
  console.log("OTE mentioned anywhere :", rows.filter((r) => r.s.has_ote).length);

  const annual = parsed.filter((r) => r.s.period === "year" && r.s.min && r.s.max);
  if (annual.length) {
    const mins = annual.map((r) => r.s.min).sort((a, b) => a - b);
    const maxs = annual.map((r) => r.s.max).sort((a, b) => a - b);
    const q = (arr, p) => arr[Math.floor(arr.length * p)];
    console.log(`\nannual ranges (${annual.length} jobs):`);
    console.log(`  min  p10 ${q(mins, 0.1).toLocaleString()} · median ${q(mins, 0.5).toLocaleString()} · p90 ${q(mins, 0.9).toLocaleString()}`);
    console.log(`  max  p10 ${q(maxs, 0.1).toLocaleString()} · median ${q(maxs, 0.5).toLocaleString()} · p90 ${q(maxs, 0.9).toLocaleString()}`);
    console.log(`  lowest parsed  : ${mins[0].toLocaleString()}`);
    console.log(`  highest parsed : ${maxs[maxs.length - 1].toLocaleString()}`);
  }

  // ---------- samples ----------
  const sample = (label, arr, n = 12) => {
    console.log(`\n${"=".repeat(78)}\n${label} — ${Math.min(n, arr.length)} of ${arr.length}\n${"=".repeat(78)}`);
    const step = Math.max(1, Math.floor(arr.length / n));
    for (let i = 0, shown = 0; i < arr.length && shown < n; i += step, shown++) {
      const r = arr[i];
      console.log(`\n[${r.job.id}] ${r.job.company_name} — ${String(r.job.title).slice(0, 58)}`);
      console.log(`  PARSED : ${formatSalary(r.s) || "(nothing displayed)"}   [${r.s.currency || "?"} ${r.s.period || "?"}${r.s.has_ote ? " · OTE mentioned" : ""}]`);
      console.log(`  SOURCE : …${String(r.s.raw || "").slice(0, 190)}…`);
      console.log(`  VERDICT: ____________`);
    }
  };

  sample("4. PARSED SAMPLE — does the number match the source text?", parsed, 20);
  sample("5. AMBIGUOUS SAMPLE — should any of these be parseable?", ambiguous, 10);
  sample("5b. NON-USD SAMPLE — correctly withheld from display", nonUsd, 8);

  // ---------- false-positive hunt ----------
  // Jobs whose descriptions are full of dollar figures are where a loose rule
  // does damage. If we parsed one of these, the source text must justify it.
  const moneyHeavy = parsed
    .map((r) => ({ r, count: (String(r.job.description_html || r.job.description || "").match(/[$£€]/g) || []).length }))
    .filter((x) => x.count >= 6)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  console.log(`\n${"=".repeat(78)}\n6. FALSE-POSITIVE HUNT — parsed jobs with 6+ currency symbols\n${"=".repeat(78)}`);
  if (!moneyHeavy.length) console.log("None — no money-dense description produced a parse.");
  for (const { r, count } of moneyHeavy) {
    console.log(`\n[${r.job.id}] ${r.job.company_name} — ${String(r.job.title).slice(0, 55)}  (${count} currency symbols)`);
    console.log(`  PARSED : ${formatSalary(r.s)}`);
    console.log(`  SOURCE : …${String(r.s.raw || "").slice(0, 190)}…`);
    console.log(`  VERDICT: ____________`);
  }

  console.log(`\nNothing was written. Review, then approve the backfill.`);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
