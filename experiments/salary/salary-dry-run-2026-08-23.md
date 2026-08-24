EarlyAIJobs — salary extraction dry run (READ-ONLY) · 4251 open jobs

==============================================================================
1. OVERALL
==============================================================================
  parsed    : 537 (12.6%)   ← would display a salary
  non-usd   : 5 (0.1%)   ← pay disclosed in another currency; recorded, never displayed
  ambiguous : 1 (0.0%)   ← pay mentioned, not safely parseable; display nothing
  none      : 3708 (87.2%)   ← employer disclosed no pay

==============================================================================
2. BY COMPANY
==============================================================================
company       parsed  nonUSD  ambig   none    total   parsed%
openai            11       0      0    739     750   1.5%
anthropic          0       0      0    518     518   0.0%
scaleai            6       0      0    202     208   2.9%
elevenlabs         0       0      0    254     254   0.0%
databricks         0       0      0    820     820   0.0%
replit             0       0      0     71      71   0.0%
cohere             5       1      1    143     150   3.3%
perplexity         1       0      0     99     100   1.0%
cursor             0       0      0    113     113   0.0%
cognition          0       0      0     84      84   0.0%
mistral            0       0      0    166     166   0.0%
figureai          53       1      0     70     124   42.7%
coreweave        259       2      0     15     276   93.8%
togetherai         4       0      0     60      64   6.3%
sierra             0       0      0    193     193   0.0%
harvey           198       1      0    161     360   55.0%

==============================================================================
3. DISTRIBUTIONS (parsed only)
==============================================================================
currency: {"USD":537}
period  : {"hour":26,"year":511}
open-ended (from/up-to): 0
OTE mentioned anywhere : 963

annual ranges (511 jobs):
  min  p10 115,000 · median 165,000 · p90 230,000
  max  p10 163,700 · median 242,000 · p90 333,000
  lowest parsed  : 60,000
  highest parsed : 445,000

==============================================================================
4. PARSED SAMPLE — does the number match the source text? — 20 of 537
==============================================================================

[5119] scaleai — Growth Recruiter, High Volume - Contract
  PARSED : $40–$55 / hour   [USD hour]
  SOURCE : …$40 to $55…
  VERDICT: ____________

[438575] figureai — Data Strategy Associate
  PARSED : $100K–$180K / year   [USD year]
  SOURCE : …The US base salary range for this full-time position is between $100,000 - $180,000 annually.…
  VERDICT: ____________

[438628] figureai — Lead, Data Quality - Partnerships
  PARSED : $120K–$180K / year   [USD year]
  SOURCE : …The US base salary range for this full-time position is between $120,000 – $180,000 annually.…
  VERDICT: ____________

[438695] coreweave — Account Manager - Engaged - New York
  PARSED : $165K–$205K / year   [USD year]
  SOURCE : …The base salary range for this role is $165,000 to $205,000.…
  VERDICT: ____________

[438723] coreweave — Data Center Technician - Dalton, GA 
  PARSED : $65K–$83K / year   [USD year]
  SOURCE : …The base salary range for this role is $65,000 to $83,000.…
  VERDICT: ____________

[438750] coreweave — Engineering Manager, Observability
  PARSED : $182K–$242K / year   [USD year]
  SOURCE : …The base salary range for this role is $182,000 to $242,000.…
  VERDICT: ____________

[438778] coreweave — Manager, Utility & Energy
  PARSED : $143K–$210K / year   [USD year]
  SOURCE : …The base salary range for this role is $143,000 to $210,000.…
  VERDICT: ____________

[438804] coreweave — Senior Accountant, Accounts Payable
  PARSED : $98K–$130K / year   [USD year]
  SOURCE : …The base salary range for this role is $98,000 to $130,000.…
  VERDICT: ____________

[438832] coreweave — Senior Manager, SOX-Business Process
  PARSED : $135K–$198K / year   [USD year]
  SOURCE : …The base salary range for this role is $135,000 to $198,000 The starting salary will be determined based on job-related knowledge, skills, experience, and market location.…
  VERDICT: ____________

[438858] coreweave — Senior Software Engineer- Billing Product
  PARSED : $182K–$242K / year   [USD year]
  SOURCE : …The base salary range for this role is $182,000 to $242,000.…
  VERDICT: ____________

[438886] coreweave — Senior Systems Engineer, CKS Performance
  PARSED : $182K–$242K / year   [USD year]
  SOURCE : …The base salary range for this role is $182,000 to $242,000.…
  VERDICT: ____________

[438913] coreweave — Staff Applied Research Engineer
  PARSED : $207K–$275K / year   [USD year]
  SOURCE : …The base salary range for this role is $207,000 to $275,000.…
  VERDICT: ____________

[438941] coreweave — Staff Storage Engineer, File & Block
  PARSED : $207K–$303K / year   [USD year]
  SOURCE : …The base salary range for this role is $207,000 to $303,000.…
  VERDICT: ____________

