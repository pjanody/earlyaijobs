// classify-jobs.js — v7. Taxonomy v2.0 / prompt v2.0.
//
// PRODUCT: EarlyAIJobs lists jobs AT AI COMPANIES with powerful role filters.
// The classifier DESCRIBES the role. It does not judge "AI-ness".
// Removed in v7: is_ai, ai_role, ai_role_type, model confidence scores.
// (Those DB columns are left in place, simply no longer written.)
//
// Review is now reason-based: needs_review is only true when there is a
// concrete, observable problem, recorded in review_reasons.
//
// The provider is replaceable: everything after classifyWithProvider() —
// parsing, validation, QA, Supabase writes — is model-agnostic.

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ===== Provenance =====
const TAXONOMY_VERSION = "2.0";
const PROMPT_VERSION = "2.0";
const CLASSIFICATION_SOURCE = "external-ai";
const MODEL = "claude-haiku-4-5-20251001";

// ===== A. THE TAXONOMY — single source of truth for prompt AND validator =====
const TAXONOMY = {
  "engineering":      ["software-engineering","ai-engineering","machine-learning","mlops","backend","frontend","full-stack","robotics","other"],
  "research":         ["ai-research","llm-generative-ai","reinforcement-learning","ai-safety","interpretability","computer-vision","nlp","robotics","other"],
  "data":             ["data-science","data-engineering","analytics","ai-data","other"],
  "product":          ["product-management","ai-product","product-operations","other"],
  "design":           ["product-design","ai-design","ux-research","visual-design","other"],
  "infrastructure":   ["ai-infrastructure","compute-gpu","inference","platform","cloud","data-center","software-engineering","other"],
  "security":         ["ai-security","cybersecurity","application-security","platform-security","trust-safety","other"],
  "solutions":        ["ai-solutions","solutions-architecture","implementation","technical-consulting","other"],
  "sales":            ["sales","enterprise-sales","mid-market-sales","account-management","partnerships","business-development","sales-engineering","other"],
  "marketing":        ["marketing","product-marketing","growth","developer-relations","communications","brand","content","other"],
  "customer-success": ["customer-success","technical-account-management","implementation","customer-education","other"],
  "operations":       ["program-management","project-management","business-operations","strategy-operations","procurement","workplace-operations","other"],
  "legal-compliance": ["legal","compliance","privacy","ai-governance","contracts","other"],
  "policy":           ["policy","government-affairs","public-affairs","economic-policy","other"],
  "people":           ["recruiting","people-operations","hr","talent","employee-relations","other"],
  "finance":          ["finance","accounting","fp-and-a","treasury","tax","investor-relations","other"],
  "education":        ["education-training","curriculum","learning-development","other"],
  "other":            ["other"],
};
const CATEGORIES = Object.keys(TAXONOMY);
const SENIORITIES = ["intern","entry","junior","mid","senior","staff","principal","lead","manager","director","vp","executive","unknown"];
const WORKPLACES = ["remote","hybrid","on-site","unknown"];
const LOCATION_TYPES = ["worldwide","country","region","state-province","city","unknown"];
const EMPLOYMENT = ["full-time","part-time","contract","internship","temporary","unknown"];
const REVIEW_REASONS = [
  "invalid-category","invalid-specialization","category-specialization-mismatch",
  "ambiguous-category","ambiguous-specialization","title-description-conflict",
  "unknown-seniority","ambiguous-location","ambiguous-employment-type",
  "model-validation-failed",
];

const TAXONOMY_TEXT = Object.entries(TAXONOMY)
  .map(([cat, specs]) => `${cat}\n  - ${specs.join("\n  - ")}`).join("\n");

