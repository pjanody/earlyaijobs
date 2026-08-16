// diagnose-jobs.js — per-job evidence diagnostics (read-only, no API calls).
// Answers: did the 800-char limit hide responsibilities, and does the 6,000
// version now contain role-specific text?

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Jobs that had bad evidence in Test #1, plus clean controls.
const TARGETS = [
  "Applied AI Architect",
  "Copy Lead, Claude",
  "Corporate Communication Lead",
  "AV Production Specialist",
  "Amazon GTM Partnership",
  "Applied AI Security Architect",
  "Account Executive",
  "AI Compliance Officer",
  "Applied AI Engineer",
  "Commercial Counsel",
];

// Headings that introduce ROLE-SPECIFIC content (not company blurbs).
const ROLE_HEADINGS = [
  "about the role", "the role", "role overview", "about this role",
  "responsibilities", "key responsibilities", "what you'll do", "what you will do",
  "what you’ll do", "what you'll be doing", "what you’ll be doing", "in this role",
  "your impact", "you will", "what you'll own", "position summary",
  "about the team", "what we're looking for", "what we’re looking for",
];
// Headings that mark the start of trailing boilerplate.
const STOP_HEADINGS = [
  "benefits", "compensation", "annual salary", "salary range", "pay range",
  "equal opportunity", "equal employment opportunity", "eeo", "accommodations",
  "privacy", "how to apply", "e-verify", "visa sponsorship", "background check",
];
// Company-blurb openings that are NOT role content.
const COMPANY_BLURB = ["about anthropic", "about openai", "about us", "our mission", "about stripe", "about vercel", "about the company"];

function findFirst(text, phrases) {
  let best = { idx: -1, phrase: null };
  for (const p of phrases) {
    const i = text.indexOf(p);
    if (i !== -1 && (best.idx === -1 || i < best.idx)) best = { idx: i, phrase: p };
  }
  return best;
}

function analyze(job) {
  const desc = String(job.description || "");
  const lower = desc.toLowerCase();
  const len = desc.length;

  const role = findFirst(lower, ROLE_HEADINGS);
  const stop = findFirst(lower, STOP_HEADINGS);
  const blurb = findFirst(lower, COMPANY_BLURB);

  const roleText = role.idx !== -1
    ? desc.slice(role.idx, stop.idx > role.idx ? stop.idx : undefined)
    : desc;

  return {
    len,
    roleIdx: role.idx,
    roleHeading: role.phrase,
    stopIdx: stop.idx,
    blurbFirst: blurb.idx !== -1 && (role.idx === -1 || blurb.idx < role.idx),
    atCap: len >= 6000,
    // Truncated before responsibilities: hit the cap and no role heading found.
    truncatedBeforeRole: len >= 6000 && role.idx === -1,
    // Would the OLD 800-char limit have cut the role section off?
    hiddenByOldLimit: role.idx === -1 ? null : role.idx >= 800,
    roleText: roleText.replace(/\n+/g, " ").trim(),
  };
}

async function fetchByTitle(fragment) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company_name, description")
    .ilike("title", `%${fragment}%`)
    .eq("is_open", true)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data || [])[0] || null;
}

async function fetchSampleForStats(limit = 900) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company_name, description")
    .eq("is_open", true)
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

async function main() {
  console.log("EarlyAIJobs — per-job evidence diagnostics (read-only)\n");
  console.log("=".repeat(78));
  console.log("PART 1 — NAMED JOBS (Test #1 problem cases + controls)");
  console.log("=".repeat(78));

  for (const fragment of TARGETS) {
    const job = await fetchByTitle(fragment);
    if (!job) { console.log(`\n### "${fragment}" — no matching open job found`); continue; }
    const a = analyze(job);
    console.log(`\n### ${job.title}  —  ${job.company_name}`);
    console.log(`  stored description length : ${a.len} chars${a.atCap ? "   [AT 6000 CAP]" : ""}`);
    console.log(`  role section found        : ${a.roleIdx !== -1 ? "YES" : "NO"}`);
    console.log(`  heading detected          : ${a.roleHeading || "—"}`);
    console.log(`  role section begins at    : ${a.roleIdx !== -1 ? `char ${a.roleIdx}` : "n/a"}`);
    console.log(`  company boilerplate first : ${a.blurbFirst ? "YES" : "no"}`);
    console.log(`  trailing boilerplate at   : ${a.stopIdx !== -1 ? `char ${a.stopIdx}` : "not found"}`);
    console.log(`  truncated before role     : ${a.truncatedBeforeRole ? "YES" : "no"}`);
    console.log(`  HIDDEN BY OLD 800 LIMIT   : ${a.hiddenByOldLimit === null ? "n/a" : a.hiddenByOldLimit ? "YES — role section started after char 800" : "no — role section started before char 800"}`);
    console.log(`  --- role text that would be classified (first 300 chars) ---`);
    console.log(`  ${a.roleText.slice(0, 300)}`);
  }

  console.log(`\n\n${"=".repeat(78)}`);
  console.log("PART 2 — AGGREGATE STATISTICS");
  console.log("=".repeat(78));

  const jobs = await fetchSampleForStats();
  const buckets = { "<800": 0, "800-2000": 0, "2000-4000": 0, "4000-6000": 0, "at 6000 cap": 0 };
  let roleFound = 0, roleAfter800 = 0, truncBeforeRole = 0, blurbFirst = 0;
  const roleIdxs = [];

  for (const job of jobs) {
    const a = analyze(job);
    if (a.len >= 6000) buckets["at 6000 cap"]++;
    else if (a.len >= 4000) buckets["4000-6000"]++;
    else if (a.len >= 2000) buckets["2000-4000"]++;
    else if (a.len >= 800) buckets["800-2000"]++;
    else buckets["<800"]++;

    if (a.roleIdx !== -1) {
      roleFound++;
      roleIdxs.push(a.roleIdx);
      if (a.roleIdx >= 800) roleAfter800++;
    }
    if (a.truncatedBeforeRole) truncBeforeRole++;
    if (a.blurbFirst) blurbFirst++;
  }

  const n = jobs.length;
  const pct = (x) => `${Math.round((x / n) * 100)}%`;
  const sorted = roleIdxs.sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

  console.log(`\nJobs analysed: ${n}\n`);
  console.log(`Length distribution:`);
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(14)} ${String(v).padStart(5)}  (${pct(v)})`);

  console.log(`\nRole section:`);
  console.log(`  role heading found          : ${roleFound} (${pct(roleFound)})`);
  console.log(`  company blurb appears first : ${blurbFirst} (${pct(blurbFirst)})`);
  console.log(`  median role-section start   : char ${median}`);
  console.log(`  ROLE SECTION BEGINS AFTER CHAR 800 : ${roleAfter800} (${pct(roleAfter800)})   <<< KEY METRIC`);
  console.log(`  hit 6000 cap with NO role heading  : ${truncBeforeRole} (${pct(truncBeforeRole)})`);

  console.log(`\nNOTE ON THE KEY METRIC:`);
  console.log(`  "Begins after char 800" understates the damage. Even when the heading`);
  console.log(`  appeared before 800, the old limit stored only the first few hundred`);
  console.log(`  characters of role text — the responsibilities that follow were cut.`);
  console.log(`  Compare median role-section start against the old 800 ceiling.`);
}

main().catch(err => {
  console.error(`\nSTOPPED: ${err.message || err}`);
  process.exit(1);
});
