# EarlyAIJobs

**[www.earlyaijobs.com](https://www.earlyaijobs.com)** — every open role at 16 leading AI companies, sourced hourly from the employers' own career feeds. No scraping, no stale listings, no middleman: every job links straight to the company's application page, and EarlyAIJobs never touches an applicant's data.

~4,200 open jobs · 19 categories · updated hourly · built by [Patrick Janody](https://github.com/pjanody) with Claude as pair programmer.

## How it works

```
ATS feeds (Greenhouse, Ashby)          every hour, on a schedule
        │
        ▼
upload-jobs.js        collect every feed, upsert new jobs, close vanished ones
classify-simple.js    assign one of 19 categories — deterministic rules, no AI
normalize-new-jobs.js country codes, confirmed-remote, posting language
notify-google.js      tell Google's Indexing API what appeared or closed
        │
        ▼
Supabase (Postgres)  ──►  Next.js 15 site, server-rendered
```

The public site reads through a row-level-security-limited key that can only
SELECT open jobs. The pipeline's write key exists only as an encrypted
environment variable on the scheduled job.

## Principles

**Nothing in production calls an AI model.** Classification is a rule engine:
title rules first, description rules as fallback, longest-phrase-wins
tie-breaking. Rules are readable, testable, and change only by commit.

**Unknown is better than wrong.** Remote status is tri-state — true, false, or
unknown — and unknown never collapses to a guess. A job with no salary shows no
salary. Structured data omits any field we can't back with employer-supplied
facts (a salary-extraction experiment was built, measured at 12.6% coverage,
and closed rather than shipped half-right — see `experiments/salary/DECISION.md`).

**Every word is the employer's.** Job descriptions render through an allowlist
sanitizer that preserves the employer's text exactly. The single exception is
documented: paragraphs containing nothing but an ATS requisition code are
removed.

**Expired means gone.** Closed jobs are noindexed immediately and deleted
after 7 days. Non-English postings stay in the database but never display.

## Verification culture

319 unit tests across 10 suites — classifier rules, location/language parsers,
HTML sanitization, description fidelity, SEO metadata, JobPosting structured
data, Indexing API behavior, and content completeness. Every batch ships the
same way: tests → dry run → review → write → verify in production.

The dry-run discipline is the interesting part: every script that writes to
the database has a read-only twin that reports what *would* change, and
nothing writes until a human has read that report. The `diagnose-*.js` and
`qa-*.js` files in the repo root are those twins.

## SEO architecture

- Per-job `JobPosting` structured data (validated via Google's Rich Results Test)
- Google Indexing API notification within the hour a job appears or closes
- 19 category destination pages (`/jobs/engineering`) with canonical migration
  from the older query-string views
- Per-page OpenGraph share cards rendered on demand with live counts
- Crawl-trap hygiene: search results, personal views, and pagination are
  noindexed; sitemap advertises only canonical, English, open-job URLs

## Stack

Next.js 15 (App Router) · Supabase Postgres · DigitalOcean App Platform
(web service + scheduled job) · zero runtime dependencies beyond
`@supabase/supabase-js` in the pipeline

## Running locally

```bash
npm install
npm run dev            # site at localhost:3000
node test-classify.js  # or any other test-*.js — no database needed
```

The site needs `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Pipeline scripts
additionally need the service key and are gated behind explicit `--write`
flags; without them every script is a dry run.
