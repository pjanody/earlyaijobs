# EarlyAIJobs — Week 1 Build Log

**Aug 5–17, 2026.** From "what is a terminal" to a live, self-updating job board
at earlyaijobs.com carrying 2,493 categorised jobs from six AI companies.

Written for review and study. Part 1 is what happened; Part 2 is what to
remember; Part 3 is what went wrong and why that mattered.

---

# PART 1 — WHAT WE BUILT, IN ORDER

## Day 1 — APIs, JSON, and a first script

**Goal:** get job data out of the internet and onto a laptop.

Installed the toolkit: **Node.js** (runs JavaScript outside a browser),
**VS Code** (editor), **Git** (version history), and created a GitHub account.

Discovered that companies don't publish jobs by hand — they rent hiring
platforms called **ATS** (Applicant Tracking Systems). Three matter for us:
Greenhouse, Lever, Ashby. Each exposes a **public JSON feed** per company at a
predictable URL, e.g.

```
https://boards-api.greenhouse.io/v1/boards/anthropic/jobs
```

No key, no scraping, no legal grey area. Because the URL pattern is
predictable, one script can collect from hundreds of companies.

Wrote `fetch-jobs.js`: loop over a list of company slugs, `fetch()` each feed,
print titles. Grew it from 5 companies to 25 and it broke — two companies
weren't on Greenhouse, so the reply had no `jobs` array and the script crashed
reaching into a box that wasn't there. Added the first piece of real
engineering:

```js
if (!response.ok) { console.log(`${company}: skipped`); continue; }
```

**Result:** 5,259 jobs printed in about four seconds. First Git commit.

## Day 2 — A real database

**Goal:** stop the data evaporating when the script ends.

Created a **Supabase** project (managed Postgres, free tier). Wrote the first
SQL: two tables, `companies` and `jobs`, with column types, `not null`
constraints, automatic timestamps, and the single most important line of the
week:

```sql
unique (source_platform, source_id)
```

That's **deduplication** enforced by the database itself. Every job has a
permanent id from its platform; platform + id is its fingerprint. Even a buggy
script cannot create a duplicate, because Postgres will refuse.

The code counterpart is the **upsert**: "insert if new, update if seen before."

```js
.upsert(batch, { onConflict: "source_platform,source_id" })
```

Also learned the **two keys** model: a *publishable* key safe for browsers, and
a *secret* key for servers only — with **Row Level Security** (RLS) as the
bouncer. Our policy: everyone may read jobs, nobody may write. Secrets went
into `.env`, and `.gitignore` keeps that file out of Git forever.

**Result:** 6,903 jobs stored. Ran the pipeline twice; the count didn't move.
Dedupe proven.

## Day 3 — Classification (the long day)

**Goal:** decide what each job *is*.

The problem: an AI company's feed contains accountants, recruiters and office
managers. A job board's value is its filter.

**First approach — an LLM classifier.** Called Claude's API per batch of 20
jobs, asking for structured JSON: category, seniority, remote, AI-relevance.
Built validation (reject illegal values), corrective retries (show the model its
own error), QA flags, and confidence scores. Iterated through six versions over
two days with GPT reviewing each round.

**Then two realisations changed everything:**

1. **The product definition was wrong.** "AI jobs only" excluded exactly the
   audience the site is for — non-engineers moving into AI. Reframed to *jobs at
   AI companies, with powerful role filters*. Every role at an approved company
   is listed; the classifier only describes it.

2. **Model self-reported confidence is not a measurement.** Every
   misclassification we caught arrived at 90%+ confidence. A model that
   misreads a job misreads it fluently. Removed it entirely.

**Second approach — deterministic classification.** No LLM at all:
`classify-simple.js` matches title phrases (longest match wins), falls back to
description phrases, then to `other`. Free, instant, auditable, re-runnable
forever. Plus one hard rule earned from experience: company boilerplate
("Anthropic is an AI safety and research company") must never classify a job —
that single sentence was dragging unrelated roles into `research`.

