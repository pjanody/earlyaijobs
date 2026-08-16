# EarlyAIJobs — Launch Classifier Progress Summary

**Status: ready for the full production write, pending approval.**
No LLM calls anywhere in the classification path. Deterministic, title-first, free to re-run.

---

## 1. Approved AI companies (revised)

**Launch list — 6 companies:**
openai · anthropic · scaleai · elevenlabs · databricks · replit

**Removed for launch: mistral, cohere.** Both left Lever; their feeds now return
zero open jobs (cohere: "not found — skipped"; mistral: empty list). Not a
classifier issue — an ingestion one. To be revisited once their current ATS
platform is identified. No other companies added or removed.

---

## 2. What the classifier does

One job: assign a single top-level category from the approved 18.

- **Priority:** strong title rules → description rules only when the title says nothing → `other`
- **Research gate:** requires role-level evidence (research title, or explicit
  research-action phrases such as "conduct research", "publish papers",
  "design experiments"). Company boilerplate — "AI research company", "work
  with researchers" — cannot trigger Research.
- **Longest-match wins:** "machine learning engineer" beats "engineer";
  "infrastructure financing" beats any technical infrastructure phrase.
- **The bare word "infrastructure" is deliberately not a rule**, so
  "Infrastructure Tax Lead" → finance and "Infrastructure Financing" → finance,
  while "ML Infrastructure Engineer" → infrastructure.

**Not present, by design:** confidence scores, placement fit, seniority,
specialization, review queues, AI-direct/AI-enabling, historical-label
comparison, QA architecture. Every job is publishable regardless of category.

---

## 3. Test results

### Test A — 500 jobs (anthropic 357, databricks 143)
`other` rate: **7.6%** (38 jobs)

Distribution: engineering 21.0% · sales 18.6% · solutions 8.6% · research 8.4% ·
operations 8.4% · other 7.6% · marketing 3.8% · finance 3.8% ·
infrastructure 3.6% · product 3.6% · security 3.0% · legal-compliance 2.8% ·
policy 2.0% · data 1.8% · people 1.6% · education 0.8% ·
customer-success 0.4% · design 0.2%

**Four systemic clusters found in the 38 `other` jobs (18 jobs total):**

| Cluster | Count | Assigned to |
|---|---|---|
| Safeguards Enforcement Analyst (Bio Harms, Child Safety, Fraud & Scams, Ban Evasion, …) | 10 | security |
| Deployment Strategist (databricks) | 4 | solutions |
| Alliance RVP (BCG, McKinsey) | 2 | sales |
| Product Support Specialist | 2 | customer-success |

All four rules added. Remaining `other` jobs were genuine one-offs and were
deliberately left alone (Fellows Program ×2, Field CTO, Insider Risk
Investigator, Real Estate Portfolio Manager, Director of Compensation, etc.).

### Test B — stratified sample, untouched companies
15 jobs each from openai, elevenlabs, replit, scaleai (60 jobs;
mistral and cohere returned zero, which is how the ingestion gap was found).

`other` rate: **8.3%** (5 jobs)

Distribution: engineering 30.0% · sales 13.3% · research 10.0% ·
infrastructure 10.0% · other 8.3% · operations 6.7% · product 5.0% ·
data 3.3% · solutions 3.3% · marketing 3.3% · finance 1.7% · people 1.7% ·
policy 1.7% · legal-compliance 1.7%

**Significance:** the `other` rate held at 8.3% on companies whose job titles
were never used to write the rules — close to the 7.6% on the companies they
were derived from. The rules generalise across employer writing styles rather
than being fitted to Anthropic's conventions.

**One systemic cluster found (4 of the 5 `other` jobs, all ScaleAI):**
AI Advisory Consultant · AI Advisory Principal · AI Strategy Consultant,
Frontier Tech → all now classified as **solutions**. ScaleAI runs an advisory
practice, so more of these exist in the full corpus.

**Left as `other` by decision:** "Clean Energy and New Technology Lead"
(OpenAI) and "AI Builder Intern" — genuine one-offs, not a rule gap.

---

## 4. Current state

- Classifier version: `simple-1.1`
- Regression suite: **13/13 passing**, covering every rule added across both tests
- Expected `other` rate after the latest rules: **~4%** (Test A) / **~2%** (Test B)
- Runtime: minutes for the full corpus, $0, re-runnable at any time

## 5. Proposed next step

Run the full production write across the six approved companies:

```
node --env-file=.env classify-simple.js --all --approved --write
```

Every open job from an approved AI company is listed on the website. The
classifier assigns a category; if no rule resolves the job, it becomes `other`
and is still published. Then: build the website.

**Open question for review:** should mistral and cohere be chased down before
launch (finding their current ATS), or is launching with six companies
acceptable?
