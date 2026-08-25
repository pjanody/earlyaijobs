// app/company/[slug]/opengraph-image.jsx — the share card for a company page.
//
// Third flavor of the shared card language (job, category, company): wordmark
// top-left, "{Company} Jobs" as the statement, live counts stacked beneath,
// green URL pill bottom-right. Social CTR only — no ranking value, and the
// counts follow the same honesty rules as the category card: live at render,
// cached up to an hour, "+0 in 48h" never shown.

import { ImageResponse } from "next/og";

export const alt = "Company jobs on EarlyAIJobs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAMES = {
  openai: "OpenAI", anthropic: "Anthropic", scaleai: "Scale AI",
  elevenlabs: "ElevenLabs", databricks: "Databricks", replit: "Replit",
  cohere: "Cohere", perplexity: "Perplexity", cursor: "Cursor",
  cognition: "Cognition", mistral: "Mistral AI", figureai: "Figure AI",
  coreweave: "CoreWeave", togetherai: "Together AI", sierra: "Sierra", harvey: "Harvey",
};

async function countJobs(slug, extra = "") {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return null;
  try {
    const url =
      `${base}/rest/v1/jobs?select=id&is_open=eq.true&company_name=eq.${slug}` +
      `&or=(posting_language.eq.en,posting_language.is.null,posting_language.eq.und)` +
      extra;
    const res = await fetch(url, {
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const range = res.headers.get("content-range");
    const total = range ? Number(range.split("/")[1]) : NaN;
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

export default async function Image({ params }) {
  const { slug } = await params;
  const name = NAMES[slug];

  let total = null, fresh = null;
  if (name) {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    [total, fresh] = await Promise.all([
      countJobs(slug),
      countJobs(slug, `&first_published=gte.${since}`),
    ]);
  }

  const title = name ? `${name} Jobs` : "AI jobs, found early";

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
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#e8edf2" }}>
            Early<span style={{ color: "#7fb069" }}>AI</span>Jobs
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: "#f2f5f8", lineHeight: 1.1, maxWidth: 1040, marginBottom: 6 }}>
            {title}
          </div>
          {total !== null && (
            <div style={{ display: "flex", fontSize: 40, color: "#e0e6ec", fontWeight: 600 }}>
              {`${total.toLocaleString()} open roles, straight from their career feed`}
            </div>
          )}
          {fresh !== null && fresh > 0 && (
            <div style={{ display: "flex", fontSize: 36, color: "#9ccc84", fontWeight: 700 }}>
              {`+${fresh.toLocaleString()} in the last 48 hours`}
            </div>
          )}
        </div>

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
