# EarlyAIJobs — Afternoon Plan

**Milestone reached this morning: earlyaijobs.com is LIVE.**
DigitalOcean App Platform · custom domain with HTTPS · 2,493 jobs from 6 AI
companies · sidebar counts verified correct (Databricks 808, OpenAI 731,
Anthropic 423, ElevenLabs 247, Scale AI 210, Replit 74).

---

## 1. Visual identity — done, pending deploy

Palette taken from a painting Patrick chose: deep indigo and soft sage green.

| Token | Hex | Used for |
|---|---|---|
| indigo-900 | `#16224a` | header bar, headlines |
| indigo-700 | `#22356b` | buttons, active filters, company names, links |
| indigo-500 | `#3d5896` | hover states |
| sage-700 | `#4a7c52` | "fresh" badge text |
| sage-500 | `#7fb069` | brand accent (the "AI" in the wordmark), card hover border |
| sage-200 | `#d9e8d2` | fresh-badge background |
| sage-50 | `#f2f7ef` | hero wash, footer |

Reasoning: indigo carries authority for a site employers will look at; green
already reads as "new", which is the product's core promise. Backgrounds stay
near-white so job titles remain the highest-contrast element — the palette
decorates the frame, never competes with the data.

Changes: dark indigo header bar with sage accent in the wordmark, gradient hero
wash, indigo stat figures, indigo active filters, sage hover borders on job
cards, restyled fresh badges, sage-tinted footer.

---

## 2. Scheduled data pipeline — next

Add a **Job** component to the existing app (same repo/branch).

| Setting | Value |
|---|---|
| Type | Job |
| Trigger | On a schedule |
| Schedule | `0 * * * *` (hourly) — see reasoning below |
| Build command | `npm install` |
| Run command | `node run-pipeline.js` |
| Instance | Basic, smallest |

Encrypted environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

### Frequency decision: hourly, not every 15 minutes

Patrick asked about a 15-minute cadence. DigitalOcean permits it (15 min is the
platform minimum), but:

- **Cost** — jobs bill per second of runtime. A full cycle is 6–10 minutes, so a
  15-minute cadence runs almost continuously and costs roughly what an
  always-on worker costs (~$5–12/mo), losing the advantage of scheduled jobs.
- **No user-visible benefit** — companies don't post continuously. The
  difference between 15 minutes and 60 minutes is invisible to a visitor; the
  difference between an hour and a day is not.
- **Politeness / rate limits** — 96 full scrapes per day against Greenhouse,
  Lever and Ashby public feeds is aggressive. 24 is reasonable.

**Optimisation shipped to make frequency cheap:** `classify-simple.js` now
supports `--only-new`, classifying only jobs whose category is null instead of
re-labelling all 2,493 every cycle. `run-pipeline.js` uses it. Expected cycle
time drops from ~8 minutes to ~4. A full re-classification remains available by
hand whenever rules change:

```
node --env-file=.env classify-simple.js --all --approved --write
```

If hourly proves cheap in practice, 30 minutes is a reasonable next step.

---

## 3. Verification after the job is added

- [ ] Trigger manually ("Run Now") rather than waiting for the schedule
- [ ] Logs show ingestion across Greenhouse, Lever and Ashby
- [ ] Logs show classification touching only new jobs
- [ ] Ends with `cycle complete … exiting cleanly`
- [ ] Note total runtime — informs whether to increase frequency
- [ ] Confirm `www.earlyaijobs.com` resolves and has a valid certificate

---

## 4. Remaining polish (in priority order)

1. **Favicon and OG image** — the link preview when EarlyAIJobs is shared on
   LinkedIn. Matters this week specifically, since a launch post is planned.
2. **Empty-state and error copy** — currently minimal.
3. **`/about` page** — what the site is, which companies are covered, how often
   it updates. Also useful for SEO trust signals.
4. **Company logos** in job rows — visual weight, moderate effort.

---

## 5. Deliberately deferred

- Dedicated SEO landing routes (`/companies/openai`, `/remote-ai-jobs`)
- Email alerts
- Additional companies beyond the approved six
- Re-adding Mistral and Cohere once their current ATS is identified
- Any further classifier work — 3.4% `other` is fine for launch

---

## Open questions for review

1. Hourly vs 30-minute cadence once we see real cycle runtime?
2. Should expired jobs (`is_open = false`) keep their pages live with a "no
   longer accepting applications" notice, or 404?
3. Launch post timing — the LinkedIn plan called for a Wednesday launch post;
   the site is live now. Post immediately, or wait until the scheduled pipeline
   has demonstrably run unattended for a day?
