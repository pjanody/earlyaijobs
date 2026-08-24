# Salary extraction — built, measured, closed

**Status:** closed, 23 August 2026
**Outcome:** not shipped. Nothing in this folder is imported by the site or the pipeline.

## What it was

A deterministic parser that reads an employer's own job description and pulls out
the compensation range they published. No LLM call, no market estimate, no
currency conversion, no annualising an hourly rate — in line with the project's
standing rule that classification never depends on an AI service at runtime, and
that "unknown" is always preferable to "wrong".

Scope was deliberately narrow:

- **USD only.** Non-USD pay is detected and recorded but never displayed.
  Showing "€100,000" beside "$100,000" invites a comparison that isn't valid,
  and we don't convert currencies.
- **One range per job.** Databricks publishes the same numbers under four
  "Zone" headings, so identical ranges are de-duplicated first. Genuinely
  different ranges (per-location, per-level) return `ambiguous` and display
  nothing rather than inventing a merged range.
- **Four outcomes:** `parsed`, `non-usd`, `ambiguous`, `none`.

`test-salary.js` holds 24 regression tests, all passing. Over half are false
positive cases — company valuation, ARR, relocation allowance, learning stipend,
401(k) match, equity grant — because publishing someone's relocation budget as
their salary is far worse than publishing nothing.

## Why it was closed

`diagnose-salary.js` is a read-only dry run: it parses every open job and reports
what it *would* store, without writing anything. The full output is in
`salary-dry-run-2026-08-23.md`. Headline numbers across 4,251 open jobs:

| Outcome | Jobs | Share |
|---|---|---|
| parsed | 537 | 12.6% |
| non-usd | 5 | 0.1% |
| ambiguous | 1 | 0.0% |
| none | 3,708 | 87.2% |

The parses it produced looked correct on inspection. The problem was coverage,
and specifically *where* the coverage was missing:

| Company | Parsed |
|---|---|
| CoreWeave | 93.8% |
| Harvey | 55.0% |
| Figure AI | 42.7% |
| **OpenAI** | **1.5%** |
| **Anthropic** | **0.0%** |
| **Databricks** | **0.0%** |

Those three zeros are not those companies declining to publish pay. Anthropic
states an expected salary range on essentially every US posting; Databricks
publishes four Zone ranges and there is a passing test in this folder built from
their exact format; US pay-transparency law compels disclosure in several states
they hire in. A 0% result means the parser was failing to see text that is
definitely present — most likely because the compensation paragraph also contains
words like "equity" and "benefits", which the false-positive filter treats as
disqualifying, and because those paragraphs exceed the 400-character segment cap.

That was a fixable bug. It was not fixed, because at that point the project's
priorities changed: EarlyAIJobs is a showcase of data quality, taxonomy and
product craft, and a compensation field that is silently absent on the three
best-known employers on the site actively undermines that. A salary column that
is blank for Anthropic and OpenAI is worse than no salary column at all — it
reads as missing data rather than as a deliberate boundary.

## What was never built

No database column, no migration, no schema change, no backfill, no API field,
no UI component, no filter, no badge, no `baseSalary` in the JobPosting
structured data. The parser was never run in write mode. **The production
database was never touched by any of this**, so there is nothing to roll back.

## If this is ever revived

1. Start by diagnosing the Anthropic/Databricks/OpenAI misses — dump the
   compensation paragraph for a sample of their postings and find which rule
   discards it. Do not loosen `NOT_COMP` globally to raise the number; that is
   how a relocation allowance ends up displayed as a salary.
2. Re-run `diagnose-salary.js`. Do not consider shipping below roughly 60%
   coverage on the companies that are legally required to disclose.
3. Only then design the schema, and keep the four-state outcome — a
   `salary_status` column is what lets the UI say nothing honestly.
