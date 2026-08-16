// DEPRECATED — replaced by run-pipeline.js.
//
// This file previously ran an always-on process with node-cron. DigitalOcean
// App Platform supports native scheduled jobs (cron expressions, 15-minute
// minimum interval) that are billed only while running, which is both simpler
// and cheaper than keeping a process alive 24/7 to work for a few minutes a day.
//
// Use run-pipeline.js as the scheduled job's run command instead:
//     node run-pipeline.js
//
// Kept only so nothing references a missing file. Safe to delete.

console.log("worker.js is deprecated — use run-pipeline.js with a DigitalOcean scheduled job.");
process.exit(0);
