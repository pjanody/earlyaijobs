-- migration-description-html.sql
-- Phase B of the description formatting project. ADDITIVE ONLY.
--
-- RUN THIS IN SUPABASE **BEFORE** PUSHING THE CODE — the ingestion upsert
-- includes description_html, and writing to a column that doesn't exist
-- fails the whole hourly feed run.
--
-- Stores the employer's own HTML (headings, lists, links, emphasis) after
-- passing through our allowlist sanitizer. The existing plain-text
-- `description` column is untouched and remains the classification input
-- and the rendering fallback.

alter table jobs add column if not exists description_html text;
