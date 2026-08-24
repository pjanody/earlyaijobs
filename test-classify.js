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

  // ---- 2026-08-23: the three clusters that were sitting in "other" ----
  // Figure AI factory floor → the new Manufacturing category.
  ["Humanoid Robot Operator (Night Shift)", "manufacturing"],
  ["Humanoid Robot Pilot", "manufacturing"],
  ["Robot Service Technician (Morning Shift)", "manufacturing"],
  ["Apprentice Robot Service Technician", "manufacturing"],
  ["CNC Machinist", "manufacturing"],
  ["Gear Machinist", "manufacturing"],
  ["Fabricator", "manufacturing"],
  ["Production Associate", "manufacturing"],
  ["Manufacturing Equipment Technician", "manufacturing"],
  ["Remanufacturing Technician (Swing Shift)", "manufacturing"],
  ["Staging Specialist", "manufacturing"],
  ["Field Service Technician - Commercial Site Team", "manufacturing"],
  ["Global Supply Manager, Battery", "manufacturing"],
  ["Global Supply Manager - PCBA", "manufacturing"],
  ["Material Planning Manager, Electronics", "manufacturing"],
  ["Demand Planner", "manufacturing"],
  ["Logistics & Dispatch Coordinator", "manufacturing"],
  ["Deployment Logistics Lead", "manufacturing"],
  ["Helix Data Creator", "manufacturing"],
  ["Technical Coordinator, Data Creators (SP)", "manufacturing"],
  ["Site Lead - Commercial Site Team", "manufacturing"],

  // THE BOUNDARY: designing robots is Engineering, not Manufacturing.
  // "robotics engineer" (17) must beat "robot technician" and friends.
  ["Robotics Engineer", "engineering"],
  ["Senior Robotics Engineer, Manipulation", "engineering"],
  // And a data-centre site role must stay Infrastructure, not Manufacturing.
  ["Site Lead, Data Center Operations", "infrastructure"],
  // These four are the false positives the 4,251-title sweep caught. An
  // engineering site lead and a manufacturing ENGINEER are engineers; a
  // security investigation that merely mentions manufacturing is neither.
  ["Engineering Site Lead", "engineering"],
  ["Manufacturing Test Engineer", "engineering"],
  ["Product Manufacturing Engineer - PCBA", "engineering"],
  ["Manufacturing Software Test Engineer", "engineering"],
  ["Secure Manufacturing & Stealth Investigator", "no-match"],

  // Sierra's forward-deployed role.
  ["Strategist, Agent Development", "solutions"],
  ["Strategist, Agent Development (Brazilian Portuguese speaking)", "solutions"],
  ["Strategist, Agent Development - Financial Services", "solutions"],
  ["Event Marketer", "marketing"],

  // Harvey's IT / HR / programme cluster.
  ["Sr. Workday Integrations Analyst", "infrastructure"],
  ["People Business Partner", "people"],
  ["Employee Experience Specialist", "people"],
  // …but a PM who builds employee-experience software is still Product.
  ["Sr Product Manager, Employee Experience", "product"],
  ["Global Benefits and Leaves Analyst, EMEA", "people"],
  ["People Lead (CDMX)", "people"],
  ["Practice Lead, Law Firm Transformation", "solutions"],
  ["Practice Lead, In-house Transformation", "solutions"],
  ["Partner Program Lead", "sales"],
  ["Competitive Intelligence Lead", "marketing"],
  ["Head of Customer Learning", "customer-success"],
  ["Law School Manager, International", "education"],
  ["Law School Student Ambassador", "education"],
  ["Strategy Associate", "operations"],

  // ---- 2026-08-23, round 2: the four clusters the audit surfaced ----
  // Harvey's Legal Engineers are lawyers, not software engineers.
  ["Legal Engineer", "legal-compliance"],
  ["Legal Engineer (In-House)", "legal-compliance"],
  ["Legal Engineering Manager (Law Firm, Corporate)", "legal-compliance"],
  ["Head of Legal Engineering, Product Specialists - EMEA", "legal-compliance"],
  ["Legal Engineering Program Manager", "legal-compliance"],
  ["Legal Engineer (Law Firm, Litigation/Regulatory)", "legal-compliance"],
  // …but an ordinary software engineer is untouched by that rule.
  ["Senior Software Engineer, Platform", "engineering"],

  // Forward-deployed roles must stay one family, whatever noun follows.
  ["Applied AI, Forward Deployed Machine Learning Engineer", "solutions"],
  ["Forward Deployed Infrastructure Engineer (Spanish speaking)", "solutions"],
  ["Senior Full-Stack Software Engineer, (Forward Deployed), GPS", "solutions"],
  ["Member of Technical Staff (Forward Deployed Engineer, Applied AI)", "solutions"],
  ["Director of Product Management, Forward Deployed & Strategic", "solutions"],

  // Recruiting is People, whatever the surrounding noun.
  ["Recruiting Operations Manager", "people"],
  ["Technical Program Manager, Recruiting Technology", "people"],
  ["Senior University Recruiting Program Manager", "people"],
  ["Senior Systems Analyst, Recruiting Operations", "people"],
  ["Recruiting Solutions Engineer", "people"],
  ["People Research Scientist, Recruiting", "people"],

  // Accountants are Finance, even inside a data centre.
  ["Manager, Data Center Operations Accounting", "finance"],
  ["Director, Operations Accounting - Supply Chain", "finance"],
  ["Operations Accounting - Inventory Manager", "finance"],
  ["Finance Systems Engineer, Tax", "finance"],

  // A counsel is legal whatever the domain word next to it.
  ["Counsel, Global Supply Chain", "legal-compliance"],
  ["Senior Counsel, Capital Markets", "legal-compliance"],

  // Perplexity's "Member of X Staff (specialism)" families stay together.
  ["Member of Data Staff (AI Builder)", "data"],
  ["Member of Data Staff (Analytics Engineer)", "data"],
  ["Member of Creative Studio (Producer, Brand & Creative)", "design"],
  ["Member of Creative Studio (Web Designer - Marketing & Landing Pages)", "design"],
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
