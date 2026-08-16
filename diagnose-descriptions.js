// diagnose-descriptions.js
// Verifies the premise behind v1.1: that re-ingestion at 6,000 chars actually
// delivers ROLE-RELEVANT text (responsibilities), not just more boilerplate.
//
// No writes. No API calls. Read-only diagnostics.
//
// Reports, per company:
//   - description coverage and length distribution
//   - whether recognised start/stop headings are present
//   - statistically-detected boilerplate (lines repeated across that
//     employer's postings) — the data-driven alternative to hand-maintained
//     heading lists
//   - how much text survives boilerplate removal
//   - sample of the actual text that would be classified

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const COMPANIES = [
  "anthropic", "openai", "stripe", "mongodb", "palantir",
  "databricks", "scaleai", "elevenlabs", "notion", "replit",
  "doordashusa", "figma", "gitlab", "elastic", "vercel",
];

const SAMPLE_PER_COMPANY = 120;   // enough for frequency statistics
const BOILERPLATE_THRESHOLD = 0.30; // a line in >30% of an employer's posts

// Heading vocabulary (deliberately broad — GPT's amendment: preference, not requirement)
const START_HEADINGS = [
  "about the role", "the role", "responsibilities", "key responsibilities",
  "what you'll do", "what you will do", "what you’ll do", "what you'll be doing",
  "what you’ll be doing", "in this role", "your impact", "you will", "role overview",
  "about this role", "what you'll own", "position summary", "job description",
];
const STOP_HEADINGS = [
  "benefits", "benefits and perks", "compensation", "total compensation",
  "annual salary", "salary range", "pay range", "equal opportunity",
  "equal employment opportunity", "eeo", "accommodations", "privacy",
  "how to apply", "application process", "about anthropic", "about us",
  "why join", "our mission", "e-verify", "visa sponsorship",
];

const has = (text, phrases) => phrases.some(p => text.includes(p));
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function fetchCompany(slug) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company_name, description")
    .eq("company_name", slug)
    .eq("is_open", true)
    .limit(SAMPLE_PER_COMPANY);
  if (error) throw new Error(`${slug}: ${error.message}`);
  return data || [];
}

// Lines appearing in >threshold of a company's postings are boilerplate by
// definition — no vocabulary list required, adapts to any employer.
function detectBoilerplate(jobs) {
  const counts = new Map();
  for (const job of jobs) {
    const lines = new Set(
      String(job.description || "").split("\n")
        .map(l => l.trim())
        .filter(l => l.length >= 25)   // ignore short fragments
    );
    for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  }
  const cutoff = Math.max(2, Math.ceil(jobs.length * BOILERPLATE_THRESHOLD));
  return [...counts.entries()]
    .filter(([, n]) => n >= cutoff)
    .sort((a, b) => b[1] - a[1]);
}

function stripBoilerplate(description, boilerplateSet) {
  return String(description || "").split("\n")
    .map(l => l.trim())
    .filter(l => l && !boilerplateSet.has(l))
    .join("\n");
}

async function main() {
  console.log("EarlyAIJobs — description diagnostics (read-only)\n");
  console.log(`Sample: up to ${SAMPLE_PER_COMPANY} jobs per company | boilerplate threshold: ${BOILERPLATE_THRESHOLD * 100}% of an employer's postings\n`);

  const overall = { jobs: 0, withDesc: 0, lens: [], startFound: 0, stopFound: 0, survived: [] };

  for (const slug of COMPANIES) {
    const jobs = await fetchCompany(slug);
    if (!jobs.length) { console.log(`\n### ${slug}: no open jobs found\n`); continue; }

    const lens = jobs.map(j => (j.description || "").length);
    const withDesc = jobs.filter(j => (j.description || "").length > 0).length;
    const boiler = detectBoilerplate(jobs);
    const boilerSet = new Set(boiler.map(([line]) => line));

    let startFound = 0, stopFound = 0;
    const survivedLens = [];
    for (const job of jobs) {
      const lower = String(job.description || "").toLowerCase();
      if (has(lower, START_HEADINGS)) startFound++;
      if (has(lower, STOP_HEADINGS)) stopFound++;
      survivedLens.push(stripBoilerplate(job.description, boilerSet).length);
    }

    console.log(`\n${"═".repeat(70)}`);
    console.log(`### ${slug}  (${jobs.length} sampled)`);
    console.log(`  descriptions present : ${withDesc}/${jobs.length}`);
    console.log(`  length  median/max   : ${median(lens)} / ${Math.max(...lens)} chars`);
    console.log(`  hit 6000-char cap    : ${lens.filter(l => l >= 6000).length}/${jobs.length}`);
    console.log(`  start heading found  : ${startFound}/${jobs.length}`);
    console.log(`  stop heading found   : ${stopFound}/${jobs.length}`);
    console.log(`  after boilerplate strip, median length: ${median(survivedLens)} chars`);
    console.log(`  detected boilerplate lines: ${boiler.length}`);
    for (const [line, n] of boiler.slice(0, 4)) {
      console.log(`      [${n}/${jobs.length}] ${line.slice(0, 100)}${line.length > 100 ? "…" : ""}`);
    }

    const sample = jobs.find(j => (j.description || "").length > 500) || jobs[0];
    if (sample) {
      const cleaned = stripBoilerplate(sample.description, boilerSet);
      console.log(`\n  SAMPLE JOB: ${sample.title}`);
      console.log(`  --- raw description, first 400 chars ---`);
      console.log("  " + String(sample.description || "").slice(0, 400).replace(/\n/g, "\n  "));
      console.log(`  --- after boilerplate removal, first 400 chars ---`);
      console.log("  " + cleaned.slice(0, 400).replace(/\n/g, "\n  "));
    }

    overall.jobs += jobs.length;
    overall.withDesc += withDesc;
    overall.lens.push(...lens);
    overall.startFound += startFound;
    overall.stopFound += stopFound;
    overall.survived.push(...survivedLens);
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`\n=== OVERALL ===`);
  console.log(`Jobs sampled            : ${overall.jobs}`);
  console.log(`With a description      : ${overall.withDesc} (${Math.round(overall.withDesc / overall.jobs * 100)}%)`);
  console.log(`Median description len  : ${median(overall.lens)} chars`);
  console.log(`Reached the 6000 cap    : ${overall.lens.filter(l => l >= 6000).length} (${Math.round(overall.lens.filter(l => l >= 6000).length / overall.jobs * 100)}%)`);
  console.log(`Start heading detected  : ${overall.startFound} (${Math.round(overall.startFound / overall.jobs * 100)}%)`);
  console.log(`Stop heading detected   : ${overall.stopFound} (${Math.round(overall.stopFound / overall.jobs * 100)}%)`);
  console.log(`Median length after boilerplate removal: ${median(overall.survived)} chars`);
  console.log(`\nVERDICT GUIDE:`);
  console.log(`  If median length after boilerplate removal is comfortably >500 chars,`);
  console.log(`  the v1.1 evidence plan is viable. If it collapses toward 0, the`);
  console.log(`  postings are boilerplate-dominant and the plan needs rethinking.`);
}

main().catch(err => {
  console.error(`\nSTOPPED: ${err.message || err}`);
  process.exit(1);
});
