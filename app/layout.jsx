import "./globals.css";
import ThemeToggle from "./theme-toggle";

export const metadata = {
  // www is the canonical host (the apex redirects to it); every absolute URL
  // in metadata must agree or search engines see a split identity.
  metadataBase: new URL("https://www.earlyaijobs.com"),
  title: "EarlyAIJobs — fresh jobs from leading AI companies",
  description:
    "Every role at leading AI companies — engineering, research, sales, finance, operations and more — sourced directly from company career feeds and updated hourly.",
  openGraph: {
    title: "EarlyAIJobs — fresh jobs from leading AI companies",
    description:
      "Every role at leading AI companies, sourced directly from company career feeds and updated hourly.",
    url: "https://www.earlyaijobs.com",
    siteName: "EarlyAIJobs",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// Runs before the browser paints anything, so a returning light-mode visitor
// never sees a dark flash and vice versa. Dark is the default for new visitors.
const noFlashScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <header className="site">
          <div className="wrap header-inner">
            <div>
              <a href="/" className="brand">
                Early<span>AI</span>Jobs
              </a>
              <div className="tagline">Jobs at AI companies, found early.</div>
            </div>
            <nav className="nav">
              <a href="/">Jobs</a>
              <a href="/companies">Companies</a>
              <a href="/about">About</a>
              <ThemeToggle />
            </nav>
          </div>
        </header>

        {children}

        <footer className="site">
          <div className="wrap footer-inner">
            <div>
              <div className="footer-brand">
                Early<span>AI</span>Jobs
              </div>
              <p>
                Updated hourly from official company career feeds. Applications
                are handled entirely on the employer&apos;s own site.
              </p>
            </div>
            {/* No nav links in the footer at all (Patrick's call) — the
                header already carries Jobs / Companies / About on every
                page, and the sitemap covers crawlers. */}
          </div>
          <div className="wrap copyright">© {new Date().getFullYear()} EarlyAIJobs</div>
        </footer>
      </body>
    </html>
  );
}
