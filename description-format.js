// description-format.js — the deterministic text-description formatter,
// shared by the job page renderer AND the fidelity tests, so the tests
// exercise the exact code production runs (not a copy that can drift).
//
// Input:  plain-text description (newline-separated lines)
// Output: ordered blocks {kind: "heading"|"bullet-list"|"p", text|items}
// Contract: every non-blank source line appears in exactly one block, in
// source order, character-for-character (bullets lose only their marker).

const KNOWN_HEADINGS = new Set([
  "about the role", "about this role", "about the team", "about the company",
  "about us", "about you", "the role", "the team", "the opportunity",
  "requirements", "minimum requirements", "preferred requirements",
  "responsibilities", "key responsibilities", "your responsibilities",
  "role responsibilities", "core responsibilities",
  "qualifications", "minimum qualifications", "preferred qualifications",
  "required qualifications", "basic qualifications",
  "skills", "required skills", "preferred skills", "experience",
  "required experience", "benefits", "perks", "perks & benefits",
  "compensation", "salary", "pay", "total rewards", "logistics", "location",
  "work location", "visa", "visa sponsorship", "immigration",
  "how we're different", "why join us", "come work with us",
  "equal opportunity", "eeo", "accessibility", "who you are", "who we are",
  "what you'll do", "what you will do", "what you'll be doing",
  "what you'll work on", "what you bring", "what we look for",
  "what we're looking for", "what we offer", "nice to have", "bonus points",
  "your impact", "in this role", "interview process", "our culture",
]);

const BULLET_RE = /^[•·◦▪-]\s+/;

function lineKind(line) {
  if (BULLET_RE.test(line)) return "bullet";
  const bare = line.replace(/:$/, "").replace(/[’]/g, "'").toLowerCase();
  if (line.length <= 70 && line.endsWith(":") && !/[.!?] /.test(line)) return "heading";
  if (line.length <= 45 && KNOWN_HEADINGS.has(bare)) return "heading";
  return "text";
}

/** @returns {Array<{kind:"heading"|"p", text:string} | {kind:"bullet-list", items:string[]}>} */
function blocksOf(description) {
  const blocks = [];
  let bullets = null;
  for (const raw of String(description || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const kind = lineKind(line);
    if (kind === "bullet") {
      if (!bullets) { bullets = { kind: "bullet-list", items: [] }; blocks.push(bullets); }
      bullets.items.push(line.replace(BULLET_RE, ""));
      continue;
    }
    bullets = null;
    blocks.push({ kind: kind === "heading" ? "heading" : "p", text: line });
  }
  return blocks;
}

/** All visible text of the rendered blocks, for fidelity testing. */
function textOfBlocks(blocks) {
  return blocks
    .map((b) => (b.kind === "bullet-list" ? b.items.join("\n") : b.text))
    .join("\n");
}

// ---------------------------------------------------------------------------
// HTML path: promote source "visual headings" to semantic headings.
//
// Not every ATS marks sections with <h2>. Databricks emits section labels as
// standalone bold paragraphs ("Pay Range Transparency") or plain lines ending
// in a colon ("The impact you will have:"); some OpenAI postings do the same.
// Those pages therefore rendered as walls of text with no jump-nav, while
// Anthropic/ElevenLabs pages (which do use real headings) looked structured.
//
// This changes MARKUP ONLY — <p> becomes <h2>, the words are identical and
// stay in place. A paragraph is promoted only when it is ENTIRELY a short
// bold run, or a short colon-terminated line with no sentence punctuation.
// Anything longer, or containing other content, is left alone.
// ---------------------------------------------------------------------------

// An applicant-tracking requisition code: "CSQ227R215", "R-12345", "JR102938".
// Databricks emits one as a standalone bold paragraph at the top of every
// posting, which the short-bold-line rule below happily promoted to an <h2> —
// so the job page opened with a giant meaningless heading AND that code led
// the "ON THIS PAGE" nav. It is employer metadata, not part of the job
// description. Deliberately narrow: a SINGLE token, no spaces, containing at
// least one digit and no lowercase letters. "Benefits" and "EEO" are unharmed;
// so is any real heading, because real headings have spaces or lowercase.
// Starts with a letter, uppercase and digits only, contains at least one
// digit. The 5-character floor keeps short legitimate labels like "Q4" and
// "L5" safe; every real requisition code is comfortably longer.
const REFERENCE_CODE_RE = /^[A-Z][A-Z0-9-]*[0-9][A-Z0-9-]*$/;

function isReferenceCode(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim().replace(/[.:]$/, "");
  if (!t || /\s/.test(t)) return false;         // more than one word → prose
  if (t.length < 5 || t.length > 24) return false;
  return REFERENCE_CODE_RE.test(t);
}

function isHeadingText(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t || t.length > 70) return false;
  if (isReferenceCode(t)) return false;         // "CSQ227R215" is not a heading
  if (/[.!?]\s/.test(t)) return false;          // contains a sentence break
  if (t.endsWith(".")) return false;            // is a sentence
  const bare = t.replace(/:$/, "").replace(/[’]/g, "'").toLowerCase();
  if (t.endsWith(":")) return true;             // "The impact you will have:"
  if (KNOWN_HEADINGS.has(bare)) return true;    // "About Databricks", "Benefits"
  // A short bold line with no terminal punctuation reads as a section label.
  return t.split(/\s+/).length <= 7;
}

