// app/sitemap.js — tells search engines every URL worth crawling.
//
// Next.js serves this at /sitemap.xml automatically. We list the homepage,
// every category and company filter view, and every individual job page —
// roughly 2,500 URLs. Google's limit is 50,000 per sitemap, so one file is
// plenty for now.

import { createClient } from "@supabase/supabase-js";
import { APPROVED_COMPANIES, CATEGORY_LABELS } from "../lib/db";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

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

  // Every individual job page.
  const { data } = await supabase
    .from("jobs")
    .select("id, last_seen_at")
    .eq("is_open", true)
    .in("company_name", APPROVED_COMPANIES)
    .limit(10000);

  for (const job of data || []) {
    entries.push({
      url: `${BASE}/job/${job.id}`,
      lastModified: job.last_seen_at ? new Date(job.last_seen_at) : undefined,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return entries;
}
