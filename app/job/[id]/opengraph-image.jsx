// app/job/[id]/opengraph-image.jsx — the share card for a single job.
//
// Next.js serves this at /job/<id>/opengraph-image and wires the og:image
// meta tag automatically. Rendered ON DEMAND and cached — never at build
// time, because pre-rendering 4,000+ PNGs per deploy would be absurd.
//
// Why it exists (SEO plan, Batch D): a shared job link previously showed the
// generic site card. On LinkedIn/X/Slack, a card that names the actual role
// and company is the difference between a click and a scroll-past. This is a
// click-through feature, not a ranking feature.

import { ImageResponse } from "next/og";

export const alt = "Job listing on EarlyAIJobs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Minimal direct read via the public, RLS-limited key — the same access level
// the website itself has. Kept as a plain fetch so the edge bundle stays tiny.
async function fetchJob(id) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key || !/^\d+$/.test(String(id))) return null;
  try {
    const res = await fetch(
      `${base}/rest/v1/jobs?id=eq.${id}&select=title,company_name,location,is_open`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

// Mirrors COMPANY_LABELS for the slugs we list. Duplicated here on purpose:
// importing lib/db.js would drag the Supabase client into the OG bundle.
const NAMES = {
  openai: "OpenAI", anthropic: "Anthropic", scaleai: "Scale AI",
  elevenlabs: "ElevenLabs", databricks: "Databricks", replit: "Replit",
  cohere: "Cohere", perplexity: "Perplexity", cursor: "Cursor",
  cognition: "Cognition", mistral: "Mistral AI", figureai: "Figure AI",
  coreweave: "CoreWeave", togetherai: "Together AI", sierra: "Sierra", harvey: "Harvey",
};

/** First location segment only — "San Francisco, CA; New York, NY" is too
 *  long for a card; "San Francisco, CA +1 more" reads better. */
function shortLocation(raw) {
  const parts = String(raw || "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1 ? `${parts[0]} +${parts.length - 1} more` : parts[0];
}

/** Long titles shrink before they truncate; truly absurd ones get an ellipsis. */
function titleSize(title) {
  const len = title.length;
  if (len <= 45) return 72;
  if (len <= 80) return 58;
  return 48;
}

export default async function Image({ params }) {
  const { id } = await params;
  const job = await fetchJob(id);

  const title = job ? String(job.title).slice(0, 120) + (String(job.title).length > 120 ? "…" : "") : "AI jobs, found early";
  const company = job ? NAMES[job.company_name] || job.company_name : null;
  const location = job ? shortLocation(job.location) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: "64px 72px",
          background: "#0e1420",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#e8edf2" }}>
            Early<span style={{ color: "#7fb069" }}>AI</span>Jobs
          </div>
        </div>

        {/* Job title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              display: "flex", fontSize: titleSize(title), fontWeight: 700,
              color: "#f2f5f8", lineHeight: 1.15, maxWidth: 1040,
            }}
          >
            {title}
          </div>
          {(company || location) && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 38, color: "#c6d0da" }}>
              {company && <span style={{ color: "#9ccc84", fontWeight: 600 }}>{company}</span>}
              {company && location && <span style={{ color: "#4a5461" }}>·</span>}
              {location && <span>{location}</span>}
            </div>
          )}
        </div>

        {/* Footer: just the URL pill. An earlier draft added "Apply directly
            on the employer's site" here — the trust message belongs on the
            page, after the click; on the card it was grey noise competing
            with the title. (Patrick's call, 2026-08-24.) */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <div
            style={{
              display: "flex", padding: "8px 20px", borderRadius: 999,
              border: "2px solid #7fb069", color: "#9ccc84",
              fontSize: 22, fontWeight: 600,
            }}
          >
            earlyaijobs.com
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
