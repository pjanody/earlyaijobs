# QA run — Codex checklist closure (Gate C→D)

Everything below is **read-only**. No writes, no migration, no push.

## Run these two, in order

```bash
cd ~/earlyaijobs
node test-parsers.js                                    # offline, ~1 second
node --env-file=.env qa-workplace.js > qa-workplace.txt 2>&1
node --env-file=.env diagnose-parsers.js                # regenerates the two report files
```

Then send me `qa-workplace.txt` (and `audit-sample.txt` if you want the conflict rows re-read).

## What each one answers

**`test-parsers.js` — 66 tests, no database, no network, no AI.**
13 are new. Five prove the narrow description rules fire (`#LI-hybrid`, `#LI-remote`,
`#LI-onsite`, "this position can be remote", "3 days a week in the office").
Five prove they *stay silent* on sentences a lazy keyword regex would get wrong —
"tools for remote teams", "a tiny corner office in Berkeley", "onsite with customers
4 days per week", "hybrid cloud architecture". Three prove the ATS field still wins
over the description and that the disagreement is recorded rather than hidden.

**`qa-workplace.js` — the agreement test.**
This is the one Codex was right to demand. I previously said 513 ATS-hybrid jobs and
522 description-hybrid jobs "corroborated" each other. They don't. Two similar totals
prove only that both mechanisms produce a lot of hybrid labels — they say nothing
about whether they agree on *the same job*. This script measures that directly:
take every job where the ATS says hybrid, run the description parser independently,
and report how often it agrees, stays silent, or contradicts. It also breaks every
description-derived label down by which rule produced it, with sample sentences, and
prints full evidence for each conflict (source A, source B, rule ID, matched text,
which precedence won).

## The 79 vs 71 discrepancy — answered

Not a data problem. Both numbers came from one run over one corpus.

The audit sampler assigns each job to **exactly one** stratum — the first one that
claims it — so the conflict stratum only ever saw jobs that "multi-location",
"remote + geography" and "hybrid" hadn't already taken. 79 conflicts exist corpus-wide;
8 were already sampled under earlier strata; 71 were left. The sampler was printing
the leftover count and labelling it "matching", which read like a contradiction.

Fixed: the header now prints all three numbers explicitly —
`N sampled of 71 unclaimed (79 match corpus-wide; 8 already sampled under an earlier stratum)`.

## Still open, deliberately

- **Migration is not run.** Nothing touches the schema until the Gate D precision
  audit comes back clean.
- **The `enablement` classifier fix is committed but not pushed.** Sales-enablement
  jobs still show under Education on the live site. That's a separate one-line push
  plus a reclassification run — say the word and I'll queue it.
