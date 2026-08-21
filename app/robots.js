// app/robots.js — served at /robots.txt
// Allows everything and points crawlers at the sitemap.

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://www.earlyaijobs.com/sitemap.xml",
    host: "https://www.earlyaijobs.com",
  };
}
