# EarlyAIJobs — SEO Audit & Plan

**Date:** 24 August 2026
**Author:** Claude (working with Patrick Janody)
**Purpose:** external review before implementation
**Scope:** organic search discoverability. Visual/UX polish is tracked separately.

---

## 0. Context a reviewer needs

**What the site is.** A job board listing every open role at 16 leading AI
companies. Jobs are pulled directly from each employer's public ATS feed
(Greenhouse, Ashby), classified into 19 categories by a deterministic rule
engine, and linked straight to the employer's own application page. The site
never receives an application; it is a discovery layer.

**Current corpus:** 4,251 open jobs · 16 companies · 19 categories · 0
uncategorised · "Other" at 3.3%.

**Stack:** Next.js 15 App Router, server-rendered, Supabase Postgres,
DigitalOcean App Platform. Pages are server components with `revalidate`
windows (homepage 300s, company pages 300s, sitemap 3600s). There is no
client-side rendering of content — everything a crawler needs is in the
initial HTML. This is a genuinely strong starting position for SEO and worth
stating plainly, because most job boards get this wrong.

**Standing project constraints** (these are not negotiable and any proposal
must respect them):

1. No LLM/AI API call in any production path. All classification is
   deterministic rules with a test suite.
2. "Unknown is better than wrong." The site never invents or estimates data.
3. Job descriptions are shown as the employer wrote them. The single exception,
   added 23 Aug, is the removal of a paragraph that contains nothing but an ATS
   requisition code (e.g. `CSQ227R215`).
4. Expired jobs are retained a maximum of 7 days, then deleted.
5. Non-English postings stay in the database but are excluded from public
   display and from the sitemap.

**Deliberate non-goals.** We do not publish salary data (see
`experiments/salary/DECISION.md` — built, measured at 12.6% coverage with 0% on
Anthropic and Databricks, and closed rather than shipped half-working). We are
not adding more companies until the existing 16 are excellent. Reviewers
proposing salary-based SEO plays should know this is a closed decision.

---

## 1. What is already correct

Listing these so review effort goes to real gaps rather than re-proposing
things that exist.

| Area | Status |
|---|---|
| Server-side rendering | All content in initial HTML, no JS required to read a job |
| Canonical host | Apex 301-redirects to `www`; all absolute URLs agree |
| `metadataBase` | Set, so relative canonicals resolve correctly |
| Job page metadata | Per-job `generateMetadata` with title, description, canonical |
| Job page structured data | `JobPosting` JSON-LD, omitted on closed jobs |
| Company page metadata | Per-company title with live job count, description, canonical, OG |
| Static page metadata | `/about` and `/companies` have their own metadata |
| `/saved` | Correctly `noindex` — personal, localStorage-backed |
| `robots.txt` | Allows all, declares sitemap, declares canonical host |
| Sitemap | Paginates correctly (Supabase caps responses at 1,000 rows — this bug was found and fixed), excludes non-English postings, degrades gracefully without DB credentials rather than failing the build |
| OpenGraph image | Generated at build time via `next/og` |
| Logo `alt=""` | Deliberate and correct: the company name appears as adjacent text, so a populated `alt` would make screen readers announce it twice |
| Filter-view metadata | **Shipped 23 Aug** — see §2 |
| Internal linking | Homepage sidebar links every category and company; job pages link to their category and company; "similar jobs" block on each job page |

---

## 2. Recently shipped (23 Aug) — for reviewer awareness

**Problem.** The sitemap advertised ~55 filter URLs (`/?category=engineering`,
`/?country=US`, `/?remote=1`…). `app/page.jsx` had no `generateMetadata`, so
every one of those URLs served the identical title and description inherited
from `app/layout.jsx`. To a crawler they were 55 copies of one page. Google
picks one and discards the rest.

**Fix.** `lib/seo.js` — a pure, database-free module (22 unit tests) that
generates per-view metadata:

- **Unique titles** shaped like real search queries: `AI Engineering Jobs`,
  `Anthropic Jobs`, `Engineering Jobs at OpenAI`, `Remote AI Jobs`,
  `AI Jobs in Canada`.
- **Canonical URLs in fixed parameter order**, so
  `?company=openai&category=sales` and `?category=sales&company=openai`
  resolve to one address instead of competing.
- **Crawl-trap exclusion.** Free-text search (`q`), personal
  "new since last visit" (`since`), time-window filters (`posted`) and pages
  2+ are `noindex, follow`. At 4,251 jobs / 50 per page that is 85 pages per
  filter; `follow` is retained so crawlers still reach job pages.
- **Untrusted input never reaches a `<title>`.** Filter values come from the
  query string and the sitemap actively invites crawlers to this route. Any
  value not present in our known label maps is treated as absent and the view
  is dropped from the index.

