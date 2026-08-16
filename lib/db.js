// lib/db.js — read-only data access for the website.
//
// Uses the PUBLISHABLE key, never the secret one. Row Level Security on the
// jobs table allows public SELECT and nothing else, so this key can safely
// ship to the browser and appear in the repo's environment config.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// Only these companies appear on the site.
export const APPROVED_COMPANIES = [
  "openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit",
];

export const COMPANY_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  scaleai: "Scale AI",
  elevenlabs: "ElevenLabs",
  databricks: "Databricks",
  replit: "Replit",
};

export const CATEGORY_LABELS = {
  engineering: "Engineering",
  research: "Research",
  data: "Data",
  product: "Product",
  design: "Design",
  infrastructure: "Infrastructure",
  security: "Security",
  solutions: "Solutions",
  sales: "Sales",
  marketing: "Marketing",
  "customer-success": "Customer Success",
  operations: "Operations",
  "legal-compliance": "Legal & Compliance",
  policy: "Policy",
  people: "People",
  finance: "Finance",
  education: "Education",
  other: "Other",
};

const SELECT = "id, title, company_name, location, url, category, workplace_type, " +
  "employment_type, first_published, first_seen_at";

/** Jobs list with optional filters. */
export async function getJobs({ category, company, remote, q, page = 1, perPage = 50 } = {}) {
  let query = supabase
    .from("jobs")
    .select(SELECT, { count: "exact" })
    .eq("is_open", true)
    .in("company_name", APPROVED_COMPANIES);

  if (category) query = query.eq("category", category);
  if (company) query = query.eq("company_name", company);
  if (remote === "1") query = query.eq("workplace_type", "remote");
  if (q) query = query.ilike("title", `%${q}%`);

  const from = (page - 1) * perPage;
  query = query
    .order("first_published", { ascending: false, nullsFirst: false })
    .range(from, from + perPage - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { jobs: data || [], total: count || 0 };
}

/** One job, for the detail page. */
export async function getJob(id) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company_name, location, url, category, workplace_type, employment_type, description, first_published, first_seen_at")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

/** Counts per category, for the filter sidebar. */
export async function getCategoryCounts() {
  const { data, error } = await supabase
    .from("jobs")
    .select("category")
    .eq("is_open", true)
    .in("company_name", APPROVED_COMPANIES)
    .limit(10000);
  if (error) return {};
  const counts = {};
  for (const row of data || []) {
    const c = row.category || "other";
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/** Counts per company. */
export async function getCompanyCounts() {
  const { data, error } = await supabase
    .from("jobs")
    .select("company_name")
    .eq("is_open", true)
    .in("company_name", APPROVED_COMPANIES)
    .limit(10000);
  if (error) return {};
  const counts = {};
  for (const row of data || []) {
    counts[row.company_name] = (counts[row.company_name] || 0) + 1;
  }
  return counts;
}

/** "3h ago" / "2d ago" — the freshness signal that gives the site its name. */
export function timeAgo(dateString) {
  if (!dateString) return null;
  const then = new Date(dateString).getTime();
  const hours = Math.floor((Date.now() - then) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Jobs posted within the last 48 hours get the "new" treatment. */
export function isFresh(dateString) {
  if (!dateString) return false;
  return Date.now() - new Date(dateString).getTime() < 48 * 3600000;
}
