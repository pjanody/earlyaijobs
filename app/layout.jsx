import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://earlyaijobs.com"),
  title: "EarlyAIJobs — jobs at AI companies, found early",
  description:
    "Every open role at the world's leading AI companies — OpenAI, Anthropic, Databricks, Scale AI, ElevenLabs and Replit — refreshed continuously and sorted newest first.",
  openGraph: {
    title: "EarlyAIJobs — jobs at AI companies, found early",
    description:
      "Every open role at the world's leading AI companies, refreshed continuously and sorted newest first.",
    url: "https://earlyaijobs.com",
    siteName: "EarlyAIJobs",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap">
            <a href="/" className="brand">
              Early<span>AI</span>Jobs
            </a>
            <div className="tagline">Jobs at AI companies, found early.</div>
          </div>
        </header>
        {children}
        <footer className="site">
          <div className="wrap">
            EarlyAIJobs — updated continuously from company job feeds. Listings link
            directly to the employer&apos;s application page.
          </div>
        </footer>
      </body>
    </html>
  );
}