/**
 * Remove paragraphs that contain NOTHING but an ATS requisition code.
 *
 * This is the one place the site deletes source text, and the rule that allows
 * it is narrow on purpose: the paragraph must consist solely of a single
 * code-shaped token. If there is a word beside it — "Requisition CSQ227R215",
 * "Apply with code AB12" — nothing is removed. A code alone conveys nothing to
 * a job seeker and it is not prose; it is the ATS's internal reference leaking
 * into the description.
 */
function stripReferenceCodes(html) {
  return String(html || "")
    .replace(/<p>\s*<(strong|b)>\s*([^<]+?)\s*<\/\1>\s*<\/p>/gi, (m, tag, text) =>
      isReferenceCode(text) ? "" : m)
    .replace(/<p>\s*([^<]+?)\s*<\/p>/gi, (m, text) => (isReferenceCode(text) ? "" : m))
    .replace(/<h([1-6])>\s*([^<]+?)\s*<\/h\1>/gi, (m, level, text) =>
      isReferenceCode(text) ? "" : m);
}

function promoteHeadings(html) {
  return stripReferenceCodes(html)
    // Whole paragraph is one bold run: <p><strong>Pay Range Transparency</strong></p>
    .replace(/<p>\s*<(strong|b)>([^<]+)<\/\1>\s*<\/p>/gi, (m, tag, text) =>
      isHeadingText(text) ? `<h2>${text.trim()}</h2>` : m)
    // Plain paragraph: promoted ONLY if it ends in a colon ("The impact you
    // will have:") or is a known section title ("About the Team" — some
    // OpenAI postings emit these as bare text). The short-line fallback that
    // bold paragraphs get is deliberately NOT applied here: without bold or
    // a colon, a short plain line is too often just a short sentence.
    .replace(/<p>([^<]+)<\/p>/gi, (m, text) => {
      const t = text.trim();
      if (!isHeadingText(t)) return m;
      const bare = t.replace(/:$/, "").replace(/[’]/g, "'").toLowerCase();
      return t.endsWith(":") || KNOWN_HEADINGS.has(bare) ? `<h2>${t}</h2>` : m;
    });
}

module.exports = {
  KNOWN_HEADINGS, lineKind, blocksOf, textOfBlocks, BULLET_RE,
  isHeadingText, promoteHeadings, isReferenceCode, stripReferenceCodes,
};
