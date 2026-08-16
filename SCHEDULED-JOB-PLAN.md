# EarlyAIJobs — Scheduled Pipeline Plan (for review before implementation)

**Context:** earlyaijobs.com is live on DigitalOcean App Platform. Data is
current but only updates when Patrick runs the pipeline by hand. This plan adds
an hourly scheduled job so the site maintains itself.

---

## Pre-flight (must be complete before creating the component)

1. **Trimmed collector deployed.** `upload-jobs.js` now ingests only the six
   approved companies (anthropic, databricks, scaleai / openai, elevenlabs,
   replit). Lever list is empty. Needs `git push`.
2. **Database cleaned.** 4,936 rows from de-scoped companies deleted after a
   verified count. Remaining: databricks 874, openai 823, anthropic 476,
   elevenlabs 265, scaleai 227, replit 92 (totals include closed jobs).
3. **Manual verification run** of the trimmed collector, reviewing the run
   report before anything is automated.

---

## Component configuration

Add to the **existing app** (so it shares the repo, branch and autodeploy).

| Setting | Value |
|---|---|
| Component type | **Job** |
| Trigger | **On a schedule** |
| Schedule | `0 * * * *` — hourly, on the hour (UTC) |
| Build command | `npm install` |
| Run command | `node run-pipeline.js` |
| Instance size | Basic, smallest |
| Source | same repo/branch as the web service |

Build command is deliberately `npm install`, not `npm run build`: this component
never serves the site, so building Next.js would waste build minutes.

### Environment variables (component-scoped, **Encrypted**)

| Key | Value |
|---|---|
| `SUPABASE_URL` | project URL |
| `SUPABASE_SERVICE_KEY` | the **secret** key (`sb_secret_…`) |

The secret key exists only on this component. The web service continues to use
the publishable key, which RLS restricts to public SELECT.

---

## What one cycle does

`run-pipeline.js` runs two steps sequentially, then exits:

1. **`upload-jobs.js`** — fetch all six feeds, upsert, reconcile per company
2. **`classify-simple.js --all --approved --only-new --write`** — categorise
   only jobs with no category yet

Exit code 0 on success, 1 on failure (so DigitalOcean's "Failed Deployment"
alert policy surfaces problems).

Expected runtime: **under 2 minutes** post-trim (the 33-company run took 2.4
minutes; six companies plus `--only-new` classification should be well under).

---

## Safety properties already implemented

These were built and verified before automation, and are the reason hourly
unattended execution is acceptable:

1. **Per-company reconciliation.** Jobs are marked `is_open = false` only for a
   company whose fetch **succeeded in that run**. A global sweep is impossible.
2. **Failed feeds never close jobs.** Fetch error, HTTP failure, missing feed,
   or a failed database write → that company is skipped entirely and reported;
   its existing jobs are untouched.
3. **Empty feeds never close jobs.** A successful response containing zero jobs
   is treated as ambiguous, not as "everything closed."
4. **40% close ceiling.** If a successful fetch would close more than 40% of a
   company's open jobs, the script refuses, logs loudly, and leaves the data
   alone for manual review.
5. **`--only-new` classification.** Existing categorised jobs are not relabelled
   hourly. Full reclassification remains a manual command.
6. **Idempotent.** Re-running produces the same state; upserts key on
   `(source_platform, source_id)`.

---

## Verification protocol

**Before enabling the schedule**, run manually and record: jobs fetched, new,
updated, closed, failures, runtime, and per-company open counts before/after.
Investigate any implausible drop.

**After creating the component**, trigger it once with **Run Now** rather than
waiting for the hour. Confirm in the logs:

- [ ] Both steps execute in order
- [ ] Six companies fetched, no `[FETCH-FAILED]` / `[EMPTY-FEED]` / `[CLOSE-REFUSED]`
- [ ] Classification reports only new jobs
- [ ] `cycle complete … exiting cleanly`
- [ ] Runtime recorded
- [ ] Site reflects the run

**Then observe one automatic scheduled run** before considering the pipeline
work complete.

---

## Cost

Billed per second of runtime. ~2 min/run × 24 runs/day ≈ 48 min/day of compute.
Estimated **$1–3/month** on top of the ~$5 web service.

---

## Rollback

If a run corrupts data (no known path — the safety properties above prevent the
known failure modes): disable the schedule in the component settings, then
restore by running the collector manually. Because `is_open` is derived from
each fetch rather than accumulated, a single correct run repairs state.

---

## Explicitly out of scope today

No monitoring dashboards, alerting systems, additional companies, classifier
changes, SEO landing routes, accounts, or email. Frequency stays hourly; 30 or
15 minutes is a later decision informed by observed runtime and cost.
