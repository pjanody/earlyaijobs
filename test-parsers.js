// test-parsers.js — regression suite for location-parser v2 + language-parser.
// Run: node test-parsers.js       (no database, no network, no AI)
//
// Spec notes encoded here (Gate A, approved):
//   - location_scope is RESOLUTION (no "multiple"); multiplicity = list length
//   - bare "Remote" with no geography → scope unknown (conservative)
//   - USCA is a documented source alias; GBIE is not
//   - description workplace phrases are explicit-only; conflicts are flagged

const { parseLocation } = require("./location-parser");
const { detectPostingLanguage } = require("./language-parser");

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const bad = Object.entries(expected).filter(([k, v]) => JSON.stringify(actual[k]) !== JSON.stringify(v));
  if (bad.length === 0) { pass++; console.log(`PASS  ${name}`); }
  else {
    fail++;
    console.log(`FAIL  ${name}`);
    for (const [k, v] of bad) console.log(`      ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual[k])}`);
  }
}

console.log("=== LOCATION ===");

check("Remote — Poland",
  parseLocation({ location: "Remote — Poland" }),
  { workplace_type: "remote", location_scope: "country", location_countries: ["PL"],
    location_relationship: "eligibility" });

check("Remote — United States",
  parseLocation({ location: "Remote — United States" }),
  { workplace_type: "remote", location_scope: "country", location_countries: ["US"] });

check("Remote - US: Select locations",
  parseLocation({ location: "Remote - US: Select locations" }),
  { workplace_type: "remote", location_scope: "country", location_countries: ["US"] });

check("Remote (US time zones)",
  parseLocation({ location: "Remote (US time zones)" }),
  { workplace_type: "remote", location_scope: "region", location_region_codes: ["north-america"] });

check("Remote worldwide",
  parseLocation({ location: "Remote worldwide" }),
  { workplace_type: "remote", location_scope: "worldwide", location_countries: [],
    location_relationship: "eligibility" });

check("Remote EMEA",
  parseLocation({ location: "Remote EMEA" }),
  { workplace_type: "remote", location_scope: "region", location_region_codes: ["emea"] });

check("Remote APAC",
  parseLocation({ location: "Remote APAC" }),
  { workplace_type: "remote", location_scope: "region", location_region_codes: ["apac"] });

check("Hybrid — New York, NY",
  parseLocation({ location: "Hybrid — New York, NY" }),
  { workplace_type: "hybrid", location_scope: "city", location_cities: ["New York"],
    location_states: ["New York"], location_countries: ["US"], location_relationship: "both" });

check("On-site — New York, NY",
  parseLocation({ location: "On-site — New York, NY" }),
  { workplace_type: "on-site", location_scope: "city", location_relationship: "office" });

check("New York, NY with no workplace evidence → workplace unknown",
  parseLocation({ location: "New York, NY" }),
  { workplace_type: "unknown", location_scope: "city", location_relationship: "unknown" });

check("London / Dublin — both cities, both countries, scope city",
  parseLocation({ location: "London / Dublin" }),
  { location_scope: "city", location_countries: ["GB", "IE"], location_cities: ["London", "Dublin"] });

check("London / Dublin / Remote UK",
  parseLocation({ location: "London / Dublin / Remote UK" }),
  { workplace_type: "remote", location_scope: "city", location_countries: ["GB", "IE"] });

check("San Francisco / New York",
  parseLocation({ location: "San Francisco / New York" }),
  { location_scope: "city", location_countries: ["US"], location_cities: ["San Francisco", "New York"] });

check("United States / Canada",
  parseLocation({ location: "United States / Canada" }),
  { location_scope: "country", location_countries: ["US", "CA"] });

check("San Francisco, CA | Seattle, WA (pipe multi)",
  parseLocation({ location: "San Francisco, CA | Seattle, WA" }),
  { location_scope: "city", location_countries: ["US"], location_cities: ["San Francisco", "Seattle"] });

check("Maryland; Virginia; Washington, D.C. (semicolon states)",
  parseLocation({ location: "Maryland; Virginia; Washington, D.C." }),
  { location_scope: "state", location_countries: ["US"],
    location_states: ["Maryland", "Virginia", "District of Columbia"] });

