-- EarlyAIJobs deterministic classifier v1 migration
-- DO NOT RUN YET. Review first. IF NOT EXISTS makes it safe to rerun.
--
-- IMPORTANT CHANGE vs the original draft:
-- the deterministic score is stored in deterministic_confidence (0-100 int).
-- The existing classification_confidence column is LEFT UNTOUCHED because it
-- holds historical LLM self-reported values on a 0-1 scale. Two different
-- concepts must never share one column.

alter table jobs
  add column if not exists deterministic_confidence int,
  add column if not exists classification_band text,
  add column if not exists placement_fit_score int,
  add column if not exists classification_signals jsonb,
  add column if not exists confidence_components jsonb,
  add column if not exists category_score int,
  add column if not exists category_runner_up text,
  add column if not exists category_runner_up_score int,
  add column if not exists specialization_score int,
  add column if not exists specialization_runner_up text,
  add column if not exists specialization_runner_up_score int,
  add column if not exists informational_flags jsonb,
  add column if not exists classifier_version text,
  add column if not exists confidence_scorer_version text;

-- Optional integrity checks. Run only if existing data already conforms.
-- alter table jobs add constraint jobs_deterministic_confidence_range
--   check (deterministic_confidence is null or deterministic_confidence between 0 and 100);
--
-- alter table jobs add constraint jobs_placement_fit_score_range
--   check (placement_fit_score is null or placement_fit_score between 0 and 100);
