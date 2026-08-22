// show-unknown-workplace.js — READ-ONLY. Show jobs where the parser found no
// workplace evidence, and why. Helps decide whether the description rules
// need more phrases or whether these postings genuinely say nothing.
//
//   node --env-file=.env show-unknown-workplace.js
//   node --env-file=.env show-unknown-workplace.js 40      (more examples)

const { createClient } = require("@supabase/supabase-js");
const { parseLocation } = require("./location-parser");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral", "figureai", "coreweave"];
const LIMIT = Number(process.argv[2] || 20);

// Any mention of workplace-ish vocabulary, even the vague kind our rules
// deliberately ignore. If a job has NONE of these, the posting really is silent.
const HINT_RE = /\b(remote|hybrid|on-?site|in-office|office|work from home|wfh|relocat|in person|distributed)\b/i;

async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("jobs").select("id, title, company_name, location, description, workplace_type")
      .eq("is_open", true).in("company_name", APPROVED).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function snippet(desc, re) {
  const m = String(desc || "").match(re);
  if (!m) return null;
  const i = Math.max(0, m.index - 90);
  return String(desc).slice(i, m.index + 120).replace(/\s+/g, " ").trim();
}

async function main() {
  const jobs = await fetchAll();
  const unknown = jobs.filter((j) => parseLocation(j).workplace_type === "unknown");

  // Split into: postings that never mention workplace at all, vs postings that
  // mention it in language too vague for our conservative rules.
  const silent = [], vague = [];
  for (const j of unknown) (HINT_RE.test(j.description || "") ? vague : silent).push(j);

  console.log(`Unknown workplace: ${unknown.length} of ${jobs.length} open jobs (${((unknown.length / jobs.length) * 100).toFixed(1)}%)\n`);

  const byCo = {};
  for (const j of unknown) byCo[j.company_name] = (byCo[j.company_name] || 0) + 1;
  console.log("By company:");
  Object.entries(byCo).sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${c.padEnd(12)} ${String(n).padStart(5)}`));

  console.log(`\nNo workplace vocabulary anywhere in the posting: ${silent.length}`);
  console.log(`Mentions workplace words, but too vague for our rules: ${vague.length}`);

  const show = (label, arr) => {
    console.log(`\n${"=".repeat(78)}\n${label}\n${"=".repeat(78)}`);
    const step = Math.max(1, Math.floor(arr.length / LIMIT));
    let shown = 0;
    for (let i = 0; i < arr.length && shown < LIMIT; i += step, shown++) {
      const j = arr[i];
      console.log(`\n[${j.id}] ${j.company_name} — ${String(j.title).slice(0, 70)}`);
      console.log(`  raw location : "${j.location || ""}"`);
      console.log(`  ATS field    : ${j.workplace_type || "—"}   desc: ${String(j.description || "").length} chars`);
      const s = snippet(j.description, HINT_RE);
      if (s) console.log(`  nearest hint : …${s}…`);
    }
  };

  show(`VAGUE — mentions workplace words we deliberately don't trust (${Math.min(LIMIT, vague.length)} of ${vague.length})`, vague);
  show(`SILENT — posting says nothing about workplace (${Math.min(LIMIT, silent.length)} of ${silent.length})`, silent);

  console.log(`\nREAD THIS AS: "vague" examples are candidates for new deterministic phrases.`);
  console.log(`"silent" examples are correctly unknown — no evidence exists to find.`);
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); process.exit(1); });
