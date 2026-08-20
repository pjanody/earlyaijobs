-- migration-v1-location-remote.sql
-- ADDITIVE ONLY. No column is dropped, renamed, or overwritten.
-- Run in the Supabase SQL editor ONLY after Patrick approves the v1-report.
--
-- Adds the four fields v1 filtering depends on (section 8 of the plan).

alter table jobs add column if not exists is_remote boolean;              -- true/false/NULL — NULL means "cannot confirm", never "on-site"
alter table jobs add column if not exists remote_source text;             -- invariant: is_remote = true ⇒ remote_source is not null
alter table jobs add column if not exists location_countries text[] not null default '{}';
alter table jobs add column if not exists location_region_codes text[] not null default '{}';
alter table jobs add column if not exists posting_language text;          -- 'en', 'ja', … ; only 'en' publishes

-- The two queries the site will actually run:
--   countries filter:  where location_countries @> array['CA']
--   remote checkbox :  where is_remote = true
create index if not exists jobs_location_countries_gin on jobs using gin (location_countries);
create index if not exists jobs_is_remote_idx on jobs (is_remote) where is_remote = true;
create index if not exists jobs_posting_language_idx on jobs (posting_language);
