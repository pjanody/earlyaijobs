// build-boilerplate.js
// Builds a per-company boilerplate dictionary from the corpus itself.
// No LLM. No hand-maintained phrase lists. Read-mostly: writes only to the
// company_boilerplate table, never to jobs.
//
// USAGE
//   node --env-file=.env build-boilerplate.js --dry-run     (inspect only)
//   node --env-file=.env build-boilerplate.js --write       (persist)
//   node --env-file=.env build-boilerplate.js --write --company anthropic
//
// METHOD
//   A line is company boilerplate when it appears in >= MIN_SHARE of an
//   employer's postings AND across at least MIN_ROLE_FAMILIES distinct role
//   families.
//
//   The second condition is the important one. Employers post many
//   near-identical roles (eight "Commercial Counsel" postings, forty
//   "Account Executive" variants). Their shared responsibilities would clear
//   a frequency threshold on their own — and deleting them would destroy the
//   exact evidence the classifier needs. True company boilerplate ("Our
//   mission is...", EEO statements) appears under every kind of role, so
//   requiring breadth across role families separates the two cases.
//
//   Employers with fewer than MIN_CORPUS postings are skipped entirely:
//   too small a sample to distinguish boilerplate from coincidence. Those
//   companies rely on heading-based extraction instead.

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BOILERPLATE_VERSION = "1.0";
const MIN_SHARE = 0.30;        // line must appear in >= 30% of postings
const MIN_ROLE_FAMILIES = 3;   // ...spanning >= 3 distinct role families
const MIN_CORPUS = 20;         // skip employers with fewer postings than this
const MIN_LINE_CHARS = 25;     // ignore short fragments ("Benefits", "Apply")
const PAGE = 1000;

function parseArgs(argv) {
  const args = argv.slice(2);
  const write = args.includes("--write");
  const only = args.includes("--company") ? args[args.indexOf("--company") + 1] : null;
  return { write, dryRun: !write, only };
}

// Normalised "role family" = the functional head of the title, with seniority
// and org qualifiers stripped. "Senior Commercial Counsel, EMEA" -> "counsel".
const LEVEL_WORDS = /\b(senior|sr|junior|jr|staff|principal|lead|head|chief|vp|vice president|director|manager|associate|intern|global|regional|deputy)\b/gi;
const FAMILY_HEADS = [
  "counsel","attorney","engineer","scientist","researcher","designer","recruiter",
  "accountant","controller","analyst","architect","manager","specialist","advocate",
  "consultant","administrator","coordinator","representative","executive","partner",
  "strategist","marketer","writer","editor","technician","operator","officer","lead",
];

function roleFamily(title) {
  const t = String(title || "").toLowerCase().replace(LEVEL_WORDS, " ").replace(/[^a-z ]/g, " ");
  for (const head of FAMILY_HEADS) if (t.includes(head)) return head;
  // Fall back to the first two meaningful words so unusual titles still group.
  const words = t.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ") || "unknown";
}

function normaliseLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

async function fetchAllCompanies() {
  const seen = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("jobs").select("company_name").eq("is_open", true).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    for (const r of data) seen.set(r.company_name, (seen.get(r.company_name) || 0) + 1);
    if (data.length < PAGE) break;
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]);
}

async function fetchCompanyJobs(slug) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("jobs").select("id, title, description")
      .eq("company_name", slug).eq("is_open", true).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

