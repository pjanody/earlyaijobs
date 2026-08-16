// classify-jobs-local.js
// EarlyAIJobs deterministic Supabase runner.
//
// ZERO LLM API calls. Claude/OpenAI/Gemini are not involved in classification.
//
// MODES
//   Comparison (read-only, may include already-classified rows):
//     node --env-file=.env classify-jobs-local.js 50 --dry-run --compare
//   Dry run over production candidates (unclassified only, no writes):
//     node --env-file=.env classify-jobs-local.js 50 --dry-run
//   Production write (unclassified only):
//     node --env-file=.env classify-jobs-local.js 50 --write
//   Deliberate rewrite of already-classified rows (explicit opt-in):
//     node --env-file=.env classify-jobs-local.js 50 --write --reclassify
//
// SAFETY: --write cannot touch a row that already has classified_at unless
// --reclassify is supplied. --compare and --write together is an error.
//
// Historical LLM classifications shown in comparison mode are REFERENCE DATA
// ONLY. Disagreement with them is not an error and must never be used to tune
// rules, weights, thresholds, or taxonomy.

const { createClient } = require("@supabase/supabase-js");
const {
  classifyJob,
  TAXONOMY_VERSION,
  CLASSIFIER_VERSION,
  CONFIDENCE_VERSION
} = require("./deterministic-classifier");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const write = args.has("--write");
  const compare = args.has("--compare");
  const reclassify = args.has("--reclassify");
  const all = args.has("--all");
  const numeric = argv.slice(2).find(x => /^\d+$/.test(x));
  const limit = all ? Infinity : Number(numeric || 20);

  if (compare && write) {
    console.error("ERROR: --compare is read-only and cannot be combined with --write.");
    process.exit(1);
  }
  return { write, compare, reclassify, all, limit, dryRun: !write };
}

function shorten(s, n = 90) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function printResult(job, r, compare) {
  const icon = r.decision === "accept" ? "✓ ACCEPT" : r.decision === "review" ? "👀 REVIEW" : "✕ REJECT";
  console.log(`\n────────────────────────────────────────────────────────────────────`);
  console.log(`${shorten(job.title)}  —  ${job.company_name}`);
  console.log(`  placement      : ${r.category} / ${r.specialization}`);
  console.log(`  seniority      : ${r.seniority}   workplace: ${r.workplace_type}   employment: ${r.employment_type}`);
  console.log(`  location       : ${r.location_type}${r.location_city ? ` — ${r.location_city}` : ""}${r.location_country ? `, ${r.location_country}` : ""}`);
  console.log(`  confidence     : ${r.classification_confidence} (${r.classification_band})    placement fit: ${r.placement_fit_score}`);
  const c = r.confidence_components || {};
  console.log(`  components     : evidence ${c.evidence_strength} | margin ${c.winner_margin} | consistency ${c.internal_consistency} | provenance ${c.evidence_provenance}`);
  console.log(`  category       : ${r.category_score} pts   runner-up: ${r.category_runner_up} (${r.category_runner_up_score})`);
  console.log(`  specialization : ${r.specialization_score} pts   runner-up: ${r.specialization_runner_up} (${r.specialization_runner_up_score})`);
  console.log(`  decision       : ${icon}${r.review_reasons.length ? ` — ${r.review_reasons.join(", ")}` : ""}`);
  if (r.informational_flags.length) console.log(`  info flags     : ${r.informational_flags.join(", ")}`);
  const sig = (r.classification_signals || []).slice(0, 6)
    .map(s => `${s.source}:"${s.phrase}"+${s.points}`).join("  ");
  if (sig) console.log(`  evidence       : ${sig}`);

  if (compare && job.classified_at) {
    console.log(`  HISTORICAL CLASSIFICATION — NOT GROUND TRUTH:`);
    console.log(`      ${job.category || "—"} / ${job.specialization || "—"} / ${job.seniority || "—"}` +
      `  (source: ${job.classification_source || "unknown"}` +
      `${job.classification_confidence != null ? `, legacy self-reported confidence: ${job.classification_confidence}` : ""})`);
    const catSame = job.category === r.category;
    const specSame = job.specialization === r.specialization;
    if (!catSame || !specSame) {
      console.log(`      classification disagreement${!catSame ? " [category]" : ""}${!specSame ? " [specialization]" : ""}`);
    }
  }
}

