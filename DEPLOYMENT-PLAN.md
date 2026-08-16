# EarlyAIJobs — Deployment & Launch Plan

**Status at time of writing:** Next.js web service deploying to DigitalOcean App
Platform from `github.com/pjanody/earlyaijobs` (branch `main`, autodeploy on).
Dataset: 2,493 open jobs from 6 approved AI companies, categorised, in Supabase.

---

## Architecture

```
Greenhouse / Lever / Ashby feeds
            ↓
   upload-jobs.js  (collect, upsert, close vanished)
            ↓
      Supabase Postgres  ← single source of truth
            ↓                        ↑
 classify-simple.js (categories)     │
            ↓                        │
   DO App Platform                   │
     ├── Web Service  (Next.js) ─────┘ reads via publishable key + RLS
     └── Scheduled Job (run-pipeline.js, every 6h, exits when done)
            ↓
     earlyaijobs.com
```

**Key design choices**
- Web service and scheduled job are separate components: the site stays up
  even if a data cycle fails, and the job is billed only while running.
- The site reads with the **publishable** key; RLS permits public SELECT only.
  The **secret** key exists solely on the scheduled job component, encrypted.
- No LLM calls anywhere in production.

---

## Phase A — Verify the deployment

Once the build finishes, open the `*.ondigitalocean.app` URL and confirm:

- [ ] Homepage loads; stats show ~2,493 open jobs / 6 companies / 18 categories
- [ ] Job list renders newest first with "Xh ago" badges
- [ ] Company filters work (OpenAI, Anthropic, Databricks, Scale AI, ElevenLabs, Replit)
- [ ] Category filters work and counts look right
- [ ] Remote filter works
- [ ] Title search works
- [ ] Pagination works past page 1
- [ ] A job detail page loads with description and a working outbound apply link
- [ ] `/sitemap.xml` returns XML with ~2,520 URLs
- [ ] `/robots.txt` returns and references the sitemap
- [ ] Page source of a job page contains `"@type": "JobPosting"`
- [ ] Mobile layout is usable (filters stack above the list under 820px)

**If the site loads but shows zero jobs:** the environment variables were set to
run-time only. `NEXT_PUBLIC_*` values are compiled in at build time — set both
to **Build and Run time** and redeploy.

---

## Phase B — Custom domain

Two options; recommendation is Option 1.

**Option 1 — DigitalOcean manages DNS (recommended).**
1. In DO: Networking → Domains → add `earlyaijobs.com`
2. At Namecheap: Domain → Nameservers → **Custom DNS** →
   `ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`
3. In the App: Settings → Domains → Add Domain → `earlyaijobs.com` (and `www`)
4. DO creates the records and issues the TLS certificate automatically

Why: the apex domain (`earlyaijobs.com` with no `www`) needs an ALIAS-type
record that Namecheap does not support cleanly. Using DO nameservers avoids the
problem entirely and keeps DNS beside the app.

**Option 2 — keep DNS at Namecheap.** Workable but requires a CNAME for `www`
plus a redirect for the apex; more moving parts, no benefit.

Propagation is usually minutes, occasionally hours. Verify:
- [ ] `https://earlyaijobs.com` loads with a valid certificate
- [ ] `https://www.earlyaijobs.com` resolves to the same site
- [ ] `http://` redirects to `https://`

---

## Phase C — Scheduled data pipeline

Add a second component to the same app: **Create → Job**, same repo/branch.

| Setting | Value |
|---|---|
| Component type | Job |
| Trigger | **On a schedule** |
| Schedule | `0 */6 * * *` (00:00, 06:00, 12:00, 18:00 UTC) |
| Build command | `npm install` |
| Run command | `node run-pipeline.js` |
| Instance size | Basic, smallest |

Environment variables — both marked **Encrypted**, run-time scope:

| Key | Value |
|---|---|
| `SUPABASE_URL` | the project URL |
| `SUPABASE_SERVICE_KEY` | the **secret** key (`sb_secret_…`) |

Notes
- Build command is `npm install`, not `npm run build`: this component never
  serves the site, so building Next.js would waste build minutes.
- `run-pipeline.js` runs `upload-jobs.js` then
  `classify-simple.js --all --approved --write`, then exits with code 0, or
  exits 1 on failure so failures surface in DO's alerting.
- DO's minimum schedule interval is 15 minutes; 6 hours is well within limits.

---

## Phase D — Observe one cycle

- [ ] Trigger the job manually (Run Now) rather than waiting for the schedule
- [ ] Logs show `upload-jobs.js` collecting ~6,900 jobs across all platforms
- [ ] Logs show `classify-simple.js` writing ~2,493 categorised jobs
- [ ] Log ends with `cycle complete … exiting cleanly`
- [ ] Site reflects any newly appeared jobs
- [ ] Note the runtime; if it approaches DO's job timeout, split the two steps
      into two scheduled components

---

## Phase E — Design polish (after the above)

Deliberately last: restyling is a low-risk 20-minute change, deployment is not.
Inputs needed from Patrick: colour direction, typography preference, any
reference sites. Current design is intentionally plain and dense.

---

## Phase F — SEO expansion (later, deliberate)

Currently: sitemap, robots.txt, per-job JobPosting structured data, unique
titles/descriptions per job page. Filters remain query strings and are **not**
individually indexable by design.

Next, when we choose to: a small set of dedicated landing routes —
`/companies/openai`, `/jobs/research`, `/remote-ai-jobs` — with unique copy per
page. Not a combinatorial explosion of filter URLs.

---

## Cost

| Component | Monthly |
|---|---|
| Web service (Basic, 512MB, 1 container) | ~$5 |
| Scheduled job (billed only while running, ~10 min/day) | ~$0–2 |
| Supabase | $0 (free tier) |
| Domain | ~$16/yr |
| **Total** | **~$5–7/month** |

---

## Known risks

1. **Job timeout** — if a full cycle exceeds DO's job limit, split ingestion and
   classification into two scheduled components.
2. **Feed drift** — companies change ATS platforms (Cohere and Mistral already
   did). The pipeline skips missing feeds gracefully, but silently. Worth a
   simple alert when a company returns zero jobs two cycles in a row.
3. **Supabase free-tier limits** — fine at 6,900 rows; watch if the company list
   grows substantially.
4. **`revalidate = 300`** — the homepage caches for 5 minutes. Intentional for
   launch; revisit only if freshness feels stale in practice.

---

## Open questions for review

1. After launch, is the priority (a) more companies, (b) SEO landing routes, or
   (c) email alerts? Each is roughly a day of work.
2. Should closed jobs (`is_open = false`) keep their pages live for SEO with a
   "no longer accepting applications" notice, or 404? Google's guidance favours
   removing expired postings, but the pages have accumulated value.
3. Is a "posted within 24h" default filter worth testing, given the brand
   promise is freshness?
