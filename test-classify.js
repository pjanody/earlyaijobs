// test-classify.js — deterministic regression suite for the title classifier.
// Run: node test-classify.js      (no database, no network, no AI)
//
// Extracts TITLE_RULES from classify-simple.js and replays matchTitle's exact
// longest-phrase-wins logic. Every case here was a real production bug or a
// review finding — if a future rule change breaks one, this fails.

const fs = require("fs");

const src = fs.readFileSync(require.resolve("./classify-simple.js"), "utf8");
const m = src.match(/const TITLE_RULES = (\{[\s\S]*?\n\});/);
if (!m) { console.error("Could not locate TITLE_RULES in classify-simple.js"); process.exit(1); }
const TITLE_RULES = eval(`(${m[1]})`);

function matchTitle(title) {
  const t = String(title).toLowerCase().replace(/\s+/g, " ").trim();
  let best = null;
  for (const [category, phrases] of Object.entries(TITLE_RULES)) {
    for (const phrase of phrases) {
      if (t.includes(phrase) && (!best || phrase.length > best.phrase.length)) {
        best = { category, phrase };
      }
    }
  }
  return best;
}

const CASES = [
  // review-found bugs (2026-08-22) — must never regress
  ["Policy Design Manager, Conventional Weapons", "policy"],
  ["Safety & Security Counsel, EMEA", "legal-compliance"],
  ["Applied AI Architect - EDU", "solutions"],
  ["Social Marketing Manager, Developers", "marketing"],
  ["Incident Manager - Detection & Response", "security"],
  ["Head of Marketplace", "sales"],
  ["Partner Programs & Marketplace", "sales"],
  ["Forward Deployed Software Engineer - SF", "solutions"],
  ["Sr. Forward Deployed Engineer", "solutions"],
  ["Forward Deployed Security Engineer", "solutions"],
  ["Forward Deployed Product Designer", "solutions"],
  ["Tax Director, Provision & Compliance", "finance"],
  ["Director, Infrastructure Supply Chain Accounting", "finance"],
  ["Payroll Tax Manager", "finance"],
  ["Policy Communications Manager", "policy"],
  ["National Security Policy, Senior Manager", "policy"],
  ["Marketing Operations", "marketing"],
  ["Head of GTM Enablement - Global Lead", "sales"],
  ["Accounting, Revenue Internal Controls", "finance"],

  // guardrails — correct classifications that tie-break fixes must not steal
  ["Software Engineer, Backend", "engineering"],
  ["Machine Learning Engineer", "engineering"],
  ["Design Engineer", "engineering"],
  ["Product Designer", "design"],
  ["Security Engineer", "security"],
  ["Communications Manager", "marketing"],
  ["Compliance Manager", "legal-compliance"],
  ["Operations Manager", "operations"],
  ["Recruiter", "people"],
  ["Research Scientist", "research"],
  ["Account Executive, Mid-Market", "sales"],
  ["Solutions Architect", "solutions"],
  ["Solutions Engineer", "solutions"],
  ["Policy Fellow", "policy"],
  ["Education Program Manager", "education"],
  ["Program Manager, Data Centers", "operations"],
];

let pass = 0, fail = 0;
for (const [title, expected] of CASES) {
  const hit = matchTitle(title);
  const got = hit ? hit.category : "no-match";
  if (got === expected) {
    pass++;
    console.log(`PASS  ${title.slice(0, 48).padEnd(49)} → ${got}`);
  } else {
    fail++;
    console.log(`FAIL  ${title.slice(0, 48).padEnd(49)} → ${got} (expected ${expected}${hit ? ", matched \"" + hit.phrase + "\"" : ""})`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