check("Tokyo, Japan",
  parseLocation({ location: "Tokyo, Japan" }),
  { location_scope: "city", location_cities: ["Tokyo"], location_countries: ["JP"] });

check("Poland (bare country)",
  parseLocation({ location: "Poland" }),
  { location_scope: "country", location_countries: ["PL"] });

check("EMEA (bare region)",
  parseLocation({ location: "EMEA" }),
  { location_scope: "region", location_region_codes: ["emea"] });

check("ATS says remote, city listed (the Poland screenshot case)",
  parseLocation({ location: "Poland", workplace_type: "remote" }),
  { workplace_type: "remote", location_countries: ["PL"], location_relationship: "eligibility" });

check("Zürich, Switzerland",
  parseLocation({ location: "Zürich, Switzerland" }),
  { location_scope: "city", location_cities: ["Zürich"], location_countries: ["CH"] });

check("Bare US state: Virginia",
  parseLocation({ location: "Virginia" }),
  { location_scope: "state", location_states: ["Virginia"], location_countries: ["US"] });

check("Remote - Texas",
  parseLocation({ location: "Remote - Texas" }),
  { workplace_type: "remote", location_states: ["Texas"], location_countries: ["US"] });

check("Washington, D.C.",
  parseLocation({ location: "Washington, D.C." }),
  { location_cities: ["Washington"], location_states: ["District of Columbia"], location_countries: ["US"] });

check("D.C. alone",
  parseLocation({ location: "D.C." }),
  { location_countries: ["US"], location_states: ["District of Columbia"] });

check("Dublin, IE (ISO suffix)",
  parseLocation({ location: "Dublin, IE" }),
  { location_cities: ["Dublin"], location_countries: ["IE"] });

check("Zürich, CH (ISO suffix)",
  parseLocation({ location: "Zürich, CH" }),
  { location_cities: ["Zürich"], location_countries: ["CH"] });

check("Ontario, CAN (province + 3-letter code)",
  parseLocation({ location: "Ontario, CAN" }),
  { location_states: ["Ontario"], location_countries: ["CA"] });

check("Ontario - Remote",
  parseLocation({ location: "Ontario - Remote" }),
  { workplace_type: "remote", location_states: ["Ontario"], location_countries: ["CA"] });

check("NYC (SoHo)",
  parseLocation({ location: "NYC (SoHo)" }),
  { location_cities: ["Nyc"], location_countries: ["US"], location_states: ["New York"] });

check("Costa Rica",
  parseLocation({ location: "Costa Rica" }),
  { location_scope: "country", location_countries: ["CR"] });

check("Bare 'Remote' → remote, scope unknown (conservative per spec)",
  parseLocation({ location: "Remote" }),
  { workplace_type: "remote", location_scope: "unknown" });

check("Empty location, ATS remote → scope unknown (conservative per spec)",
  parseLocation({ location: "", workplace_type: "remote" }),
  { workplace_type: "remote", location_scope: "unknown" });

check("Gibberish stays unknown, never guessed",
  parseLocation({ location: "Flexible within our hubs" }),
  { location_scope: "unknown", location_countries: [], location_source: "none" });

console.log("\n--- source aliases ---");

check("USCA → remote + US + CA (documented Databricks source alias)",
  parseLocation({ location: "USCA" }),
  { workplace_type: "remote", location_countries: ["US", "CA"],
    location_source: "source-specific-rule", location_scope: "country" });

check("GBIE stays unknown — no generic concatenated-code parsing",
  parseLocation({ location: "GBIE" }),
  { location_scope: "unknown", location_countries: [] });

console.log("\n--- description workplace pass ---");

check("Description: fully remote",
  parseLocation({ location: "New York, NY", description: "This role is fully remote within the US." }),
  { workplace_type: "remote", workplace_source: "description" });

check("Description: hybrid via days-per-week phrase",
  parseLocation({ location: "London", description: "You will spend 3 days per week in the office with the team." }),
  { workplace_type: "hybrid", workplace_source: "description" });

check("Description: office-based role → on-site",
  parseLocation({ location: "Warsaw, Poland", description: "This is an office-based role in our Warsaw location." }),
  { workplace_type: "on-site", workplace_source: "description" });

