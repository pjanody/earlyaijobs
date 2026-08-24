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

// www is the canonical host — the apex domain 301-redirects to it, so every
// URL we hand to crawlers must match or Google logs a redirect per entry.
const BASE = "https://www.earlyaijobs.com";

export const revalidate = 3600; // regenerate hourly

export default async function sitemap() {
  const entries = [
    { url: BASE, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/companies`, changeFrequency: "daily", priority: 0.9 },
  ];

  // Category pages — real routes since Batch C (2026-08-24). These replaced
  // the /?category= query URLs in this sitemap; those still work but
  // canonicalise here, so advertising both would be advertising duplicates.
  for (const slug of Object.keys(CATEGORY_LABELS)) {
    entries.push({
      url: `${BASE}/jobs/${slug}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }
  // Dedicated company pages — the URLs that rank for "anthropic jobs",
  // "openai careers" etc. Higher priority than filter views on purpose.
  for (const slug of APPROVED_COMPANIES) {
    entries.push({
      url: `${BASE}/company/${slug}`,
      changeFrequency: "hourly",
      priority: 0.9,
    });
    entries.push({
      url: `${BASE}/?company=${slug}`,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }
  entries.push({ url: `${BASE}/?remote=1`, changeFrequency: "daily", priority: 0.8 });

  // Country filter views — the pages that rank for "ai jobs canada",
  // "remote ai jobs poland" and similar. Major markets only; the rest are
  // reachable from the homepage sidebar.
  for (const code of ["US", "GB", "CA", "IN", "DE", "FR", "JP", "SG", "AU", "NL", "PL", "IE", "ES", "IT", "BR", "MX", "KR", "SE"]) {
    entries.push({ url: `${BASE}/?country=${code}`, changeFrequency: "daily", priority: 0.7 });
  }

  // Every individual job page. Failure here degrades the sitemap; it must
  // never fail the build.
  if (!supabase) {
    console.warn("[sitemap] no Supabase credentials — emitting static routes only");
    return entries;
  }

  try {
    // Supabase caps every response at 1,000 rows regardless of .limit() —
    // a single query here silently dropped ~60% of job URLs. Paginate.
    // Confirmed non-English postings are excluded: they never render on the
    // site, so advertising them to crawlers would be inviting a soft-404.
    const PAGE = 1000;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, last_seen_at")
        .eq("is_open", true)
        .in("company_name", APPROVED_COMPANIES)
        .or("posting_language.eq.en,posting_language.is.null,posting_language.eq.und")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw new Error(error.message);
      for (const job of data || []) {
        entries.push({
          url: `${BASE}/job/${job.id}`,
          lastModified: job.last_seen_at ? new Date(job.last_seen_at) : undefined,
          changeFrequency: "daily",
          priority: 0.6,
        });
      }
      if (!data || data.length < PAGE) break;
    }
  } catch (err) {
    console.warn(`[sitemap] could not load job URLs (${err.message}) — emitting partial sitemap`);
  }

  return entries;
}
