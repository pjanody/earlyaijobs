// score-jobs.js — EarlyAIJobs deterministic classification quality score.
//
// WHAT THIS IS
// ------------
// A transparent, rule-based score (0-100) describing HOW MUCH EVIDENCE
// supported each classification — and how internally consistent that
// classification is.
//
// WHAT THIS IS NOT
// ----------------
// It is NOT a probability that the classification is correct, and it is NOT
// an AI's self-reported confidence. We deliberately removed model-generated
// confidence because it is uncalibrated: a model that misreads a job reports
// high confidence anyway, so the score stayed ~0.9 on its own mistakes.
//
// This score instead asks: "how much did the classifier have to guess?"
// Every input is data we already stored, so the score is:
//   - free            (zero API calls)
//   - recomputable    (change the weights, re-run, no reclassification)
//   - auditable       (every point is itemised in quality_signals)
//   - portable        (means the same thing regardless of AI provider)
//
// It is also FALSIFIABLE: after humans review a sample, measure real accuracy
// per band. If 80-100 is not meaningfully more accurate than 40-59, the
// weights are wrong and should be revised. That validation is impossible
// with an LLM's self-reported confidence.

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SCORER_VERSION = "1.0";

// Level words that constitute direct title evidence of seniority.
const LEVEL_WORDS = {
  intern: "intern", junior: "junior", "jr.": "junior", associate: "entry",
  senior: "senior", "sr.": "senior", staff: "staff", principal: "principal",
  lead: "lead", manager: "manager", director: "director", vp: "vp",
  "vice president": "vp", chief: "executive", head: "lead",
};

// Title keywords that imply a functional category. Used ONLY as a consistency
// check against the category the classifier chose — never to reclassify.
const TITLE_CATEGORY_HINTS = [
  [/\b(recruiter|recruiting|talent acquisition)\b/i, "people"],
  [/\b(accountant|accounting|controller|tax|treasury|payroll|fp&a)\b/i, "finance"],
  [/\b(counsel|attorney|paralegal|legal)\b/i, "legal-compliance"],
  [/\b(policy|government affairs|public affairs)\b/i, "policy"],
  [/\b(account executive|sales|seller|business development)\b/i, "sales"],
  [/\b(marketing|brand|communications|content strategist)\b/i, "marketing"],
  [/\b(designer|design|ux|ui)\b/i, "design"],
  [/\b(product manager|product management|pm,)\b/i, "product"],
  [/\b(research scientist|researcher|research engineer)\b/i, "research"],
  [/\b(data scientist|data engineer|analytics|analyst)\b/i, "data"],
  [/\b(security|infosec|appsec|trust & safety)\b/i, "security"],
  [/\b(customer success|technical account manager)\b/i, "customer-success"],
  [/\b(solutions architect|implementation consultant)\b/i, "solutions"],
  [/\b(software engineer|swe|full[- ]stack|backend|frontend)\b/i, "engineering"],
];

// Categories that are close cousins — a mismatch between them is not a real
// inconsistency (e.g. an infra job whose title says "software engineer").
const RELATED = [
  new Set(["engineering", "infrastructure", "data", "research", "security"]),
  new Set(["sales", "marketing", "customer-success", "solutions"]),
  new Set(["operations", "people", "finance", "legal-compliance", "policy"]),
];
function areRelated(a, b) {
  return RELATED.some((group) => group.has(a) && group.has(b));
}

/**
 * Compute the quality score for one job row.
 * Returns { score, signals } where signals itemises every adjustment,
 * so any score can be explained line by line.
 */
function scoreJob(job) {
  let score = 100;
  const signals = [];
  const add = (points, label) => { score += points; signals.push(`${points > 0 ? "+" : ""}${points} ${label}`); };

  const title = (job.title || "").toLowerCase();
  const desc = job.description || "";

  // --- Evidence available to the classifier ---
  if (!desc) add(-30, "no-description");
  else if (desc.length < 200) add(-15, "thin-description");

  // --- Precision of the placement ---
  if (job.category === "other") add(-25, "category-other");
  if (job.specialization === "other") add(-15, "specialization-other");

  // --- Seniority: read from the title, or defaulted? ---
  const levelHit = Object.keys(LEVEL_WORDS).find((w) => title.includes(w));
  if (job.seniority === "unknown") {
    add(-10, "seniority-unknown");
  } else if (!levelHit) {
    add(-5, "seniority-inferred-no-title-evidence");
  } else if (LEVEL_WORDS[levelHit] === job.seniority) {
    add(+5, "seniority-corroborated-by-title");
  }

  // --- Internal consistency: does the title's function match the category? ---
  const hint = TITLE_CATEGORY_HINTS.find(([re]) => re.test(title));
  if (hint) {
    const implied = hint[1];
    if (implied === job.category) add(+5, "category-corroborated-by-title");
    else if (!areRelated(implied, job.category)) add(-15, `category-title-conflict(title implies ${implied})`);
  }

  // --- Facts from the ATS beat inferences by the model ---
  if (job.ats_workplace_type) add(+5, "workplace-from-ats");
  else if (!job.workplace_type || job.workplace_type === "unknown") add(-5, "workplace-unknown");

  if (job.ats_employment_type) add(+3, "employment-from-ats");
  else if (!job.employment_type || job.employment_type === "unknown") add(-3, "employment-unknown");

  if (!job.location_type || job.location_type === "unknown") add(-5, "location-unresolved");

  // --- Problems already recorded during classification ---
  const BLOCKING = ["invalid-", "mismatch", "ambiguous-category", "ambiguous-specialization", "title-description-conflict", "model-validation-failed"];
  const reasons = (job.review_reasons || "").split(",").map((r) => r.trim()).filter(Boolean);
  for (const r of reasons) {
    if (BLOCKING.some((b) => r.includes(b))) add(-20, `blocking:${r}`);
    else add(-5, `minor:${r}`);
  }

  score = Math.max(0, Math.min(100, score));
  return { score, signals };
}

function band(score) {
  if (score >= 80) return "strong";
  if (score >= 60) return "moderate";
  return "weak";
}

async function main() {
  const PAGE = 500;
  let from = 0, total = 0;
  const bands = { strong: 0, moderate: 0, weak: 0 };
  const signalTally = {};

  for (;;) {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, description, category, specialization, seniority, workplace_type, employment_type, location_type, review_reasons")
      .eq("classification_status", "classified")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!jobs || jobs.length === 0) break;

    for (const job of jobs) {
      const { score, signals } = scoreJob(job);
      await supabase.from("jobs").update({
        classification_quality: score,
        quality_band: band(score),
        quality_signals: signals.join(" | ") || null,
        quality_scorer_version: SCORER_VERSION,
      }).eq("id", job.id);
      bands[band(score)]++;
      for (const s of signals) {
        const key = s.replace(/^[+-]\d+ /, "").replace(/\(.*\)/, "");
        signalTally[key] = (signalTally[key] || 0) + 1;
      }
      total++;
    }
    process.stdout.write(`\rScored ${total} jobs...`);
    from += PAGE;
  }

  console.log(`\n\n=== QUALITY SCORING COMPLETE (scorer v${SCORER_VERSION}) ===`);
  console.log(`Scored: ${total}`);
  console.log(`  strong   (80-100): ${bands.strong}`);
  console.log(`  moderate (60-79) : ${bands.moderate}`);
  console.log(`  weak     (0-59)  : ${bands.weak}`);
  console.log(`\nMost common signals:`);
  Object.entries(signalTally).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));
}

main().catch((err) => {
  console.error(`\nSTOPPED: ${err.message}`);
  process.exit(1);
});
