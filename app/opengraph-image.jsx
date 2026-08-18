// app/opengraph-image.jsx
// The preview card shown when earlyaijobs.com is shared on LinkedIn, X,
// Slack, iMessage. Next.js serves this automatically at /opengraph-image
// and wires up the meta tags. Generated at build time — no design tool,
// no image file to maintain.

import { ImageResponse } from "next/og";

export const alt = "EarlyAIJobs — every open job at the leading AI companies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#16224a",
          padding: "70px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* wordmark */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 38, fontWeight: 700, color: "#ffffff" }}>
          Early<span style={{ color: "#7fb069" }}>AI</span>Jobs
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: 900,
            }}
          >
            Every open job at the leading AI companies.
          </div>
          <div style={{ fontSize: 30, color: "#a9b6d4", marginTop: 24 }}>
            OpenAI · Anthropic · Databricks · Scale AI · ElevenLabs · Replit
          </div>
        </div>

        {/* footer strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#d9e8d2",
              color: "#2f5c37",
              fontSize: 26,
              fontWeight: 700,
              padding: "10px 22px",
              borderRadius: 40,
            }}
          >
            2,500+ jobs · refreshed continuously
          </div>
          <div style={{ fontSize: 28, color: "#7fb069", fontWeight: 600 }}>earlyaijobs.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