async function fetchBatchAfter(opts, batchSize, afterId) {
  const cols = "id, title, company_name, location, description, workplace_type, employment_type" +
    (opts.compare
      ? ", category, specialization, seniority, classification_source, classification_confidence, classified_at"
      : ", classified_at");

  let q = supabase.from("jobs").select(cols).eq("is_open", true)
    .order("id", { ascending: true }).limit(batchSize);

  // Comparison mode may look at any job. Production mode only touches
  // unclassified rows unless --reclassify was explicitly supplied.
  if (!opts.compare && !opts.reclassify) q = q.is("classified_at", null);
  if (afterId !== null) q = q.gt("id", afterId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function writeResult(job, r) {
  // Final safety net: never overwrite an existing classification by accident.
  if (job.classified_at && !r.__allowReclassify) {
    throw new Error(`Refusing to overwrite already-classified job ${job.id} without --reclassify`);
  }
  const payload = {
    category: r.category,
    specialization: r.specialization,
    seniority: r.seniority,
    workplace_type: job.workplace_type || r.workplace_type,   // ATS fact wins
    employment_type: job.employment_type || r.employment_type, // ATS fact wins
    location_type: r.location_type,
    location_country: r.location_country,
    location_region: r.location_region,
    location_city: r.location_city,

    needs_review: r.needs_review,
    review_reasons: r.review_reasons.length ? r.review_reasons.join(",") : null,

    // NOTE: deterministic score lives in its own column. The legacy
    // classification_confidence column keeps historical LLM values untouched.
    deterministic_confidence: r.classification_confidence,
    classification_band: r.classification_band,
    placement_fit_score: r.placement_fit_score,
    classification_signals: r.classification_signals,
    confidence_components: r.confidence_components,

    category_score: r.category_score,
    category_runner_up: r.category_runner_up,
    category_runner_up_score: r.category_runner_up_score,
    specialization_score: r.specialization_score,
    specialization_runner_up: r.specialization_runner_up,
    specialization_runner_up_score: r.specialization_runner_up_score,
    informational_flags: r.informational_flags,

    taxonomy_version: TAXONOMY_VERSION,
    classifier_version: CLASSIFIER_VERSION,
    confidence_scorer_version: CONFIDENCE_VERSION,
    classification_source: "deterministic-local",
    classification_status: r.decision === "reject" ? "rejected" : "classified",
    classified_at: new Date().toISOString()
  };

  const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
  if (error) throw new Error(`Write failed for ${job.id}: ${error.message}`);
}

async function main() {
  const opts = parseArgs(process.argv);
  const BATCH = 200;

  const mode = opts.compare ? "COMPARISON (read-only)" : opts.write ? (opts.reclassify ? "WRITE + RECLASSIFY" : "WRITE (unclassified only)") : "DRY RUN";
  console.log(`EarlyAIJobs deterministic classifier ${CLASSIFIER_VERSION}`);
  console.log(`Mode: ${mode} | Limit: ${opts.all ? "ALL" : opts.limit}`);
  if (!opts.write) console.log("No database rows will be changed.");
  if (opts.compare) console.log("Historical classifications are REFERENCE DATA ONLY — not ground truth, not accuracy.");

  let processed = 0, afterId = null;
  const counts = { accept: 0, review: 0, reject: 0 };
  const bands = { strong: 0, moderate: 0, weak: 0 };
  const reviewReasons = {};
  let compared = 0, catSame = 0, specSame = 0;

  while (processed < opts.limit) {
    const remaining = opts.limit === Infinity ? BATCH : Math.min(BATCH, opts.limit - processed);
    const jobs = await fetchBatchAfter(opts, remaining, afterId);
    if (!jobs.length) break;

    for (const job of jobs) {
      const result = classifyJob(job);
      printResult(job, result, opts.compare);

      counts[result.decision] = (counts[result.decision] || 0) + 1;
      if (result.classification_band) bands[result.classification_band]++;
      for (const reason of result.review_reasons || []) {
        reviewReasons[reason] = (reviewReasons[reason] || 0) + 1;
      }
      if (opts.compare && job.classified_at && job.category) {
        compared++;
        if (job.category === result.category) catSame++;
        if (job.specialization === result.specialization) specSame++;
      }

      if (opts.write) {
        result.__allowReclassify = opts.reclassify;
        await writeResult(job, result);
      }

      processed++;
      afterId = job.id;
      if (processed >= opts.limit) break;
    }
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total jobs: ${processed}`);
  console.log(`  Accepted : ${counts.accept}`);
  console.log(`  Reviewed : ${counts.review}`);
  console.log(`  Rejected : ${counts.reject}`);
  console.log(`\nConfidence bands:`);
  console.log(`  Strong (80-100) : ${bands.strong}`);
  console.log(`  Moderate (60-79): ${bands.moderate}`);
  console.log(`  Weak (0-59)     : ${bands.weak}`);

  const g = (k) => reviewReasons[k] || 0;
  console.log(`\nPlacement problems:`);
  console.log(`  category near-ties        : ${g("category-near-tie")}`);
  console.log(`  specialization near-ties  : ${g("specialization-near-tie")}`);
  console.log(`  title/description conflict: ${g("title-description-conflict")}`);
  console.log(`  no category evidence      : ${g("no-category-evidence")}`);
  console.log(`  no specialization evidence: ${g("no-specialization-evidence")}`);
  console.log(`  category = other          : ${g("category-other")}`);
  console.log(`  very low confidence       : ${g("very-low-classification-confidence")}`);

  const reasons = Object.entries(reviewReasons).sort((a, b) => b[1] - a[1]);
  if (reasons.length) {
    console.log(`\nAll review reasons:`);
    for (const [reason, n] of reasons) console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }

  if (opts.compare && compared > 0) {
    console.log(`\n--- Comparison only — NOT accuracy ---`);
    console.log(`Jobs with a historical classification: ${compared}`);
    console.log(`  Same category as historical      : ${catSame}/${compared}`);
    console.log(`  Different category               : ${compared - catSame}/${compared}`);
    console.log(`  Same specialization as historical: ${specSame}/${compared}`);
    console.log(`This is NOT an accuracy measurement. Historical LLM labels are not ground truth.`);
  }

  console.log(`\nVersions: taxonomy=${TAXONOMY_VERSION}, classifier=${CLASSIFIER_VERSION}, confidence=${CONFIDENCE_VERSION}`);
}

main().catch(err => {
  console.error(`\nSTOPPED: ${err.message || err}`);
  process.exit(1);
});
