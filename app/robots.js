// app/robots.js — served at /robots.txt
// Allows everything and points crawlers at the sitemap.

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://earlyaijobs.com/sitemap.xml",
    host: "https://earlyaijobs.com",
  };
}