const INSTRUCTIONS = `You classify job postings for EarlyAIJobs.com, a job board
for jobs AT AI COMPANIES. Every role belongs on the board — a recruiter, a
lawyer, and a machine-learning engineer at an AI company are all valid.
Your task is to DESCRIBE each role accurately and consistently. You are NOT
judging whether a job is "an AI job". Never output any AI-relevance verdict.

CLASSIFY IN THIS ORDER:
Step 1 category. Step 2 specialization within that category. Step 3 seniority.
Step 4 workplace. Step 5 location. Step 6 employment type. Step 7 review flags.

EVIDENCE PRIORITY, strongest to weakest:
1. The job description's stated responsibilities (PRIMARY)
2. The job title
3. ATS-provided metadata
4. The company (WEAKEST — a role is not technical merely because the employer
   builds AI; classify the actual function)

CATEGORY vs SPECIALIZATION:
Category is the broad function. Specialization is the discipline WITHIN it.
Pick the category first, then a specialization listed under that category.
NEVER use a specialization as a category. NEVER invent values.
"developer-relations" is NEVER a category — it is a specialization under
marketing. Developer Advocate / Developer Relations / Developer Evangelist /
Technical Evangelist roles whose primary function is developer or community
advocacy => marketing / developer-relations.
There is NO "executive" category. Seniority carries the level, the category
carries the function: VP of Sales => sales + vp. CFO => finance + executive.
Director of Research => research + director.

CATEGORY TAXONOMY (the ONLY legal category/specialization combinations):
${TAXONOMY_TEXT}

seniority — exactly one of ${JSON.stringify(SENIORITIES)}.
Intern=intern, Junior=junior, bare title with no level signal=mid,
Senior=senior, Staff=staff, Principal=principal, Lead=lead,
Engineering Manager=manager, Director=director, VP=vp, Chief/C-level=executive.
Insufficient evidence = unknown. Never infer level from company prestige.

workplace_type — one of ${JSON.stringify(WORKPLACES)}.
If ATS Workplace Type is provided, ADOPT it. A city in the location field does
NOT by itself mean on-site — use unknown when genuinely unstated.

Location — four fields:
location_type: one of ${JSON.stringify(LOCATION_TYPES)}
location_country, location_region, location_city: strings or null.
"Remote - United States" => {type:"country", country:"United States"}.
"San Francisco, CA" => {type:"city", city:"San Francisco",
region:"California", country:"United States"}. Remote with no stated
restriction => "worldwide". NEVER invent a location; use unknown.

employment_type — one of ${JSON.stringify(EMPLOYMENT)}.
If ATS Employment Type is provided, adopt it.

REVIEW FLAGS — this replaces confidence scores. Do NOT output any confidence
number. Instead, when there is a CONCRETE, OBSERVABLE problem, set
needs_review true and list the reasons. Allowed reasons:
${JSON.stringify(REVIEW_REASONS)}
Use "ambiguous-category" when the role genuinely spans two categories (e.g. a
Research Engineer whose description is half infrastructure work) — choose the
best category anyway, then flag. Use "ambiguous-specialization" likewise.
Use "title-description-conflict" when the title and description disagree about
the function. Use "ambiguous-location" or "ambiguous-employment-type" when the
posting contradicts itself. Do NOT flag merely because you feel uncertain, and
do NOT flag a clean, ordinary posting. Most jobs should have needs_review
false and an empty reasons list.

OUTPUT: ONLY a raw JSON array, one object per job, same order and count as the
input. No markdown, no code fences, no commentary. Keys per object:
n, category, specialization, seniority, workplace_type, location_type,
location_country, location_region, location_city, employment_type,
needs_review, review_reasons.
Example object:
{"n":1,"category":"engineering","specialization":"machine-learning","seniority":"senior","workplace_type":"remote","location_type":"country","location_country":"United States","location_region":null,"location_city":null,"employment_type":"full-time","needs_review":false,"review_reasons":[]}`;

// ===== Provider boundary — swap this function to change AI vendors =====
// Returns raw text. Everything downstream is provider-agnostic.
async function classifyWithProvider(messages) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.content[0].text;
    }
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 3) {
      console.log(`  (API ${res.status} — waiting ${attempt * 10}s and retrying)`);
      await new Promise(r => setTimeout(r, attempt * 10000));
      continue;
    }
    throw new Error(`Provider error ${res.status}: ${await res.text()}`);
  }
}

function parseReply(text) {
  const cleaned = text.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
  try { return { verdicts: JSON.parse(cleaned) }; }
  catch { return { parseError: "Response was not valid JSON. Return ONLY a raw JSON array, no markdown, no commentary." }; }
}

