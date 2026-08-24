// test-seo.js — unit tests for per-filter search metadata.
// Run: node test-seo.js      (no database, no browser, no network)
//
// Two things matter more than pretty titles:
//   1. NO TWO INDEXABLE VIEWS MAY SHARE A TITLE. That was the original bug —
//      55 sitemap URLs all served "EarlyAIJobs — fresh jobs from leading AI
//      companies", so search engines treated them as one page. The last test
//      in this file walks every URL the sitemap advertises and proves they are
//      all distinct.
//   2. UNTRUSTED INPUT NEVER REACHES A TITLE. Query strings are attacker
//      controlled and the sitemap invites crawlers to this route.

let mod;
(async () => {
mod = await import("./lib/seo.js");
const {
  readFilters, buildTitle, buildDescription, buildCanonical, isNoindex,
  buildMetadata, buildHeading, buildSubheading,
} = mod;

// Trimmed stand-ins for the real label maps in lib/db.js. Using fakes keeps
// this test independent of the database module.
const LABELS = {
  categories: {
    engineering: "Engineering", research: "Research", sales: "Sales",
    manufacturing: "Manufacturing", "legal-compliance": "Legal & Compliance",
  },
  companies: { openai: "OpenAI", anthropic: "Anthropic", figureai: "Figure AI" },
  countries: { US: "United States", CA: "Canada", GB: "United Kingdom" },
  regions: { europe: "Europe (region-wide)" },
  postedWindows: { 1: "Last 24 hours", 7: "Last 7 days" },
};
const f = (sp) => readFilters(sp, LABELS);

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const assert = (c, m) => { if (!c) throw new Error(m); };

// ---------------- titles ----------------
check("no filters → site title", () => {
  eq(buildTitle(f({}), LABELS), "EarlyAIJobs — fresh jobs from leading AI companies", "title");
});

check("category alone reads as a search phrase", () => {
  eq(buildTitle(f({ category: "engineering" }), LABELS), "AI Engineering Jobs | EarlyAIJobs", "title");
  eq(buildTitle(f({ category: "research" }), LABELS), "AI Research Jobs | EarlyAIJobs", "title");
});

check("company alone leads with the company name", () => {
  // "OpenAI Jobs" is the phrase people type; "AI Jobs at OpenAI" is not.
  eq(buildTitle(f({ company: "openai" }), LABELS), "OpenAI Jobs | EarlyAIJobs", "title");
  eq(buildTitle(f({ company: "figureai" }), LABELS), "Figure AI Jobs | EarlyAIJobs", "two-word name");
  eq(buildTitle(f({ company: "openai", remote: "1" }), LABELS), "Remote OpenAI Jobs | EarlyAIJobs", "remote");
  eq(buildTitle(f({ company: "openai", country: "CA" }), LABELS), "OpenAI Jobs in Canada | EarlyAIJobs", "country");
});

check("company + category drops the redundant 'AI'", () => {
  // "Engineering Jobs at OpenAI", not "AI Engineering Jobs at OpenAI".
  eq(buildTitle(f({ company: "openai", category: "engineering" }), LABELS),
    "Engineering Jobs at OpenAI | EarlyAIJobs", "title");
});

check("remote and country compose", () => {
  eq(buildTitle(f({ remote: "1" }), LABELS), "Remote AI Jobs | EarlyAIJobs", "remote");
  eq(buildTitle(f({ country: "CA" }), LABELS), "AI Jobs in Canada | EarlyAIJobs", "country");
  eq(buildTitle(f({ remote: "1", category: "engineering", country: "CA" }), LABELS),
    "Remote AI Engineering Jobs in Canada | EarlyAIJobs", "all three");
});

check("region codes resolve to their long name", () => {
  eq(buildTitle(f({ country: "europe" }), LABELS),
    "AI Jobs in Europe (region-wide) | EarlyAIJobs", "region");
});

check("labels with punctuation survive intact", () => {
  eq(buildTitle(f({ category: "legal-compliance" }), LABELS),
    "AI Legal & Compliance Jobs | EarlyAIJobs", "ampersand label");
});

// ---------------- untrusted input ----------------
check("unrecognised filter values never reach the title", () => {
  const evil = { category: "<script>alert(1)</script>", company: "'; DROP TABLE jobs;--" };
  const title = buildTitle(f(evil), LABELS);
  eq(title, "EarlyAIJobs — fresh jobs from leading AI companies", "falls back to site title");
  assert(!title.includes("script") && !title.includes("DROP"), "no injected text in title");
});

check("unrecognised values also force noindex", () => {
  assert(isNoindex(f({ category: "not-a-real-category" })), "unknown category noindexed");
  assert(isNoindex(f({ company: "meta" })), "unknown company noindexed");
  assert(isNoindex(f({ country: "ZZ" })), "unknown country noindexed");
  assert(f({ category: "totally-made-up" }).unknown === true, "flagged unknown");
});

check("a valid filter beside an invalid one is still not indexed", () => {
  const r = f({ category: "engineering", company: "not-a-company" });
  eq(r.category, "engineering", "valid one survives for display");
  assert(isNoindex(r), "view still kept out of the index");
});

check("absent filters are not treated as unknown", () => {
  assert(f({}).unknown === false, "empty query is fine");
  assert(!isNoindex(f({})), "homepage is indexable");
});

// ---------------- canonical URLs ----------------
check("canonical uses a fixed parameter order", () => {
  const a = buildCanonical(f({ company: "openai", category: "sales" }));
  const b = buildCanonical(f({ category: "sales", company: "openai" }));
  eq(a, b, "same view, same canonical");
  eq(a, "/?category=sales&company=openai", "order");
});

check("canonical drops non-indexable parameters", () => {
  const c = buildCanonical(f({ category: "sales", q: "python", since: "2026-08-01T00:00:00Z", posted: "7" }));
  eq(c, "/?category=sales", "q, since and posted excluded");
});

check("homepage canonical is /", () => {
  eq(buildCanonical(f({})), "/", "root");
});

check("paginated view is self-canonical and labelled", () => {
  eq(buildCanonical(f({ category: "engineering", page: "3" })), "/?category=engineering&page=3", "page kept");
  eq(buildTitle(f({ category: "engineering", page: "3" }), LABELS),
    "AI Engineering Jobs — Page 3 | EarlyAIJobs", "page in title");
  eq(buildTitle(f({ page: "2" }), LABELS),
    "EarlyAIJobs — fresh jobs from leading AI companies — Page 2", "page on the homepage title");
});

// ---------------- indexability ----------------
check("crawl traps are excluded but still followed", () => {
  assert(isNoindex(f({ q: "engineer" })), "free-text search");
  assert(isNoindex(f({ since: "2026-08-22T00:00:00Z" })), "personal since-view");
  assert(isNoindex(f({ posted: "1" })), "time window");
  assert(isNoindex(f({ page: "2" })), "page 2");
  assert(!isNoindex(f({ page: "1" })), "page 1 indexable");
  const m = buildMetadata({ q: "engineer" }, LABELS);
  eq(m.robots.index, false, "noindex");
  eq(m.robots.follow, true, "still follow — crawlers reach job pages through here");
});

check("the sitemap's own URLs are all indexable", () => {
  for (const sp of [{}, { category: "engineering" }, { company: "anthropic" }, { remote: "1" }, { country: "US" }]) {
    assert(!isNoindex(f(sp)), `should be indexable: ${JSON.stringify(sp)}`);
  }
});

// ---------------- descriptions ----------------
check("description names the actual scope", () => {
  const d = buildDescription(f({ category: "engineering", company: "openai" }), LABELS);
  assert(d.startsWith("Engineering roles at OpenAI,"), `got: ${d}`);
  assert(d.includes("employer's own application page"), "keeps the differentiator");
});

check("description starts with a capital in every branch", () => {
  for (const sp of [{}, { remote: "1" }, { category: "sales" }, { country: "CA" }, { company: "openai" }]) {
    const d = buildDescription(f(sp), LABELS);
    assert(/^[A-Z]/.test(d), `not capitalised for ${JSON.stringify(sp)}: ${d}`);
  }
});

// ---------------- THE REGRESSION THAT STARTED THIS ----------------
check("every URL the sitemap advertises has a UNIQUE title", () => {
  // Mirrors app/sitemap.js: homepage, each category, each company, remote,
  // and each country. If any two collide we are back to the original bug.
  const views = [{}, { remote: "1" }];
  for (const c of Object.keys(LABELS.categories)) views.push({ category: c });
  for (const c of Object.keys(LABELS.companies)) views.push({ company: c });
  for (const c of Object.keys(LABELS.countries)) views.push({ country: c });

  const seen = new Map();
  for (const v of views) {
    const t = buildTitle(f(v), LABELS);
    if (seen.has(t)) {
      throw new Error(`duplicate title "${t}" for ${JSON.stringify(v)} and ${JSON.stringify(seen.get(t))}`);
    }
    seen.set(t, v);
  }
  assert(seen.size === views.length, `${seen.size} titles for ${views.length} views`);
});

check("every sitemap URL also has a unique canonical", () => {
  const views = [{}, { remote: "1" }];
  for (const c of Object.keys(LABELS.categories)) views.push({ category: c });
  for (const c of Object.keys(LABELS.companies)) views.push({ company: c });
  const seen = new Set();
  for (const v of views) {
    const c = buildCanonical(f(v));
    assert(!seen.has(c), `duplicate canonical ${c}`);
    seen.add(c);
  }
});

// ---------------- visible heading agrees with the title ----------------
check("h1 matches the title's subject on every indexable view", () => {
  const views = [{ category: "engineering" }, { company: "openai" }, { remote: "1" },
    { country: "CA" }, { category: "engineering", company: "openai" }];
  for (const sp of views) {
    const fl = f(sp);
    const title = buildTitle(fl, LABELS).replace(/ \| EarlyAIJobs$/, "");
    eq(buildHeading(fl, LABELS), title, `heading for ${JSON.stringify(sp)}`);
  }
});

check("homepage h1 keeps its original sentence", () => {
  eq(buildHeading(f({}), LABELS), "Fresh jobs from leading AI companies.", "root");
});

check("page number never leaks into the h1", () => {
  eq(buildHeading(f({ category: "engineering", page: "3" }), LABELS),
    "AI Engineering Jobs", "no page suffix");
});

check("subheading states the live count and scope", () => {
  eq(buildSubheading(f({ category: "engineering" }), LABELS, 1017),
    "1,017 engineering roles across leading AI companies, sourced directly from company career feeds.", "category");
  eq(buildSubheading(f({ company: "openai" }), LABELS, 750),
    "750 open roles at OpenAI, sourced directly from company career feeds.", "company");
  eq(buildSubheading(f({ remote: "1" }), LABELS, 3),
    "3 remote open roles across leading AI companies, sourced directly from company career feeds.", "remote");
  eq(buildSubheading(f({ category: "sales" }), LABELS, 1),
    "1 sales role across leading AI companies, sourced directly from company career feeds.", "singular");
});

check("subheading refuses bad counts", () => {
  eq(buildSubheading(f({ category: "sales" }), LABELS, NaN), null, "NaN");
  eq(buildSubheading(f({ category: "sales" }), LABELS, -5), null, "negative");
});

check("buildMetadata returns a complete, consistent object", () => {
  const m = buildMetadata({ category: "engineering", company: "openai" }, LABELS);
  eq(m.title, "Engineering Jobs at OpenAI | EarlyAIJobs", "title");
  eq(m.alternates.canonical, "/?category=engineering&company=openai", "canonical");
  eq(m.openGraph.title, m.title, "og title matches");
  eq(m.openGraph.url, m.alternates.canonical, "og url matches canonical");
  eq(m.robots.index, true, "indexable");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
