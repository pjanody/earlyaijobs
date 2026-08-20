// normalize-v1.js — the ONLY normalization layer for v1. Frozen scope.
//
// Two user-facing features and nothing else:
//   1. Location filter  = country/region  → location_countries[] / region codes
//   2. Remote checkbox  = is_remote === true
//
// is_remote is tri-state, and null NEVER collapses to false:
//   true  — positively confirmed remote (always with a documented source)
//   false — confirmed non-remote from evidence that earned trust
//   null  — not enough evidence. Unknown means "cannot confirm remote",
//           not "this is on-site".
//
// Evidence rules, in priority order (agreed with Patrick 2026-08-20):
//   A. ATS structured field
//        remote  → true          (95.9% description agreement in QA)
//        hybrid  → false         (97.9% description agreement in QA)
//        on-site → null, NOT false — the Ashby on-site value scored 0/27
//                  against descriptions (ElevenLabs marks "work from anywhere
//                  in Germany, #LI-remote" as on-site). A field that wrong
//                  cannot confirm anything. Deliberate cost: those jobs
//                  won't appear under Remote. Missing beats wrong.
//   B. Explicit location text — "US - Remote", "Remote - Poland",
//        "Remote-Friendly" (Patrick's call: counts as remote).
//   C. USCA — documented Databricks source rule → remote, US + CA.
//   D. Narrow description phrases only ("#LI-remote", "this position can be
//        remote", "fully remote"). Reached only when A–C are silent; the
//        description never overrides structured data.
//
// NOT here, on purpose: hybrid/on-site as categories, employment type,
// city/state filtering, radius, LLM anything. Raw ATS data is preserved
// upstream and untouched.

const { parseLocation } = require("./location-parser");
const { detectPostingLanguage } = require("./language-parser");

/** @returns {{is_remote: boolean|null, remote_source: string|null}} */
function deriveRemote(parsed) {
  const e = parsed.workplace_evidence || {};

  // C first structurally: the USCA alias bypasses evidence collection.
  if (parsed.workplace_type === "remote" && parsed.workplace_source === "source-specific-rule") {
    return { is_remote: true, remote_source: "source-rule:usca" };
  }

  // A. ATS structured field.
  if (e.ats === "remote") return { is_remote: true, remote_source: "ats" };
  if (e.ats === "hybrid") return { is_remote: false, remote_source: "ats:hybrid" };
  if (e.ats === "on-site") return { is_remote: null, remote_source: "ats:onsite-untrusted" };

  // B. Explicit location text.
  if (e.location_text === "remote") return { is_remote: true, remote_source: "location-text" };
  if (e.location_text === "hybrid") return { is_remote: false, remote_source: "location-text:hybrid" };
  // Location-text "on-site" is the company literally writing it in the
  // location field — different animal from the broken Ashby enum.
  if (e.location_text === "on-site") return { is_remote: false, remote_source: "location-text:onsite" };

  // D. Narrow description phrases — confirm remote only, never non-remote.
  if (e.description === "remote") {
    return { is_remote: true, remote_source: `description:${e.description_rule}` };
  }

  return { is_remote: null, remote_source: null };
}

/** One job in → the four fields v1 filtering depends on. Deterministic, no network. */
function normalizeV1(job) {
  const parsed = parseLocation(job);
  const lang = detectPostingLanguage(job);
  const remote = deriveRemote(parsed);

  return {
    is_remote: remote.is_remote,
    remote_source: remote.remote_source,           // invariant: true ⇒ source documented
    location_countries: parsed.location_countries, // ["US","CA"], ["PL"], []…
    location_region_codes: parsed.location_region_codes,
    posting_language: lang.language,               // publish only "en"
    _parsed: parsed,                               // full detail for diagnostics; not stored
  };
}

module.exports = { normalizeV1, deriveRemote };