// ===== Deterministic validation. Returns an error string, or null if valid. =====
function verdictError(v, jobCount) {
  if (!v || typeof v !== "object") return "verdict missing or not an object";
  if (!Number.isInteger(v.n) || v.n < 1 || v.n > jobCount) return `invalid job number ${v.n}`;
  if (!CATEGORIES.includes(v.category))
    return `category "${v.category}" is not a valid category. Allowed: ${CATEGORIES.join(", ")}`;
  if (!TAXONOMY[v.category].includes(v.specialization))
    return `specialization "${v.specialization}" is not valid under category "${v.category}". Allowed there: ${TAXONOMY[v.category].join(", ")}`;
  if (!SENIORITIES.includes(v.seniority)) return `invalid seniority "${v.seniority}"`;
  if (!WORKPLACES.includes(v.workplace_type)) return `invalid workplace_type "${v.workplace_type}"`;
  if (!LOCATION_TYPES.includes(v.location_type)) return `invalid location_type "${v.location_type}"`;
  if (!EMPLOYMENT.includes(v.employment_type)) return `invalid employment_type "${v.employment_type}"`;
  if (typeof v.needs_review !== "boolean") return "needs_review must be true or false";
  if (v.review_reasons !== undefined && v.review_reasons !== null && !Array.isArray(v.review_reasons))
    return "review_reasons must be an array";
  return null;
}

function collectErrors(verdicts, jobCount) {
  if (!Array.isArray(verdicts)) return { fatal: "Response must be a JSON array." };
  const errors = [];
  if (verdicts.length !== jobCount) errors.push(`expected ${jobCount} verdicts, got ${verdicts.length}`);
  for (const v of verdicts) {
    const e = verdictError(v, jobCount);
    if (e) errors.push(`Job ${v && v.n ? v.n : "?"}: ${e}`);
  }
  return { errors };
}

// ===== Review reasons: model-reported (filtered to the allowed list) plus
// deterministic ones the code can observe for itself. =====
// Reasons that mean "this record may be WRONG" — these send a job to review.
// Missing-but-optional detail (unknown seniority, multi-city postings) is
// recorded for analytics but does NOT block publishing.
const BLOCKING_REASONS = new Set([
  "invalid-category","invalid-specialization","category-specialization-mismatch",
  "ambiguous-category","ambiguous-specialization","title-description-conflict",
  "model-validation-failed",
]);

function reviewReasonsFor(v) {
  const reasons = new Set();
  if (Array.isArray(v.review_reasons)) {
    for (const r of v.review_reasons) if (REVIEW_REASONS.includes(r)) reasons.add(r);
  }
  if (v.seniority === "unknown") reasons.add("unknown-seniority");
  if (v.category === "other") reasons.add("ambiguous-category");
  const all = [...reasons];
  return { all, blocking: all.filter(r => BLOCKING_REASONS.has(r)) };
}

async function saveVerdict(job, v) {
  const { all: reasons, blocking } = reviewReasonsFor(v);
  await supabase.from("jobs").update({
    category: v.category,
    specialization: v.specialization,
    seniority: v.seniority,
    workplace_type: job.workplace_type || v.workplace_type,
    employment_type: job.employment_type || v.employment_type,
    location_type: v.location_type,
    location_country: v.location_country || null,
    location_region: v.location_region || null,
    location_city: v.location_city || null,
    needs_review: blocking.length > 0,
    review_reasons: reasons.length > 0 ? reasons.join(",") : null,
    taxonomy_version: TAXONOMY_VERSION,
    classification_source: CLASSIFICATION_SOURCE,
    classification_model: MODEL,
    classification_prompt_version: PROMPT_VERSION,
    classification_status: "classified",
    classified_at: new Date().toISOString(),
  }).eq("id", job.id);
  return { all: reasons, blocking };
}

// Failed validation is NOT a successful classification: classified_at stays
// null, status becomes "failed" so the row is excluded from future fetches
// (preventing an infinite retry loop) and remains findable for investigation.
async function saveFailure(job) {
  await supabase.from("jobs").update({
    needs_review: true,
    review_reasons: "model-validation-failed",
    classification_status: "failed",
    classification_model: MODEL,
    classification_prompt_version: PROMPT_VERSION,
    taxonomy_version: TAXONOMY_VERSION,
  }).eq("id", job.id);
}

