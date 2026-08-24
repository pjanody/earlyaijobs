// classify-simple.js — EarlyAIJobs launch classifier.
//
// ONE JOB: assign a top-level category. Nothing else.
// No LLM. No confidence scores. No review queues. No specialization.
// No seniority. Every job is publishable regardless of category.
//
// PRIORITY
//   1. strong title rules
//   2. description rules, only when the title says nothing
//   3. "other"
//
// USAGE
//   node --env-file=.env classify-simple.js 100          (dry run, prints)
//   node --env-file=.env classify-simple.js 500          (dry run)
//   node --env-file=.env classify-simple.js --all --write (classify everything)

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CLASSIFIER_VERSION = "simple-1.1";

// Approved AI companies. Every open job from these companies is listed on the
// website; the classifier only assigns a category.
//
// THIS LIST MUST MATCH lib/db.js. It didn't on 2026-08-23: the site had grown
// to 16 companies but this file still said 6, so `--approved` silently skipped
// 1,630 jobs and they stayed uncategorised even after a full --write run. The
// assertion below now makes that drift impossible to miss.
const APPROVED_COMPANIES = [
  "openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit",
  "cohere", "perplexity", "cursor", "cognition", "mistral",
  "figureai", "coreweave", "togetherai", "sierra", "harvey",
];

