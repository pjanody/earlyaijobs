// app/sitemap.js — tells search engines every URL worth crawling.
//
// Next.js serves this at /sitemap.xml automatically. We list the homepage,
// every category and company filter view, and every individual job page —
// roughly 2,500 URLs. Google's limit is 50,000 per sitemap, so one file is
// plenty for now.

import { createClient } from "@supabase/supabase-js";
import { APPROVED_COMPANIES, CATEGORY_LABELS } from "../lib/db";

// The sitemap is generated at build time, which means the build talks to
// Supabase. Two things can go wrong: credentials absent (the scheduled-job
// component builds this repo too, without the public keys) or the database
// unreachable. Neither should ever fail a deployment — the sitemap simply
// falls back to the static routes and regenerates on the next revalidate.
const hasCredentials =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const supabase = hasCredentials
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  : null;

const BASE = "https://earlyaijobs.com";

export const revalidate = 3600; // regenerate hourly

export default async function sitemap() {
  const entries = [
    { url: BASE, changeFrequency: "hourly", priority: 1 },
  ];

  // Filter views — these are the pages that rank for "remote ai jobs",
  // "ai engineering jobs", "openai jobs" and similar searches.
  for (const slug of Object.keys(CATEGORY_LABELS)) {
    entries.push({
      url: `${BASE}/?category=${slug}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }
  for (const slug of APPROVED_COMPANIES) {
    entries.push({
      url: `${BASE}/?company=${slug}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }
  entries.push({ url: `${BASE}/?remote=1`, changeFrequency: "daily", priority: 0.8 });

  // Every individual job page. Failure here degrades the sitemap; it must
  // never fail the build.
  if (!supabase) {
    console.warn("[sitemap] no Supabase credentials — emitting static routes only");
    return entries;
  }

  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, last_seen_at")
      .eq("is_open", true)
      .in("company_name", APPROVED_COMPANIES)
      .limit(10000);

    if (error) throw new Error(error.message);

    for (const job of data || []) {
      entries.push({
        url: `${BASE}/job/${job.id}`,
        lastModified: job.last_seen_at ? new Date(job.last_seen_at) : undefined,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  } catch (err) {
    console.warn(`[sitemap] could not load job URLs (${err.message}) — emitting static routes only`);
  }

  return entries;
}