check("Generic office/remote mentions do NOT classify",
  parseLocation({ location: "Warsaw, Poland", description: "Our office is a great place and our remote team spans the globe." }),
  { workplace_type: "unknown" });

check("ATS remote vs description hybrid → conflict flagged, ATS wins",
  parseLocation({ location: "Poland", workplace_type: "remote", description: "This is a hybrid role: 3 days per week in the office." }),
  { workplace_type: "remote", location_qa_flags: ["workplace-source-conflict"] });

check("Anthropic hybrid-policy boilerplate → hybrid, cities preserved",
  parseLocation({
    location: "San Francisco, CA | Seattle, WA | New York City, NY",
    description: "Location-based hybrid policy: Currently, we expect all staff to be in one of our offices at least 25% of the time.",
  }),
  { workplace_type: "hybrid", workplace_source: "description", location_scope: "city",
    location_cities: ["San Francisco", "Seattle", "New York City"], location_countries: ["US"],
    location_relationship: "both" });

check("Remote in location text beats hybrid boilerplate (precedence, not conflict-free)",
  parseLocation({
    location: "Remote - US",
    description: "We expect all staff to be in one of our offices at least 25% of the time.",
  }),
  { workplace_type: "remote", location_qa_flags: ["workplace-source-conflict"] });

console.log("\n--- structured ATS locations ---");

check("Ashby structured locations beat the raw string",
  parseLocation({
    location: "Multiple locations",
    ats_locations: { source: "ashby-structured", items: [
      { address: { addressLocality: "London", addressCountry: "United Kingdom" } },
      { address: { addressLocality: "Dublin", addressCountry: "Ireland" } },
    ]},
  }),
  { location_countries: ["GB", "IE"], location_source: "ashby-structured", location_scope: "city" });

check("Greenhouse office name entries parse via segment parser",
  parseLocation({
    location: "",
    ats_locations: { source: "greenhouse-offices", items: [{ name: "San Francisco" }, { name: "Tokyo" }] },
  }),
  { location_countries: ["US", "JP"], location_source: "greenhouse-structured" });

console.log("\n=== LANGUAGE ===");

const EN_DESC = "We are looking for an engineer to join our team. You will work with the research group and be responsible for building systems that scale. The role is based in our office and you will collaborate with teams across the company.";
const JA_DESC = "ソリューションアーキテクトとして、お客様の課題を理解し、最適なソリューションを提案していただきます。エンジニアリングチームと協力して、導入を支援します。日本のお客様を担当していただきます。";

check("Japanese title + Japanese description → ja",
  detectPostingLanguage({ title: "ソリューションアーキテクト", description: JA_DESC }),
  { language: "ja" });

check("English title + Japanese description → ja (description decides)",
  detectPostingLanguage({ title: "Solutions Architect", description: JA_DESC }),
  { language: "ja" });

check("Japanese title + English description → en (description decides)",
  detectPostingLanguage({ title: "ソリューションアーキテクト / Solutions Architect", description: EN_DESC }),
  { language: "en" });

check("English posting based in Tokyo → en",
  detectPostingLanguage({ title: "Solutions Architect, Tokyo", description: EN_DESC }),
  { language: "en" });

check("English title + English description → en",
  detectPostingLanguage({ title: "Machine Learning Engineer", description: EN_DESC }),
  { language: "en" });

check("Very short description → title decides, short title → und",
  detectPostingLanguage({ title: "SDR", description: "Great role." }),
  { language: "und" });

check("Tech-jargon-heavy English still detected",
  detectPostingLanguage({ title: "Platform Engineer", description: "You will use C++ Python SQL AWS Kubernetes and the team will support you with the tools for the job. This is a role for engineers who are excited about infrastructure and will work on our core systems." }),
  { language: "en" });

check("German description → de",
  detectPostingLanguage({ title: "Account Executive", description: "Wir suchen eine erfahrene Person für den Vertrieb. Sie werden mit unserem Team arbeiten und für die Kunden in der Region verantwortlich sein. Die Rolle ist nicht remote und Sie arbeiten bei uns im Büro in München oder Berlin." }),
  { language: "de" });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