function detect(jobs) {
  // line -> { count, families:Set }
  const stats = new Map();
  for (const job of jobs) {
    const family = roleFamily(job.title);
    const lines = new Set(
      String(job.description || "").split("\n")
        .map(normaliseLine)
        .filter(l => l.length >= MIN_LINE_CHARS)
    );
    for (const line of lines) {
      if (!stats.has(line)) stats.set(line, { count: 0, families: new Set() });
      const s = stats.get(line);
      s.count++;
      s.families.add(family);
    }
  }

  const cutoff = Math.ceil(jobs.length * MIN_SHARE);
  const boilerplate = [];
  const rejectedForBreadth = [];

  for (const [line, s] of stats) {
    if (s.count < cutoff) continue;
    if (s.families.size >= MIN_ROLE_FAMILIES) {
      boilerplate.push({ line, count: s.count, families: s.families.size });
    } else {
      // Frequent but confined to one or two role families: almost certainly
      // duplicated role content, NOT company boilerplate. Never remove it.
      rejectedForBreadth.push({ line, count: s.count, families: s.families.size });
    }
  }
  boilerplate.sort((a, b) => b.count - a.count);
  rejectedForBreadth.sort((a, b) => b.count - a.count);
  return { boilerplate, rejectedForBreadth, cutoff };
}

async function persist(slug, jobsCount, entries) {
  // Replace this company's dictionary wholesale so stale lines never linger.
  const { error: delErr } = await supabase
    .from("company_boilerplate").delete().eq("company_name", slug);
  if (delErr) throw new Error(`delete ${slug}: ${delErr.message}`);
  if (!entries.length) return;

  const rows = entries.map(e => ({
    company_name: slug,
    line: e.line,
    occurrences: e.count,
    role_families: e.families,
    corpus_size: jobsCount,
    boilerplate_version: BOILERPLATE_VERSION,
    detected_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("company_boilerplate").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`insert ${slug}: ${error.message}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`Boilerplate builder v${BOILERPLATE_VERSION}`);
  console.log(`Mode: ${opts.write ? "WRITE" : "DRY RUN (no database changes)"}`);
  console.log(`Rule: line in >=${MIN_SHARE * 100}% of postings AND >=${MIN_ROLE_FAMILIES} role families | min corpus ${MIN_CORPUS} | min line ${MIN_LINE_CHARS} chars\n`);

  const companies = await fetchAllCompanies();
  let totalLines = 0, skipped = 0, protectedLines = 0;

  for (const [slug, count] of companies) {
    if (opts.only && slug !== opts.only) continue;

    if (count < MIN_CORPUS) {
      console.log(`— ${slug.padEnd(14)} ${String(count).padStart(4)} jobs  · SKIPPED (corpus below ${MIN_CORPUS}; heading extraction only)`);
      skipped++;
      continue;
    }

    const jobs = await fetchCompanyJobs(slug);
    const { boilerplate, rejectedForBreadth, cutoff } = detect(jobs);
    totalLines += boilerplate.length;
    protectedLines += rejectedForBreadth.length;

    console.log(`\n=== ${slug}  (${jobs.length} jobs · line must appear >= ${cutoff} times) ===`);
    console.log(`  boilerplate lines detected : ${boilerplate.length}`);
    for (const b of boilerplate.slice(0, 5)) {
      console.log(`    [${b.count}x, ${b.families} families] ${b.line.slice(0, 95)}${b.line.length > 95 ? "…" : ""}`);
    }
    if (rejectedForBreadth.length) {
      console.log(`  PROTECTED (frequent but only 1-2 role families — duplicate role text, not boilerplate): ${rejectedForBreadth.length}`);
      for (const r of rejectedForBreadth.slice(0, 3)) {
        console.log(`    [${r.count}x, ${r.families} family] ${r.line.slice(0, 90)}${r.line.length > 90 ? "…" : ""}`);
      }
    }

    if (opts.write) {
      await persist(slug, jobs.length, boilerplate);
      console.log(`  → written to company_boilerplate`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Companies processed : ${companies.length - skipped}`);
  console.log(`Companies skipped   : ${skipped} (corpus < ${MIN_CORPUS})`);
  console.log(`Boilerplate lines   : ${totalLines}`);
  console.log(`Protected lines     : ${protectedLines}  (would have been wrongly removed by naive frequency alone)`);
  if (!opts.write) console.log(`\nDRY RUN — nothing was written. Re-run with --write to persist.`);
}

main().catch(err => {
  console.error(`\nSTOPPED: ${err.message || err}`);
  process.exit(1);
});