**Result:** 2,493 jobs categorised across 18 categories, 3.4% `other`. Cost: $0.

## Day 3.5 — The description bug (worth its own section)

Halfway through, a diagnostic revealed the classifier had been working with
almost no evidence. `upload-jobs.js` truncated descriptions to **800
characters**, and a Greenhouse posting's first 800 characters are the company
preamble. The actual responsibilities were never stored.

Fixed in three steps: preserve HTML structure (convert block tags to newlines
so headings survive), raise the limit to 6,000, then remove the limit entirely —
storage is cheap, discarded evidence is unrecoverable.

**Lesson:** we spent hours tuning rules against input that was 90% boilerplate.
Verify your inputs before tuning your logic.

## Days 4–5 — The website

**Goal:** something a human can use.

Built with **Next.js 15** (App Router, server components). Six files:

| File | Purpose |
|---|---|
| `lib/db.js` | all database reads, plus label maps and time formatting |
| `app/layout.jsx` | shared header/footer, page metadata |
| `app/page.jsx` | homepage: filters, search, pagination, freshness badges |
| `app/job/[id]/page.jsx` | individual job pages |
| `app/sitemap.js` | ~2,520 URLs for search engines |
| `app/robots.js` | crawler permissions |

SEO from day one: per-job titles and descriptions, a full sitemap, and
**JobPosting structured data** (the hidden JSON that makes a listing eligible
for Google's jobs experience), with `directApply: false` because we link out —
misdeclaring that is a known penalty.

Deployed to **DigitalOcean App Platform** rather than Vercel, for one concrete
reason: Vercel's free tier caps cron at **once per day**, which contradicts a
product whose name is "Early". DigitalOcean's scheduled jobs allow any interval
down to 15 minutes and bill only for runtime.

Domain: GoDaddy nameservers → DigitalOcean, zone created, `earlyaijobs.com`
attached to the app, HTTPS issued automatically.

**Result:** live site, custom domain, working filters and search.

## Day 5 — Production hardening

Before automating anything, GPT's review caught a genuine hazard. The collector
ended with:

```js
await supabase.from("jobs").update({ is_open: false }).lt("last_seen_at", runStarted);
```

One global sweep closing every job not seen this run. If Greenhouse had a bad
afternoon, **every Greenhouse job would be marked closed** and the site would
empty out.

Rebuilt with five protections:

1. **Per-company reconciliation** — only a company whose fetch succeeded can
   have its jobs closed
2. **Failed feeds skipped** — fetch error, 404, or failed write → untouched
3. **Empty feeds skipped** — a successful response with zero jobs is ambiguous,
   not authoritative
4. **40% close ceiling** — if a "successful" fetch would close more than 40% of
   a company's jobs, refuse and log for review
5. **Ordering** — closure is the *last* mutating step, after successful fetch
   AND successful write

Plus a full run report: fetched, new, updated, closed, failures, runtime, and
per-company open counts before → after.

**This paid off within the hour.** The next run hit `TypeError: fetch failed`
on OpenAI's writes. Old code would have closed 746 jobs. New code reported
`[WRITE-FAILED]`, left the data alone, and told us exactly what happened. Root
cause: 500-job batches had become multi-megabyte payloads once descriptions
were stored in full. Fixed with 100-job batches and per-batch retries.

## Day 6 — Automation

Scheduled Job component on DigitalOcean: cron `0 * * * *`, run command
`node run-pipeline.js`, encrypted secrets scoped to that component only.

`run-pipeline.js` runs ingestion, then classification with `--only-new` (so
2,493 existing rows aren't relabelled hourly), then exits — 0 on success, 1 on
failure so the platform can see it.

One build failure, correctly diagnosed: `Failed to collect page data for
/sitemap.xml`. Root cause was deeper than it looked — `lib/db.js` calls
`createClient()` at import time, which throws without credentials, and the job
component legitimately has none. Fixed by making the build resilient
(placeholder fallbacks, sitemap catches its own failures) rather than by
copying keys onto the job. That also protects the website's build from a future
Supabase outage.

---

# PART 2 — CONCEPTS WORTH REMEMBERING

## Data
- **API** — a service's data served for programs instead of eyes
- **JSON** — labelled boxes `{}` and lists `[]`; every value reached by a path
- **ATS** — the platform a company rents to run hiring; publishes public feeds
- **Upsert** — insert if new, update if seen; requires a stable unique key
- **Idempotent** — running twice produces the same state as running once
- **Reconciliation** — comparing what a source says now against what you stored

## Database
- **Postgres / Supabase** — the standard relational database / a host for it
- **Constraint** — a rule the database enforces regardless of application bugs
- **RLS** — per-table access rules; ours: public read, no public write
- **Publishable vs secret key** — browser-safe vs server-only
- **`count: exact, head: true`** — ask the database to count, don't fetch rows
  and tally them (responses are capped at 1,000 rows — this bug shipped)

## Web
- **Next.js server components** — pages rendered on the server, so database
  credentials never reach the browser
- **`revalidate`** — how long a rendered page is cached before regeneration
- **Sitemap / robots.txt** — what to crawl / whether crawling is allowed
- **Structured data (JSON-LD)** — machine-readable facts about a page
- **OG image** — the preview card shown when a link is shared

## Operations
- **Environment variables** — configuration injected at runtime, never
  committed; `.env` locally, encrypted variables in the platform
- **Buildpack** — the platform's automatic build process; runs before any custom
  build command, which is why "just set the build command" often doesn't work
- **Cron expression** — `0 * * * *` = minute 0 of every hour
- **Scheduled job vs worker** — runs and exits (billed per run) vs always-on
- **Exit code** — 0 success, non-zero failure; how platforms detect problems

## Engineering judgment
- **Verify inputs before tuning logic** — the 800-character truncation
- **Prefer refusal to guessing** — the 40% ceiling
- **Order mutations by risk** — read, then write, then destroy
- **Check before you delete** — `select count(*)` with the identical `where`
  clause; it caught the wrong-Supabase-project mistake
- **Falsifiable beats plausible** — a deterministic score you can audit beats a
  model's confident-sounding number

---

# PART 3 — MISTAKES AND WHAT THEY TAUGHT

| Mistake | Lesson |
|---|---|
| Script ran, printed nothing | The file was never saved. Watch the white dot. |
| `cat` with no filename froze the terminal | `Ctrl+C` escapes anything. |
| `SyntaxError: 'companies' already declared` | Errors point: file → line → reason. |
| `Cannot read 'length' of undefined` | The internet is messy; pipelines expect failure. |
| Descriptions truncated at 800 chars | Verify inputs before tuning rules. |
| LLM confidence scores | Every wrong answer came in at 90%+. Unfalsifiable metrics are decoration. |
| Sidebar counts capped at 1,000 | Don't count by fetching. Two numbers on one screen disagreed — that's how it was caught. |
| Global close sweep | One failed feed could have emptied the site. |
| 500-job batches after full descriptions | Batch size is a function of payload size, not row count. |
| Ran SQL against the wrong Supabase project | The count-first habit caught it. |
| Token pasted at a shell prompt | Anything shown anywhere is burned; rotate. |
| Two AIs reviewing each other for two days | Review is valuable; unbounded review is procrastination with a nice hat. |

---

# WHERE THINGS STAND

**Live:** earlyaijobs.com — 2,493 open jobs, 6 companies, 18 categories,
filters, search, freshness badges, individual job pages, sitemap, structured
data.

**Automated:** hourly ingestion and classification, with per-company
reconciliation and refusal logic.

**Cost:** ~$5–7/month plus ~$16/year for the domain. No LLM spend in
production.

**Deliberately not built:** email alerts, dedicated SEO landing routes,
additional companies, monitoring dashboards, accounts. All available later; none
required to ship.