The regression test walks every URL the sitemap advertises and asserts no two
produce the same title.

---

## 3. Open gaps, prioritised

Ordered by (impact × confidence) ÷ effort. Each item states the evidence, the
proposed fix, the risk, and how it will be verified.

### P0-1 · The `<h1>` does not change with the filter

**Evidence.** `app/page.jsx:99` renders a hardcoded
`<h1>Fresh jobs from leading AI companies.</h1>` on every view. So
`/?category=engineering` now has the title *"AI Engineering Jobs"* but an `<h1>`
saying *"Fresh jobs from leading AI companies."*

**Why it matters.** The `<h1>` is one of the strongest on-page relevance
signals and the one most likely to be used as the basis of a rewritten SERP
title. A title/`<h1>` mismatch weakens both. We fixed the `<title>` and left
the largest text on the page contradicting it — the job is half-done.

**Fix.** Derive the `<h1>` from the same `lib/seo.js` filter object that
produces the title, plus a sub-line carrying the live result count
(*"1,017 open engineering roles across 16 AI companies"*). Count is already
fetched for the results header; no extra query.

**Risk.** Low. Presentational, no data change.

**Verification.** Extend `test-seo.js` with an `buildHeading()` case per filter
shape; assert heading and title never disagree in subject.

---

### P0-2 · `JobPosting` structured data is incomplete

**Evidence.** `app/job/[id]/page.jsx:99-116`. Present: `title`, `description`,
`datePosted`, `employmentType`, `hiringOrganization`, `jobLocation`,
`jobLocationType`, `directApply`, `url`.

Missing or wrong:

| Field | Issue | Consequence |
|---|---|---|
| `validThrough` | Absent | Google Jobs may keep showing a role after it closes; ours are deleted after 7 days, so the mismatch is real |
| `identifier` | Absent | Recommended by Google; helps de-duplicate against the employer's own posting |
| `hiringOrganization.sameAs` | Absent | We already hold official URLs in `COMPANY_WEBSITES` |
| `hiringOrganization.logo` | Absent | We already hold these in `COMPANY_LOGOS` |
| `jobLocation.address.addressLocality` | Receives raw strings like `"San Francisco, CA; New York, NY"` | Invalid — a multi-location string in a single-locality field. Should emit an array of `Place` objects |
| `jobLocation.address.addressCountry` | Absent | We already have ISO codes in `location_countries` from the v1 normaliser |
| `applicantLocationRequirements` | Absent on remote roles | Google requires it alongside `TELECOMMUTE`; without it remote postings can be rejected |

**Why it matters.** This is the only structured data on the site that can
produce a rich result. Google Jobs is the single largest source of qualified
traffic available to a job board, and it validates strictly — a malformed
`jobLocation` can invalidate the whole entity.

**Fix.** Build the JSON-LD in a new pure module `lib/job-schema.js` (mirroring
the `lib/seo.js` pattern) so it is unit-testable without a database. Populate
every field above from data we already store. `validThrough` = `last_seen_at`
+ 7 days, which is exactly our retention rule, so the claim is true.

**Risk.** Medium — malformed structured data is worse than none. Mitigated by
unit tests plus validation against Google's Rich Results Test before deploy.

**Verification.** Unit tests for each field and each shape (single location,
multi-location, remote, unknown employment type). Then Rich Results Test on
five real URLs: one Anthropic, one Databricks multi-location, one remote
ElevenLabs, one Figure AI manufacturing role, one closed job.

---

### P0-3 · Closed job pages are indexable

**Evidence.** `app/job/[id]/page.jsx:93` computes `isClosed` and correctly
suppresses the JSON-LD, but `generateMetadata` returns no `robots` directive.
A closed job still returns 200 with a full indexable page.

**Why it matters.** Closed jobs leave the sitemap immediately but Google
retains indexed URLs for weeks. A user arriving from search at a dead posting
is a bad experience and a soft-404 signal against the whole domain.

**Fix.** `robots: { index: false, follow: true }` when `is_open === false`.
Keep the page live and useful — it already shows a "this role has closed"
state — but stop competing for rankings.

**Risk.** None.

**Verification.** Fetch a known-closed job URL, assert the `robots` meta tag.

---

### P1-1 · Categories exist only as query parameters

**Evidence.** `app/sitemap.js` emits `/?category=engineering`. There is no
`/jobs/engineering` route.

**Why it matters.** Path URLs outrank query URLs for the same content in
practice, they are linkable and shareable in a way query strings are not, and
a real route can carry unique body copy — an intro paragraph about what
engineering hiring at AI companies actually looks like — which a filter view
cannot justify.

