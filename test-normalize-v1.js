// test-normalize-v1.js — offline tests for the v1 frozen-scope normalizer.
// Run: node test-normalize-v1.js     (no database, no network, no AI)
//
// These encode the decisions Patrick accepted on 2026-08-20. If one of these
// fails after an edit, the edit broke an agreed rule — not a "flaky test".

const { normalizeV1 } = require("./normalize-v1");

let pass = 0, fail = 0;
function check(name, job, expected) {
  const actual = normalizeV1(job);
  const bad = Object.entries(expected).filter(([k, v]) => JSON.stringify(actual[k]) !== JSON.stringify(v));
  if (!bad.length) { pass++; console.log(`PASS  ${name}`); }
  else {
    fail++;
    console.log(`FAIL  ${name}`);
    for (const [k, v] of bad) console.log(`      ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual[k])}`);
  }
}

const EN = "We are looking for an experienced engineer to join the team and build systems that will help our customers succeed with their most important work.";

console.log("=== A. ATS field ===");

check("ATS remote → true",
  { location: "San Francisco", workplace_type: "remote", description: EN },
  { is_remote: true, remote_source: "ats" });

check("ATS hybrid → false (earned trust: 97.9% agreement)",
  { location: "London", workplace_type: "hybrid", description: EN },
  { is_remote: false, remote_source: "ats:hybrid" });

check("ATS on-site → NULL, never false (0/27 in QA — field is untrusted)",
  { location: "Singapore", workplace_type: "on-site", description: EN },
  { is_remote: null, remote_source: "ats:onsite-untrusted" });

check("ATS on-site stays null EVEN when description screams remote (ATS priority, missing beats wrong)",
  { location: "Germany", workplace_type: "on-site", description: EN + " Work from anywhere in Germany. #LI-remote" },
  { is_remote: null });

check("ATS hybrid beats remote location text (priority A over B)",
  { location: "US - Remote", workplace_type: "hybrid", description: EN },
  { is_remote: false, remote_source: "ats:hybrid" });

console.log("\n=== B. Location text ===");

check("'Remote - Poland' → true + PL",
  { location: "Remote - Poland", description: EN },
  { is_remote: true, remote_source: "location-text", location_countries: ["PL"] });

check("'US - Remote' → true + US",
  { location: "US - Remote", description: EN },
  { is_remote: true, remote_source: "location-text", location_countries: ["US"] });

check("Anthropic 'Remote-Friendly' counts as remote (Patrick's business decision)",
  { location: "Remote-Friendly, United States", description: EN },
  { is_remote: true, remote_source: "location-text", location_countries: ["US"] });

check("Multi-location with Remote-Friendly → remote, all countries kept",
  { location: "London, UK; Ontario, CAN; Remote-Friendly, United States; San Francisco, CA", description: EN },
  { is_remote: true, location_countries: ["GB", "CA", "US"] });

console.log("\n=== C. USCA source rule ===");

check("USCA → remote + US + CA, documented source",
  { location: "USCA", description: EN },
  { is_remote: true, remote_source: "source-rule:usca", location_countries: ["US", "CA"] });

check("GBIE is NOT a rule — no generic concatenated-code parsing",
  { location: "GBIE", description: EN },
  { is_remote: null, location_countries: [] });

console.log("\n=== D. Description (last resort, confirm-remote only) ===");

check("'This position can be remote' with no ATS/text signal → true",
  { location: "New York, NY", description: EN + " This position can be remote." },
  { is_remote: true, remote_source: "description:remote:this-role" });

check("#LI-remote with no ATS/text signal → true",
  { location: "Tokyo, Japan", description: EN + " #LI-Remote" },
  { is_remote: true, remote_source: "description:remote:li-tag", location_countries: ["JP"] });

check("Description hybrid phrase can NEVER set false — description confirms remote only",
  { location: "Austin, TX", description: EN + " We use a hybrid work model of three days in the office per week." },
  { is_remote: null });

console.log("\n=== null never collapses ===");

check("City only, silent description → null, no invented source",
  { location: "San Francisco, CA", description: EN },
  { is_remote: null, remote_source: null, location_countries: ["US"] });

check("Generic remote-adjacent words are not evidence",
  { location: "Paris, France", description: EN + " You will build tools for remote teams and visit our office sometimes." },
  { is_remote: null, location_countries: ["FR"] });

console.log("\n=== language ===");

check("English posting → en",
  { location: "London", description: EN }, { posting_language: "en" });

check("Japanese posting detected (kept in DB, hidden publicly — handled at query level)",
  { location: "Tokyo, Japan", title: "ソリューションアーキテクト", description: "私たちはお客様の成功を支援するソリューションアーキテクトを募集しています。チームと協力して、重要な課題を解決するシステムを構築します。東京オフィスでの勤務となります。" },
  { posting_language: "ja" });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