// Drift guard. lib/db.js is an ES module and this script is CommonJS, so we
// can't require() it — instead we read the source and compare the two lists.
// Cheap, deterministic, and it fails loudly BEFORE anything is written.
(function assertCompanyListsMatch() {
  const fs = require("fs");
  const path = require("path");
  let src;
  try {
    src = fs.readFileSync(path.join(__dirname, "lib", "db.js"), "utf8");
  } catch {
    return; // db.js unreadable (e.g. running outside the repo) — don't block.
  }
  const m = src.match(/export const APPROVED_COMPANIES\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return;
  const site = (m[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ""));
  const mine = [...APPROVED_COMPANIES].sort().join(",");
  if (site.length && site.slice().sort().join(",") !== mine) {
    console.error("STOPPED: company list drift between classify-simple.js and lib/db.js");
    console.error(`  lib/db.js         (${site.length}): ${site.join(", ")}`);
    console.error(`  classify-simple.js (${APPROVED_COMPANIES.length}): ${APPROVED_COMPANIES.join(", ")}`);
    console.error("  Fix the lists so they match, then re-run. Nothing was written.");
    process.exit(1);
  }
})();

const CATEGORIES = [
  "engineering", "research", "data", "product", "design", "infrastructure",
  "security", "solutions", "sales", "marketing", "customer-success",
  "operations", "legal-compliance", "policy", "people", "finance",
  "education", "manufacturing", "other",
];

// Title rules. Longest/most specific phrases win — the list is scored by
// match length, so "machine learning engineer" beats "engineer".
const TITLE_RULES = {
  research: [
    "research scientist", "research engineer", "research manager", "research lead",
    "applied scientist", "researcher", "research fellow", "member of technical staff",
    "interpretability", "alignment", "ai safety", "safeguards research",
    // Explicit research leadership and OpenAI's internal abbreviations.
    "vp, research", "vp research", "head of research", "director of research",
    "re/rs", "re / rs", "post-training", "post training",
  ],
  engineering: [
    "software engineer", "software developer", "machine learning engineer", "ml engineer",
    "ai engineer", "backend engineer", "frontend engineer", "full stack engineer",
    "full-stack engineer", "mobile engineer", "ios engineer", "android engineer",
    "robotics engineer", "engineering manager", "developer", "swe", "engineer",
  ],
  infrastructure: [
    "infrastructure engineer", "platform engineer", "site reliability", "sre",
    "cloud engineer", "systems engineer", "data center", "datacenter", "gpu",
    "compute", "inference", "hardware", "network engineer", "devops",
    // Specific technical-infrastructure phrases only. The bare word
    // "infrastructure" is deliberately NOT a rule — "Infrastructure Financing"
    // and "Infrastructure Tax Lead" are finance roles, not technical ones.
    "evals infrastructure", "evaluation infrastructure", "training infrastructure",
    "ml infrastructure", "ai infrastructure", "serving infrastructure",
    // Corporate IT / internal business systems. Harvey posts several of these
    // ("Sr. Workday Integrations Analyst"). NOT included: a bare "director, it"
    // rule — matching is plain substring, so it would also fire on "Director,
    // Italy". Those two Harvey postings stay in Other rather than risk that.
    "workday", "information technology", "it operations", "corporate it",
    "enterprise applications", "corporate engineering", "servicenow",
  ],
  data: [
    "data scientist", "data engineer", "data analyst", "analytics engineer",
    "business intelligence", "analytics", "data science", "machine learning data",
    // Perplexity names roles "Member of X Staff (specialism)". The
    // parenthetical varies, so the family was splitting — "(Data Scientist)"
    // matched, "(AI Builder)" fell through to Other.
    "member of data staff",
  ],
  product: [
    "product manager", "product management", "product operations", "product ops",
    "head of product", "product lead", "technical product manager",
  ],
  design: [
    "product designer", "ux designer", "ux researcher", "visual designer",
    "brand designer", "design lead", "art director", "designer", "design",
    // Same Perplexity pattern: "Member of Creative Studio (Producer…)" went to
    // Other while "(Web Designer…)" went to Marketing. One family, one home.
    "member of creative studio",
  ],
  security: [
    "security engineer", "security analyst", "security architect", "cybersecurity",
    "trust and safety", "trust & safety", "application security", "appsec",
    "information security", "security", "detection engineer",
    // "Incident Manager - Detection & Response" had no title rule, fell to
    // description matching, and the same role got two different categories
    // in two cities. Title rules are deterministic; descriptions vary.
    "incident manager", "incident response", "detection & response",
    "detection and response",
    // Trust & safety enforcement roles (10 in the 500 sample).
    "safeguards enforcement", "enforcement analyst", "threat investigator",
  ],
  solutions: [
    "solutions architect", "solution architect", "applied ai architect", "ai architect",
    "solutions engineer", "solution engineer", "forward deployed", "technical consultant",
    "implementation consultant", "solutions consultant", "applied ai engineer",
    // "Forward Deployed Software Engineer" lost to "software engineer" (16
    // chars vs 15) and landed in Engineering, while "Sr. Forward Deployed
    // Engineer" correctly landed in Solutions — the same job family split
    // across two categories. Longer explicit phrases keep the family together.
    "forward deployed software engineer", "forward deployed engineer",
    "forward deployed security engineer", "forward deployed product designer",
    "forward deployed product manager", "forward deployed data scientist",
    "forward deployed architect", "forward deployed",
    "technical account", "professional services",
    // Customer-facing deployment/consulting roles (4 in the 500 sample).
    "deployment strategist", "delivery consultant", "engagement manager",
    // AI advisory/consulting practice roles (4 in the mixed sample, ScaleAI).
    "advisory consultant", "advisory principal", "strategy consultant",
    "ai advisory", "advisory lead",
    // Customer deployment + technical-solutions titles from the production run.
    "deployment manager", "deployment lead", "technical solutions",
    "tech solutions", "solutions architect", "customer advisor",
    "adoption architect", "partner delivery",
    // Non-English: Japanese "solutions architect" (Databricks JP postings).
    "ソリューションアーキテクト",
    // Sierra calls its forward-deployed role "Strategist, Agent Development"
    // — 18 postings, all identical apart from the language they serve in.
    // Matched on the full comma form only; a bare "agent development" rule
    // would wrongly claim research and engineering roles elsewhere.
    "strategist, agent development", "agent development strategist",
    // Harvey's Practice Leads are legal domain experts who advise customers on
    // deploying Harvey — customer-facing delivery, not in-house legal work.
    "practice lead",
    // ---- Forward-deployed collisions, round 3 (2026-08-23) ----
    // Every one of these lost to a LONGER engineering phrase in the same
    // title, splitting one job family across two categories:
    //   "…Machine Learning Engineer"   (25) beat "forward deployed" (16)
    //   "…Infrastructure Engineer"     (23) beat "forward deployed" (16)
    //   "…Software Engineer"           (17) beat "forward deployed" (16)
    //   "Member of Technical Staff"    (25) tied and won on list order
    // The fix is always the same: spell out the full phrase so it is longest.
    "forward deployed machine learning engineer",
    "forward deployed infrastructure engineer",
    "forward deployed ml engineer",
    "forward deployed full-stack engineer", "forward deployed full stack engineer",
    // Scale AI parenthesises it: "Senior Full-Stack Software Engineer,
    // (Forward Deployed), GPS". The brackets make this 18 chars, beating
    // "software engineer" at 17.
    "(forward deployed)",
    "member of technical staff (forward deployed",
    "product management, forward deployed",
  ],
  sales: [
    "account executive", "sales development", "business development", "sales engineer",
    "account manager", "partnerships", "partner manager", "sales manager",
    "sales lead", "deal desk", "revenue operations", "sales", "gtm", "commercial lead",
    // Alliance/channel roles (2 in the 500 sample).
    "alliance rvp", "alliances", "alliance manager", "strategic accounts", "renewals",
    // Enablement = GTM training function, not education. Longest-match makes
    // these beat any shorter education phrase.
    // Marketplace / partner-ecosystem roles landed in Other because no rule
    // claimed them. In this taxonomy partnerships live under Sales (GTM), so
    // that is where an ecosystem owner belongs — not the exception bucket.
    "marketplace", "partner programs", "partner program", "partner ecosystem", "partnerships",
    "partner development", "channel partner", "alliances",
    "sales enablement", "gtm enablement", "partner enablement",
    "field enablement", "revenue enablement", "scale enablement",
    "enablement lead", "enablement manager",
    // OpenAI/Databricks sales titles found in the production run.
    "account director", "sdr", "specialist seller", "agency partner",
    "partner director", "seller",
  ],
  marketing: [
    "product marketing", "growth marketing", "developer advocate", "developer relations",
    "developer evangelist", "technical evangelist", "content marketing", "communication",
    // "Social Marketing Manager, Developers" tied 9-char "marketing" against
    // 9-char "developer" and lost on iteration order (engineering is listed
    // first). Longer phrases break the tie deterministically.
    "marketing manager", "social marketing", "marketing lead", "marketing director",
    "head of marketing", "field marketer", "events lead",
    // "Marketing Operations" was landing in Operations.
    "marketing operations", "enterprise marketing", "product marketing manager",
    "brand marketing", "marketing", "copywriter", "copy lead", "editor", "social media",
    "events", "community manager",
    // Growth/field marketing titles found in the production run.
    "field marketer", "growth generalist", "growth manager", "growth lead",
    "lifecycle lead", "analyst relations", "brand protection",
    // "Event Marketer" (Sierra) missed both "events" and "field marketer".
    "event marketer", "competitive intelligence",
  ],
  "customer-success": [
    "customer success", "customer experience", "technical account manager",
    "customer support", "support engineer", "customer education", "onboarding specialist",
    // Product/user support roles (2 in the 500 sample).
    "product support", "support specialist", "support manager",
    "customer enablement", "customer education", "customer learning",
  ],
  operations: [
    "program manager", "project manager", "business operations", "strategy and operations",
    "strategy & operations", "chief of staff", "procurement", "workplace",
    "facilities", "operations manager", "operations specialist", "executive assistant",
    "administrative", "business systems", "operations", "production specialist",
    // Country/business general management — operations unless a stronger
    // functional phrase in the same title wins by length.
    "general manager", "production manager", "inventory manager",
    "supply chain", "strategic sourcing", "vendor manager", "crisis management",
    // Harvey's business-strategy IC role; "strategy and operations" already
    // covers the manager-level version.
    "strategy associate",
  ],
  // Physical production and field-service work. Added 2026-08-23 when Figure AI
  // arrived: it builds humanoid robots, so it posts factory-floor and field
  // roles no software company has. Folding these into Operations would mean a
  // job seeker filtering for program-manager work gets CNC Machinist results.
  //
  // The boundary: this category is for making, servicing, or physically
  // operating hardware. Robotics ENGINEERING (designing the robot) stays in
  // Engineering — "robotics engineer" is a longer, more specific phrase and
  // wins the tie automatically.
  manufacturing: [
    // Assembly and machining.
    //
    // NOTE: the bare word "manufacturing" is deliberately NOT a rule. Tested
    // against all 4,251 live titles it produced two false positives:
    //   "Secure Manufacturing & Stealth Investigator" (OpenAI) — a security
    //   investigations role, and "Manufacturing Test Engineer" — a degreed
    //   engineering role that belongs in Engineering. Specific phrases only.
    "manufacturing technician", "manufacturing associate", "manufacturing operator",
    "manufacturing supervisor", "remanufacturing",
    "machinist", "fabricator", "fabrication", "assembler",
    "production associate", "production technician", "production operator",
    "staging specialist", "test technician", "quality technician",

    // Robot operation and field service — Figure's largest cluster
    "humanoid robot", "robot operator", "robot pilot", "robot technician",
    "robot service technician", "service technician", "field service",
    "maintenance technician", "equipment technician",

    // Data creators: people who physically operate robots to generate
    // training data. Closer to the factory floor than to the Data category,
    // which is analytics and data engineering.
    "data creator", "data creators",

    // Hardware supply and production planning. Deliberately NOT the bare
    // phrase "supply manager" — only the explicit Figure title — so a
    // generic procurement role elsewhere still lands in Operations.
    "global supply manager", "material planning", "demand planner",
    "logistics", "dispatch coordinator",

    // Physical deployment sites where robots run at a customer location.
    // NOT a bare "site lead" rule: it outscored "engineer" (9 vs 8) and pulled
    // Perplexity's "Engineering Site Lead" out of Engineering. Figure names
    // these sites explicitly, so match on that instead.
    "commercial site team", "commercial launch team",
  ],
  "legal-compliance": [
    "counsel", "attorney", "lawyer", "paralegal", "legal", "compliance",
    "privacy", "contracts manager", "governance", "regulatory",
    // "Safety & Security Counsel" went to Security because "security" (8)
    // outscored "counsel" (7). A counsel role is legal regardless of its
    // subject matter — longer phrases make that explicit.
    "security counsel", "product counsel", "commercial counsel",
    "corporate counsel", "general counsel", "legal counsel", "privacy counsel",
    "employment counsel", "regulatory counsel", "litigation",
    // Harvey's "Legal Engineer" family (27 postings). These are qualified
    // lawyers who configure Harvey for law firms, not software engineers —
    // but "engineer" (8) was claiming all of them for Engineering. Patrick's
    // call, 2026-08-23: they are legal roles.
    // "legal engineering manager" is spelled out because "engineering manager"
    // (19) would otherwise beat "legal engineering" (17).
    "legal engineer", "legal engineering", "legal engineering manager",
    // A counsel is a legal role whatever its subject matter, but plain
    // "counsel" (7) loses to longer domain phrases. Each collision has to be
    // named explicitly — substring matching gives us no way to say "the word
    // counsel always wins". Add to this list whenever the audit finds one.
    "counsel, global supply chain", "counsel, capital markets",
    "counsel, supply chain", "counsel, real estate", "counsel, procurement",
  ],
  policy: [
    "policy", "government affairs", "public affairs", "government relations",
    "economist", "public sector policy",
    // "Policy Design Manager" tied 6-char "policy" against 6-char "design"
    // and lost on list order. Longer phrases settle it: a policy-design role
    // is a policy role, not a designer.
    "policy design", "policy manager", "policy lead", "policy planning",
    "policy analyst", "policy research",
    // Policy roles that lost to a longer word from another category:
    //   "Policy Communications Manager" → communication (marketing)
    //   "National Security Policy, Senior Manager" → security
    "policy communications", "national security policy", "security policy",
    "policy & partnerships", "policy and partnerships", "public policy",
  ],
  people: [
    "recruiter", "recruiting", "talent acquisition", "people operations",
    "people partner", "human resources", "hr ", "employee relations", "talent",
    "compensation and benefits", "payroll", "sourcer", "technical sourcer",
    "equity administration", "equity admin", "hrbp",
    // "People Lead" and "People Business Partner" were not matched by the
    // existing "people operations" / "people partner" phrases.
    "people lead", "people business partner", "people systems",
    // Harvey's benefits cluster: "Global Benefits and Leaves Analyst" matched
    // nothing, because the only benefits phrase was "compensation and benefits".
    "benefits and leaves", "benefits analyst", "global benefits",
    // Qualified forms only: a bare "employee experience" rule (19 chars) beat
    // "product manager" (15) and dragged Databricks' and CoreWeave's
    // "Sr Product Manager, Employee Experience" out of Product.
    "employee experience specialist", "employee experience partner",
    "employee experience lead", "employee experience manager",
    // Recruiting operations kept landing in Operations, because
    // "operations manager" (18) and "program manager" (15) are longer than
    // "recruiting" (10). Recruiting is a People function whatever the
    // surrounding noun says.
    "recruiting operations", "recruiting program", "recruiting technology",
    "recruiting coordination", "university recruiting", "campus recruiting",
    "recruiting solutions", "people research scientist",
  ],
  finance: [
    "chief financial officer", "cfo", "accountant", "accounting", "controller",
    "fp&a", "financial planning", "treasury", "tax", "investor relations",
    "finance", "audit", "revenue accounting",
    // Finance phrases that contain words belonging to other categories.
    // Longest-match resolves these: "infrastructure financing" beats any
    // shorter infrastructure phrase, "order-to-cash" beats nothing else.
    "capital markets", "infrastructure financing", "financing",
    "order-to-cash", "order to cash", "procure-to-pay", "quote-to-cash",
    // Finance-process titles that must not resolve elsewhere.
    "accounts receivable", "accounts payable", "collections", "credit risk",
    "cash application", "technical accounting", "revenue recognition",
    // Finance titles that were losing to a longer word from another category:
    //   "Tax Director, Provision & Compliance" → compliance (legal)
    //   "Director, Infrastructure Supply Chain Accounting" → supply chain (ops)
    //   "Payroll Tax Manager" → payroll (people)
    "tax director", "tax manager", "tax provision", "payroll tax",
    "supply chain accounting", "revenue accounting", "accounting manager",
    "consolidations", "financial risk", "pricing strategist", "travel & expense",
    // CoreWeave runs a large "Operations Accounting" team. The word
    // "operations" (10) and "data center" (11) were beating "accounting" (10)
    // and scattering accountants across Operations and Infrastructure.
    "operations accounting", "accounting enablement", "finance systems engineer",
  ],
  education: [
    // NOTE: the bare word "enablement" used to live here and dragged every
    // Sales/GTM/Partner Enablement role into Education (longest-match beat
    // "sales"). In tech, enablement is a go-to-market function. Education
    // now requires genuinely educational phrases.
    "curriculum", "instructional designer", "learning and development",
    "education lead", "training lead", "educator", "teacher",
    // "Education Program Manager" was losing to "program manager" (operations).
    "education program", "education manager",
    "learning designer", "training program", "academy",
    // Harvey runs a law-school programme (Harvey for students). Both the
    // manager and the campus ambassador belong to the same family.
    "law school", "student ambassador",
  ],
};

// Description rules — consulted ONLY when the title matched nothing.
// Deliberately short: descriptions are noisy, titles are not.
const DESCRIPTION_RULES = {
  engineering: ["software engineering team", "write production code", "build and ship features"],
  data: ["build data pipelines", "data warehouse", "sql and python", "dashboards and reporting"],
  sales: ["close deals", "sales pipeline", "quota", "prospecting", "book of business"],
  marketing: ["marketing campaigns", "brand strategy", "content calendar", "demand generation"],
  people: ["full-cycle recruiting", "candidate experience", "hiring managers"],
  finance: ["financial statements", "month-end close", "budgeting and forecasting"],
  "legal-compliance": ["contract negotiation", "legal advice", "regulatory requirements"],
  operations: ["cross-functional programs", "operational processes", "project plans"],
  security: ["security incidents", "vulnerability management", "threat detection"],
  solutions: ["customer implementations", "technical pre-sales", "solution design for customers"],
  "customer-success": ["customer onboarding", "account health", "renewals and retention"],
  design: ["design systems", "user flows", "wireframes and prototypes"],
  product: ["product roadmap", "product requirements", "work with engineering and design"],
  infrastructure: ["kubernetes", "cloud infrastructure", "distributed systems at scale"],
  policy: ["policy recommendations", "regulatory landscape", "government stakeholders"],
  education: ["curriculum development", "training materials", "learner outcomes"],
};

// RESEARCH GATE: role-level evidence required. Company boilerplate such as
// "AI research company" or "work with researchers" must never trigger it.
const RESEARCH_ACTION_PHRASES = [
  "conduct research", "conducting research", "original research", "publish papers",
  "publish research", "design experiments", "novel algorithms", "develop novel methods",
  "advance the state of the art", "advance state of the art", "research agenda",
  "train models", "model training experiments", "research questions", "empirical research",
];

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function matchTitle(title) {
  const t = norm(title);
  let best = null;
  for (const [category, phrases] of Object.entries(TITLE_RULES)) {
    for (const phrase of phrases) {
      if (t.includes(phrase)) {
        // Longest match wins: "machine learning engineer" over "engineer".
        if (!best || phrase.length > best.phrase.length) best = { category, phrase };
      }
    }
  }
  return best;
}

function matchDescription(description) {
  const d = norm(description);
  if (!d) return null;
  let best = null;
  for (const [category, phrases] of Object.entries(DESCRIPTION_RULES)) {
    for (const phrase of phrases) {
      if (d.includes(phrase)) {
        if (!best || phrase.length > best.phrase.length) best = { category, phrase };
      }
    }
  }
  return best;
}

function hasResearchEvidence(title, description) {
  const t = norm(title);
  if (TITLE_RULES.research.some(p => t.includes(p))) return true;
  const d = norm(description);
  return RESEARCH_ACTION_PHRASES.some(p => d.includes(p));
}

function classify(job) {
  const titleHit = matchTitle(job.title);
  if (titleHit) {
    // Research needs role-level evidence, not a title coincidence.
    if (titleHit.category === "research" && !hasResearchEvidence(job.title, job.description)) {
      const alt = matchDescription(job.description);
      return { category: alt ? alt.category : "other", source: "title-research-gated" };
    }
    return { category: titleHit.category, source: `title:${titleHit.phrase}` };
  }

  const descHit = matchDescription(job.description);
  if (descHit) {
    if (descHit.category === "research" && !hasResearchEvidence(job.title, job.description)) {
      return { category: "other", source: "description-research-gated" };
    }
    return { category: descHit.category, source: `description:${descHit.phrase}` };
  }

  return { category: "other", source: "no-match" };
}

// Report open-job counts for the approved companies only.
async function reportCounts() {
  console.log(`Open jobs by approved AI company:\n`);
  let total = 0;
  for (const slug of APPROVED_COMPANIES) {
    const { count, error } = await supabase
      .from("jobs").select("id", { count: "exact", head: true })
      .eq("company_name", slug).eq("is_open", true);
    if (error) throw new Error(`${slug}: ${error.message}`);
    console.log(`  ${slug.padEnd(13)} ${String(count).padStart(5)}`);
    total += count || 0;
  }
  console.log(`  ${"TOTAL".padEnd(13)} ${String(total).padStart(5)}   <<< production dataset size`);
}

// Stratified sample: N jobs from each named company. Guarantees coverage of
// smaller employers that id-ordered paging would never reach.
async function stratified(companies, perCompany, counts, otherTitles) {
  let processed = 0;
  for (const slug of companies) {
    const { data: jobs, error } = await supabase
      .from("jobs").select("id, title, company_name, description")
      .eq("company_name", slug).eq("is_open", true)
      .order("id", { ascending: true }).limit(perCompany);
    if (error) throw new Error(`${slug}: ${error.message}`);
    if (!jobs || !jobs.length) { console.log(`\n--- ${slug}: no open jobs ---`); continue; }
    console.log(`\n--- ${slug} (${jobs.length}) ---`);
    for (const job of jobs) {
      const { category } = classify(job);
      counts[category] = (counts[category] || 0) + 1;
      if (category === "other") otherTitles.push(`${String(job.company_name).padEnd(13)} | ${job.title}`);
      console.log(`${category.padEnd(17)} | ${String(job.company_name).padEnd(13)} | ${job.title}`);
      processed++;
    }
  }
  return processed;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const all = args.includes("--all");
  const approvedOnly = args.includes("--approved");
  // --only-new: classify just the jobs that have never been categorised.
  // Scheduled runs use this — re-labelling 2,493 unchanged rows every cycle
  // wastes minutes and money. A full re-run stays available for rule changes.
  const onlyNew = args.includes("--only-new");
  const perCompanyArg = args.includes("--per-company")
    ? Number(args[args.indexOf("--per-company") + 1]) : null;
  const companiesArg = args.includes("--companies")
    ? args[args.indexOf("--companies") + 1].split(",").map(s => s.trim())
    : null;
  const limit = all ? Infinity : Number(args.find(a => /^\d+$/.test(a)) || 100);

  if (args.includes("--counts")) return reportCounts();

  // Stratified mode short-circuits the normal paging loop.
  if (perCompanyArg) {
    const companies = companiesArg || APPROVED_COMPANIES;
    console.log(`EarlyAIJobs classifier ${CLASSIFIER_VERSION}`);
    console.log(`Mode: STRATIFIED DRY RUN | ${perCompanyArg} jobs each from: ${companies.join(", ")}\n`);
    const counts = {}, otherTitles = [];
    const processed = await stratified(companies, perCompanyArg, counts, otherTitles);
    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs classified: ${processed} (dry run)\n`);
    for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(17)} ${String(n).padStart(5)}  ${((n / processed) * 100).toFixed(1)}%`);
    }
    const oc = counts.other || 0;
    console.log(`\n"other": ${oc} jobs (${((oc / processed) * 100).toFixed(1)}%)`);
    if (otherTitles.length) {
      console.log(`\nAll titles classified as "other":`);
      for (const t of otherTitles) console.log(`  ${t}`);
    }
    return;
  }

  console.log(`EarlyAIJobs classifier ${CLASSIFIER_VERSION}`);
  console.log(`Mode: ${write ? "WRITE" : "DRY RUN (no database changes)"} | Limit: ${all ? "ALL" : limit}` +
    ` | Companies: ${approvedOnly ? "approved AI companies only" : "all in database"}\n`);

  const counts = {};
  const otherTitles = [];
  // Transition tracking: what would this run CHANGE? In dry-run mode this is
  // the pre-write diff report; in write mode it documents what was done.
  const transitions = {};          // "old → new" -> count
  const changedSamples = [];       // up to 30 example rows
  let unchanged = 0, changed = 0;
  let processed = 0, afterId = 0;

  while (processed < limit) {
    const pageSize = Math.min(500, limit === Infinity ? 500 : limit - processed);
    let q = supabase
      .from("jobs")
      .select("id, title, company_name, description, category")
      .eq("is_open", true)
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (approvedOnly) q = q.in("company_name", APPROVED_COMPANIES);
    if (onlyNew) q = q.is("category", null);
    const { data: jobs, error } = await q;
    if (error) throw new Error(error.message);
    if (!jobs || !jobs.length) break;

    for (const job of jobs) {
      const { category, source } = classify(job);
      counts[category] = (counts[category] || 0) + 1;
      if (category === "other") otherTitles.push(`${String(job.company_name).padEnd(13)} | ${job.title}`);

      const oldCat = job.category || "(none)";
      if (oldCat === category) {
        unchanged++;
      } else {
        changed++;
        const key = `${oldCat} → ${category}`;
        transitions[key] = (transitions[key] || 0) + 1;
        if (changedSamples.length < 30) {
          changedSamples.push(`  ${key.padEnd(36)} [${job.id}] ${String(job.company_name).padEnd(11)} ${String(job.title).slice(0, 52)}`);
        }
      }
      console.log(`${category.padEnd(17)} | ${String(job.company_name).padEnd(13)} | ${job.title}`);

      if (write) {
        // Launch payload is deliberately boring: only columns that already
        // exist in the jobs table. `source` is printed for humans but not
        // stored — no new schema needed to ship.
        const { error: upErr } = await supabase.from("jobs").update({
          category,
          classified_at: new Date().toISOString(),
        }).eq("id", job.id);
        if (upErr) throw new Error(`write ${job.id}: ${upErr.message}`);
      }
      processed++;
      afterId = job.id;
      if (processed >= limit) break;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Jobs classified: ${processed}${write ? " (written)" : " (dry run)"}\n`);

  // The pre-write safety report: exactly what this run changes vs the
  // categories currently in the database. Inspect BEFORE running --write.
  console.log(`=== TRANSITION REPORT (vs current database values) ===`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Changed:   ${changed}${write ? "  (these WERE written)" : "  (these WOULD be written)"}`);
  if (changed > 0) {
    console.log(`\nCategory transitions:`);
    for (const [key, n] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${key}`);
    }
    console.log(`\nSample changed jobs (up to 30):`);
    for (const line of changedSamples) console.log(line);
  }
  console.log("");
  for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const pct = ((n / processed) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(17)} ${String(n).padStart(5)}  ${pct}%`);
  }
  const otherCount = counts.other || 0;
  const otherPct = ((otherCount / processed) * 100).toFixed(1);
  console.log(`\n"other": ${otherCount} jobs (${otherPct}%)`);
  if (otherTitles.length) {
    console.log(`\nAll titles classified as "other":`);
    for (const t of otherTitles) console.log(`  ${t}`);
  }
}

main().catch(err => {
  console.error(`\nSTOPPED: ${err.message || err}`);
  process.exit(1);
});