**Proposal.** Add `/jobs/[category]` as a real route that reuses the existing
listing components, with the filter view canonicalising to it. 19 categories ×
16 companies also opens `/jobs/[category]/[company]` later, but **that
combination should not ship in the first pass** — 304 thin pages is a
doorway-page risk, and Google penalises pages that differ only by a filter
value with no unique content.

**Recommendation:** ship the 19 category pages with genuinely distinct intro
copy. Hold the company × category matrix until we can see in Search Console
that the category pages earn impressions.

**Reviewer question:** is 19 category pages with ~150 words of unique copy each
sufficient differentiation, or is that still thin? I lean sufficient given each
page also lists 40–1,000 genuinely different jobs, but I would like a second
opinion.

**Risk.** Medium — this is the item most likely to be over-built into a doorway
farm. Deliberately scoped down.

---

### P1-2 · No `BreadcrumbList` structured data

**Evidence.** `app/job/[id]/page.jsx:135` renders visual breadcrumbs
(All jobs / Category / Company) with correct `aria-label`, but no
corresponding JSON-LD.

**Fix.** Emit `BreadcrumbList` alongside the existing `JobPosting`.

**Why it matters.** Replaces the raw URL in the SERP with a readable hierarchy.
Small but cheap — the data structure is already on the page.

**Risk.** None.

---

### P1-3 · No per-job OpenGraph images

**Evidence.** `app/opengraph-image.jsx` is a single site-wide card. Every
shared job link previews identically.

**Fix.** `app/job/[id]/opengraph-image.jsx` generating a card with job title,
company name and company logo via `next/og`.

**Why it matters.** Not a ranking factor. It is a click-through factor, and it
matters specifically for the LinkedIn posts Patrick is using to promote this.

**Risk.** Low. Watch build time — 4,251 dynamic OG images must be generated on
demand, not at build.

---

### P2-1 · No `ItemList` structured data on listing pages

Marks up the results list so Google understands it as an ordered collection.
Modest benefit; do after P0/P1.

---

### P2-2 · Search Console not yet connected

**Blocked by P0-1 and P0-2 deliberately.** Connecting now would produce a
baseline measured against known-broken markup. Connect once P0 is deployed,
submit the sitemap, and let two weeks of data accumulate before drawing any
conclusion.

**What to watch:** whether the 19 category views get indexed at all; which
queries the company pages attract; coverage errors on `JobPosting`.

---

### P2-3 · Country filter coverage is arbitrary

**Evidence.** `app/sitemap.js` hardcodes 18 country codes. The database
contains more, and the list was chosen by hand.

**Fix.** Emit country URLs for every country with a job count above a
threshold (say 25), derived from `getCountryCounts()`. Removes a hardcoded
list that will drift — the same class of bug as the classifier company-list
drift that silently broke categorisation for 1,630 jobs.

---

## 4. Explicitly rejected

| Idea | Why not |
|---|---|
| Salary-based landing pages | Closed decision; coverage was 12.6% with 0% on Anthropic and Databricks |
| AI-generated job descriptions or summaries | Violates constraint 1 and 3 |
| Company × category matrix pages in pass 1 | 304 near-identical pages is doorway-page risk |
| `rel=next/prev` pagination | Google dropped support in 2019 |
| Indexing paginated views | Crawl trap; 85 pages per filter |
| Keyword-stuffed footer links | Low value, high spam risk |

---

## 5. Proposed sequence

**Batch 1 — correctness (P0).** Dynamic `<h1>`; complete `JobPosting` schema;
`noindex` on closed jobs. All three are corrections to things currently wrong.
Ship together, validate with Rich Results Test.

**Batch 2 — measurement.** Connect Search Console, submit sitemap, wait.

**Batch 3 — expansion (P1).** Category routes with unique copy;
`BreadcrumbList`; per-job OG images.

**Batch 4 — refinement (P2).** `ItemList`; dynamic country list; act on
Search Console data.

Each batch follows the project's existing gate discipline: unit tests →
dry run or local build → review → deploy → verify in production.

---

## 6. Questions for the reviewer

1. **Category pages (P1-1).** Is 19 pages × ~150 words of unique intro copy
   sufficient to avoid a thin-content judgement, given each also lists
   40–1,000 distinct jobs? Should the company × category matrix be ruled out
   permanently rather than deferred?
2. **`validThrough` (P0-2).** We delete expired jobs after 7 days, so
   `last_seen_at + 7 days` is an honest expiry. Is there a reason to prefer a
   shorter window?
3. **Sequencing.** Is there an argument for connecting Search Console *before*
   the P0 fixes, to establish a "before" baseline? My instinct is no — two
   weeks of data about broken markup is not a useful baseline — but I hold
   that loosely.
4. **Anything material missing** from §1's "already correct" list that is in
   fact not correct.
