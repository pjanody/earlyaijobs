/** @type {import('next').NextConfig} */
const nextConfig = {
  // Our Node scripts (upload-jobs.js, classify-simple.js) live at the repo
  // root alongside the app. They are not part of the Next build.
  eslint: { ignoreDuringBuilds: true },

  // CANONICAL HOST: www.earlyaijobs.com
  //
  // Both hostnames were serving 200 with identical content — every page
  // existed at two URLs, which splits search-engine signals and lets shared
  // links disagree about which site is "real". www is canonical because it
  // is what every canonical tag, the sitemap, robots.txt, and the JobPosting
  // structured data already declare.
  //
  // 308 = permanent redirect that preserves the request method. The apex now
  // sends visitors and crawlers to the one true host, path and query intact.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "earlyaijobs.com" }],
        destination: "https://www.earlyaijobs.com/:path*",
        permanent: true,
      },
    ];
  },

  // Security headers. The site takes no user input, hosts no applications,
  // and stores nothing server-side, so this is mostly about not being framed
  // and not leaking referrers to employer sites.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
