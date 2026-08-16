// run-pipeline.js — one full data cycle, then exit.
//
// This is the entry point for the DigitalOcean App Platform SCHEDULED JOB
// component. It runs once, does the work, prints a summary and exits, so the
// app is billed only for the ~2-5 minutes it actually runs rather than for an
// always-on process.
//
//   1. upload-jobs.js       collect every feed, upsert, close vanished jobs
//   2. classify-simple.js   assign categories to the approved companies
//
// Environment (set as ENCRYPTED variables on the job component):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//
// Locally you can run the same thing with:
//   node --env-file=.env run-pipeline.js

const { execFile } = require("child_process");

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    console.log(`\n[pipeline] → ${script} ${args.join(" ")}`);
    execFile("node", [script, ...args], { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      const secs = Math.round((Date.now() - started) / 1000);
      // These scripts print one line per job; only the tail is useful in logs.
      const tail = String(stdout || "").trim().split("\n").slice(-15).join("\n");
      if (tail) console.log(tail);
      if (stderr && stderr.trim()) console.error(String(stderr).trim().slice(0, 2000));
      if (err) {
        console.error(`[pipeline] ✗ ${script} failed after ${secs}s`);
        return reject(err);
      }
      console.log(`[pipeline] ✓ ${script} completed in ${secs}s`);
      resolve();
    });
  });
}

async function main() {
  const started = Date.now();
  console.log(`[pipeline] EarlyAIJobs data cycle starting ${new Date().toISOString()}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }

  await run("upload-jobs.js");
  // --only-new: categorise just the newly-arrived jobs. Re-classifying every
  // existing row each cycle would add minutes of billed runtime for no change.
  // To apply updated rules to the whole corpus, run without --only-new by hand.
  await run("classify-simple.js", ["--all", "--approved", "--only-new", "--write"]);

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n[pipeline] cycle complete in ${mins} min — exiting cleanly.`);
}

main().catch((err) => {
  console.error(`[pipeline] STOPPED: ${err.message || err}`);
  // Non-zero exit tells App Platform the run failed, so it appears in alerts.
  process.exit(1);
});
