// notify-google.js — the pipeline's last step: tell Google what changed.
//
//   node --env-file=.env notify-google.js            (dry run — prints, sends nothing)
//   node --env-file=.env notify-google.js --send     (actually notify Google)
//   node --env-file=.env notify-google.js --send --window 3
//
// Which URLs count as "changed"? The pipeline runs on a schedule and this
// script runs right after it, so we use a time window rather than persistent
// state (the job container's filesystem is wiped between runs):
//
//   NEW    = open jobs first seen within the window (default 2 hours)
//   CLOSED = closed jobs last seen within the window (a job that vanished
//            from its feed this cycle has is_open=false and a last_seen_at
//            of roughly the previous cycle)
//
// Re-notifying a URL a second time is harmless — it only costs quota — so an
// overlapping window is safe by design. English-only and approved companies
// only, matching exactly what the sitemap advertises.

const { createClient } = require("@supabase/supabase-js");
const { notify } = require("./lib/google-indexing");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral", "figureai", "coreweave", "togetherai", "sierra", "harvey"];
const BASE = "https://www.earlyaijobs.com";

async function fetchWindow(windowHours) {
  const since = new Date(Date.now() - windowHours * 3600000).toISOString();
  const english = (q) => q.or("posting_language.eq.en,posting_language.is.null,posting_language.eq.und");

  const { data: fresh, error: e1 } = await english(
    supabase.from("jobs").select("id").eq("is_open", true).in("company_name", APPROVED).gte("first_seen_at", since)
  ).limit(500);
  if (e1) throw new Error(`new-jobs query: ${e1.message}`);

  const { data: closed, error: e2 } = await english(
    supabase.from("jobs").select("id").eq("is_open", false).in("company_name", APPROVED).gte("last_seen_at", since)
  ).limit(500);
  if (e2) throw new Error(`closed-jobs query: ${e2.message}`);

  return {
    newUrls: (fresh || []).map((j) => `${BASE}/job/${j.id}`),
    closedUrls: (closed || []).map((j) => `${BASE}/job/${j.id}`),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const wIdx = args.indexOf("--window");
  const windowHours = wIdx >= 0 ? Number(args[wIdx + 1]) || 2 : 2;

  const { newUrls, closedUrls } = await fetchWindow(windowHours);
  console.log(`[notify-google] window ${windowHours}h · ${newUrls.length} new · ${closedUrls.length} closed · mode: ${send ? "SEND" : "DRY RUN"}`);

  const report = await notify(newUrls, closedUrls, { dryRun: !send });

  if (!report.configured) {
    console.log(`[notify-google] ${report.note}`);
    return;
  }
  if (!send) {
    for (const r of report.results.slice(0, 20)) console.log(`  would notify: ${r.url}`);
    if (report.results.length > 20) console.log(`  … and ${report.results.length - 20} more`);
    console.log(`[notify-google] dry run complete — nothing sent.`);
    return;
  }

  for (const r of report.results) {
    console.log(`  ${r.ok ? "ok " : "ERR"} ${r.status} ${r.url}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(`[notify-google] sent ${report.sent} · failed ${report.failed} · skipped ${report.skipped}`);
  // Failures are logged, never fatal: the next cycle's window re-covers them,
  // and the sitemap remains the safety net for overall coverage.
}

main().catch((err) => {
  // Even a total failure (bad key, network) must not fail the pipeline run.
  console.error(`[notify-google] STOPPED: ${err.message} (non-fatal — pipeline unaffected)`);
  process.exit(0);
});
