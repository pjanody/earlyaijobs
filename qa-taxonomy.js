// qa-taxonomy.js — READ-ONLY taxonomy consistency audit.
//
//   node --env-file=.env qa-taxonomy.js > taxonomy-report.txt 2>&1
//
// Two checks, both deterministic, neither of which writes anything:
//
//   1. SAME TITLE, DIFFERENT CATEGORY — the strongest possible signal that a
//      classification is unreliable. If "Incident Manager - Detection &
//      Response" is Security in Zürich and Operations in San Francisco, one
//      of them is wrong and we can't tell which from the label alone.
//      (Requested by Codex/GPT review, 2026-08-22.)
//
//   2. TITLE/CATEGORY CONTRADICTIONS — titles containing a strong signal word
//      that landed somewhere else. Not auto-corrected: printed for a human to
//      judge, because some are legitimately cross-functional.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit"];

// signal in title → the category we'd expect. Reviewed by hand, not applied.
const EXPECTATIONS = [
  [/\bcounsel\b|\battorney\b|\blawyer\b|\bparalegal\b/i, "legal-compliance"],
  [/\baccounting\b|\baccountant\b|\bcontroller\b|\btax\b/i, "finance"],
  [/\bpolicy\b/i, "policy"],
  [/\brecruiter\b|\brecruiting\b|\btalent acquisition\b/i, "people"],
  [/\bsolutions? architect\b|\bforward deployed\b|\bapplied ai architect\b/i, "solutions"],
  [/\bmarketing\b/i, "marketing"],
  [/\bdesigner\b/i, "design"],
];

const PAGE = 500;
async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("jobs").select("id, title, company_name, category, location")
      .eq("is_open", true).in("company_name", APPROVED)
      .order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// Strip location suffixes so "Incident Manager, Zürich" and "Incident
// Manager, San Francisco" compare as the same role.
function normaliseTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[–—-]\s*[a-z .'’]+$/i, "")   // trailing " - EMEA", " — Zurich"
    .replace(/,\s*[a-z .'’]+$/i, "")        // trailing ", San Francisco"
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 &]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const jobs = await fetchAll();
  console.log(`EarlyAIJobs — taxonomy consistency audit · ${jobs.length} open jobs\n`);

  // ---------- 1. same company + same normalized title, different category ----------
  const groups = new Map();
  for (const j of jobs) {
    const key = `${j.company_name}::${normaliseTitle(j.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }
  const inconsistent = [...groups.entries()]
    .filter(([, list]) => new Set(list.map((j) => j.category)).size > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log("=".repeat(78));
  console.log(`1. SAME TITLE, DIFFERENT CATEGORY — ${inconsistent.length} title group(s)`);
  console.log("=".repeat(78));
  if (!inconsistent.length) console.log("None. Every repeated title classifies identically.\n");
  for (const [key, list] of inconsistent) {
    const [company, title] = key.split("::");
    console.log(`\n${company} — "${title}" (${list.length} postings)`);
    const byCat = {};
    for (const j of list) (byCat[j.category] = byCat[j.category] || []).push(j);
    for (const [cat, js] of Object.entries(byCat)) {
      console.log(`   ${String(js.length).padStart(3)} × ${cat.padEnd(18)} e.g. [${js[0].id}] ${js[0].location || ""}`);
    }
    console.log(`   VERDICT: ____________`);
  }

  // ---------- 2. title/category contradictions ----------
  const contradictions = [];
  for (const j of jobs) {
    for (const [re, expected] of EXPECTATIONS) {
      if (re.test(j.title) && j.category !== expected) {
        contradictions.push({ job: j, expected, signal: String(re).slice(0, 40) });
        break;
      }
    }
  }
  console.log(`\n${"=".repeat(78)}`);
  console.log(`2. TITLE SUGGESTS ONE CATEGORY, JOB IS IN ANOTHER — ${contradictions.length} job(s)`);
  console.log("=".repeat(78));
  console.log("Review only — some are legitimately cross-functional.\n");

  const byPair = {};
  for (const c of contradictions) {
    const k = `${c.expected} ← ${c.job.category}`;
    (byPair[k] = byPair[k] || []).push(c);
  }
  for (const [pair, list] of Object.entries(byPair).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\nexpected ${pair}  (${list.length})`);
    for (const c of list.slice(0, 8)) {
      console.log(`   [${c.job.id}] ${c.job.company_name.padEnd(11)} ${String(c.job.title).slice(0, 58)}`);
    }
    if (list.length > 8) console.log(`   … and ${list.length - 8} more`);
  }

  // ---------- 3. category distribution, for context ----------
  const counts = {};
  for (const j of jobs) counts[j.category] = (counts[j.category] || 0) + 1;
  console.log(`\n${"=".repeat(78)}\n3. CATEGORY DISTRIBUTION\n${"=".repeat(78)}`);
  for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${String(n).padStart(5)}  ${((n / jobs.length) * 100).toFixed(1)}%`);
  }
  const otherShare = ((counts.other || 0) / jobs.length) * 100;
  console.log(`\n"other" is ${otherShare.toFixed(1)}% of the corpus — it should be an exception`);
  console.log(`bucket, not a parking lot. Above ~5% suggests missing rules.`);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
