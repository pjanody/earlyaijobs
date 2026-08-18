// app/icon.jsx — the favicon (browser tab icon, bookmarks, mobile home screen).
// Next.js generates it and injects the link tags automatically.

import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16224a",
          color: "#7fb069",
          fontSize: 40,
          fontWeight: 700,
          fontFamily: "sans-serif",
          borderRadius: 12,
        }}
      >
        E
      </div>
    ),
    { ...size }
  );
}