async function main() {
  const BATCH = 20;
  const LIMIT = Number(process.argv[2] || 20);
  let done = 0, review = 0, failed = 0, retries = 0;
  const catCount = {}, specCount = {}, reasonCount = {};
  const reviewed = [], others = [];

  while (done + failed < LIMIT) {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, company_name, location, description, workplace_type, employment_type")
      .is("classified_at", null)
      .is("classification_status", null)
      .eq("is_open", true)
      .limit(Math.min(BATCH, LIMIT - done - failed));
    if (error) throw new Error(error.message);
    if (!jobs || jobs.length === 0) { console.log("Backlog empty — everything classified!"); break; }

    const list = jobs.map((j, i) =>
      `JOB ${i + 1}
Title: ${j.title} | Company: ${j.company_name} | Location: ${j.location || "unknown"}
ATS Workplace Type: ${j.workplace_type || "not provided"} | ATS Employment Type: ${j.employment_type || "not provided"}
Description: ${j.description || "not available"}`
    ).join("\n---\n");

    const firstReply = await classifyWithProvider([{ role: "user", content: INSTRUCTIONS + "\n\nJOBS TO CLASSIFY:\n" + list }]);
    let { verdicts, parseError } = parseReply(firstReply);
    let problems = parseError ? { errors: [parseError] } : collectErrors(verdicts, jobs.length);

    // Corrective retry: the provider is shown its exact validation errors.
    if (problems.fatal || problems.errors.length > 0) {
      retries++;
      const errorText = problems.fatal || problems.errors.join("\n");
      console.log(`  (validation issues — corrective retry)\n   ${errorText.split("\n")[0]}`);
      const correction = `Your previous response failed validation:\n${errorText}\n\nReclassify the ENTIRE batch using only legal values from the taxonomy. Return ONLY the corrected raw JSON array — same order, one object per job, all required keys.`;
      const secondReply = await classifyWithProvider([
        { role: "user", content: INSTRUCTIONS + "\n\nJOBS TO CLASSIFY:\n" + list },
        { role: "assistant", content: firstReply },
        { role: "user", content: correction },
      ]);
      verdicts = parseReply(secondReply).verdicts;
    }

    const byN = new Map(Array.isArray(verdicts) ? verdicts.filter(v => v && Number.isInteger(v.n)).map(v => [v.n, v]) : []);
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const v = byN.get(i + 1);
      const err = v ? verdictError(v, jobs.length) : "no verdict returned for this job";
      if (!err) {
        const { all: reasons, blocking } = await saveVerdict(job, v);
        catCount[v.category] = (catCount[v.category] || 0) + 1;
        specCount[`${v.category}/${v.specialization}`] = (specCount[`${v.category}/${v.specialization}`] || 0) + 1;
        if (v.specialization === "other") others.push(`${v.category}/other | ${job.title} (${job.company_name})`);
        for (const r of reasons) reasonCount[r] = (reasonCount[r] || 0) + 1;
        if (blocking.length > 0) {
          review++;
          reviewed.push(`${v.category}/${v.specialization} | ${job.title} (${job.company_name}) | ${blocking.join(",")}`);
          console.log(`REVIEW 👀 | ${v.category.padEnd(16)} | ${v.specialization.padEnd(22)} | ${v.seniority.padEnd(9)} | ${job.title} (${job.company_name}) | ${blocking.join(",")}`);
        } else {
          console.log(`          ${v.category.padEnd(16)} | ${v.specialization.padEnd(22)} | ${v.seniority.padEnd(9)} | ${job.title} (${job.company_name})`);
        }
        done++;
      } else {
        await saveFailure(job);
        reasonCount["model-validation-failed"] = (reasonCount["model-validation-failed"] || 0) + 1;
        console.log(`FAILED ❌ | ${job.title} (${job.company_name}) — ${err}`);
        failed++;
      }
    }
  }

  const line = (label, obj) => {
    console.log(`\n${label}`);
    Object.entries(obj).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
  };
  console.log(`\n=== RUN SUMMARY (taxonomy ${TAXONOMY_VERSION}, prompt ${PROMPT_VERSION}, model ${MODEL}) ===`);
  console.log(`Classified: ${done}  |  In review: ${review}  |  Validation failures: ${failed}  |  Corrective retries: ${retries}`);
  line("Category distribution:", catCount);
  line("Specialization distribution:", specCount);
  if (Object.keys(reasonCount).length) line("Review reasons:", reasonCount);
  if (others.length) { console.log(`\n'other' specializations (${others.length}):`); others.forEach(o => console.log(`  ${o}`)); }
  if (reviewed.length) { console.log(`\nJobs sent to review (${reviewed.length}):`); reviewed.forEach(r => console.log(`  ${r}`)); }
}

main().catch((err) => {
  const msg = String(err && err.message ? err.message : err);
  if (/credit|billing|quota|insufficient/i.test(msg)) {
    console.error("\nSTOPPED: out of API credits. Top up, then rerun the same command to resume where this left off.");
  } else {
    console.error(`\nSTOPPED: ${msg}`);
    console.error("Nothing was corrupted. Rerun the same command to resume from the remaining unclassified jobs.");
  }
  process.exit(1);
});
