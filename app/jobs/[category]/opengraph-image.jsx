// app/jobs/[category]/opengraph-image.jsx — the share card for a category page.
//
// Same design language as the job card (app/job/[id]/opengraph-image.jsx):
// wordmark top-left, one big statement, green URL pill bottom-right. The
// statement here is the category name, and the hook is the live numbers:
// "+18 in the last 48h · 1,022 open roles at leading AI companies".
//
// The 48h figure leads because freshness is the site's whole promise. If a
// category had NO new jobs in the window it is simply omitted — never "+0".
// Counts are live at render time and the image caches (revalidate: 3600), so
// they can lag reality by up to an hour; acceptable drift, never wrong-shaped.

import { ImageResponse } from "next/og";

export const alt = "Job category on EarlyAIJobs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LABELS = {
  engineering: "Engineering", research: "Research", data: "Data", product: "Product",
  design: "Design", infrastructure: "Infrastructure", security: "Security",
  solutions: "Solutions", sales: "Sales", marketing: "Marketing",
  "customer-success": "Customer Success", operations: "Operations",
  "legal-compliance": "Legal & Compliance", policy: "Policy", people: "People",
  finance: "Finance", education: "Education", manufacturing: "Manufacturing", other: "Other",
};
const APPROVED = "(openai,anthropic,scaleai,elevenlabs,databricks,replit,cohere,perplexity,cursor,cognition,mistral,figureai,coreweave,togetherai,sierra,harvey)";

// Head-only count via Supabase REST — no rows travel, same public key the
// site uses. Returns null on any failure; the card then omits that number.
async function countJobs(category, extra = "") {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return null;
  try {
    const url =
      `${base}/rest/v1/jobs?select=id&is_open=eq.true&category=eq.${category}` +
      `&company_name=in.${APPROVED}` +
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
  const { category } = await params;
  const label = LABELS[category];

  let total = null, fresh = null;
  if (label) {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    [total, fresh] = await Promise.all([
      countJobs(category),
      countJobs(category, `&first_published=gte.${since}`),
    ]);
  }

  const title = label ? `AI ${label} Jobs` : "AI jobs, found early";

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
          <div style={{ display: "flex", fontSize: 80, fontWeight: 700, color: "#f2f5f8", lineHeight: 1.1, maxWidth: 1040, marginBottom: 6 }}>
            {title}
          </div>
          {total !== null && (
            <div style={{ display: "flex", fontSize: 40, color: "#e0e6ec", fontWeight: 600 }}>
              {`${total.toLocaleString()} open roles at leading AI companies`}
            </div>
          )}
          {fresh !== null && fresh > 0 && (
            <div style={{ display: "flex", fontSize: 36, color: "#9ccc84", fontWeight: 700 }}>
              {`+${fresh.toLocaleString()} in the last 48 hours`}
            </div>
          )}
        </div>

        {/* Domain pill: a signature, not a billboard — smaller and lighter
            than the first draft after Patrick's review. */}
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