[500822] togetherai — Research Engineer, Post-Training Inference
  PARSED : $200K–$290K / year   [USD year]
  SOURCE : …The US base salary range for this full-time position is $200,000 - $290,000.…
  VERDICT: ____________

[502806] harvey — People Business Partner, Product & Design
  PARSED : $165K–$248K / year   [USD year]
  SOURCE : …Compensation $165,400 - $248,200 USD Depending on your location, an Applicant Privacy Notice may apply to you.…
  VERDICT: ____________

[502852] harvey — Majors Customer Success Manager
  PARSED : $180K–$210K / year   [USD year · OTE mentioned]
  SOURCE : …Compensation Range $180,000-$210,000 OTE with an 80/20 split Depending on your location, an Applicant Privacy Notice may apply to you.…
  VERDICT: ____________

[502894] harvey — Legal Engineering Manager (Law Firm, Corporate)
  PARSED : $315K–$385K / year   [USD year · OTE mentioned]
  SOURCE : …Compensation $315,000 - $385,000 USD OTE 75/25 Split Depending on your location, an Applicant Privacy Notice may apply to you.…
  VERDICT: ____________

[502937] harvey — Director, IT
  PARSED : $224K–$336K / year   [USD year]
  SOURCE : …Compensation $224,000 - $336,000 USD Depending on your location, an Applicant Privacy Notice may apply to you.…
  VERDICT: ____________

[502978] harvey — Senior or Staff User Researcher
  PARSED : $159K–$265K / year   [USD year]
  SOURCE : …Compensation $158,500 - $264,500 Depending on your location, an Applicant Privacy Notice may apply to you.…
  VERDICT: ____________

[503026] harvey — Senior Product Manager, Command Center
  PARSED : $178K–$267K / year   [USD year]
  SOURCE : …Compensation $177,700 - $266,500 USD Depending on your location, an Applicant Privacy Notice may apply to you.…
  VERDICT: ____________

==============================================================================
5. AMBIGUOUS SAMPLE — should any of these be parseable? — 1 of 1
==============================================================================

[433213] cohere — Senior Software Engineer, Agent Infrastructure
  PARSED : (nothing displayed)   [? ?]
  SOURCE : …$215,000 – $325,000 | $180,000 – $275,000 | $260,000 – $385,000…
  VERDICT: ____________

==============================================================================
5b. NON-USD SAMPLE — correctly withheld from display — 5 of 5
==============================================================================

[433248] cohere — Senior Account Executive, Germany PUBSEC (Berlin, Germany)
  PARSED : (nothing displayed)   [EUR year · OTE mentioned]
  SOURCE : …€200,000 - €300,000…
  VERDICT: ____________

[438593] figureai — Firmware Integration Engineer, Asia
  PARSED : (nothing displayed)   [JPY year]
  SOURCE : …¥600,000 – ¥1,000,000…
  VERDICT: ____________

[438693] coreweave — Account Manager - Engaged
  PARSED : (nothing displayed)   [CAD year]
  SOURCE : …CA$165,000 to CA$205,000…
  VERDICT: ____________

[438881] coreweave — Senior Specialist Field Engineer - Networking
  PARSED : (nothing displayed)   [GBP year]
  SOURCE : …98,000 to 130,000…
  VERDICT: ____________

[503012] harvey — Mid-Market Customer Success Manager
  PARSED : (nothing displayed)   [CAD year · OTE mentioned]
  SOURCE : …$125,000 - $145,000…
  VERDICT: ____________

==============================================================================
6. FALSE-POSITIVE HUNT — parsed jobs with 6+ currency symbols
==============================================================================

[433201] cohere — Senior Account Executive - US Public Sector (Civilian a  (6 currency symbols)
  PARSED : $230K–$430K / year
  SOURCE : …For candidates in the US, the Compensation Range is: $230,000 – $430,000 [USD] The figure above represents On-Target Earnings (OTE).…
  VERDICT: ____________

[433246] cohere — Senior Account Executive, Federal Defense and Intellige  (6 currency symbols)
  PARSED : $230K–$430K / year
  SOURCE : …For candidates in the US, the Compensation Range is: $230,000 – $430,000 [USD] The figure above represents On-Target Earnings (OTE).…
  VERDICT: ____________

[433247] cohere — Account Executive, SLED (US)  (6 currency symbols)
  PARSED : $230K–$430K / year
  SOURCE : …For candidates in the US, the Compensation Range is: $230,000 – $430,000 [USD] The figure above represents On-Target Earnings (OTE).…
  VERDICT: ____________

[433249] cohere — Senior Account Executive, Latin America Federal (US)  (6 currency symbols)
  PARSED : $230K–$430K / year
  SOURCE : …For candidates in the US, the Compensation Range is: $230,000 – $430,000 [USD] The figure above represents On-Target Earnings (OTE).…
  VERDICT: ____________

Nothing was written. Review, then approve the backfill.
