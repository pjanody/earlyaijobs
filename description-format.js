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

function isHeadingText(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t || t.length > 70) return false;
  if (/[.!?]\s/.test(t)) return false;          // contains a sentence break
  if (t.endsWith(".")) return false;            // is a sentence
  const bare = t.replace(/:$/, "").replace(/[’]/g, "'").toLowerCase();
  if (t.endsWith(":")) return true;             // "The impact you will have:"
  if (KNOWN_HEADINGS.has(bare)) return true;    // "About Databricks", "Benefits"
  // A short bold line with no terminal punctuation reads as a section label.
  return t.split(/\s+/).length <= 7;
}

function promoteHeadings(html) {
  return String(html || "")
    // Whole paragraph is one bold run: <p><strong>Pay Range Transparency</strong></p>
    .replace(/<p>\s*<(strong|b)>([^<]+)<\/\1>\s*<\/p>/gi, (m, tag, text) =>
      isHeadingText(text) ? `<h2>${text.trim()}</h2>` : m)
    // Plain short line ending in a colon: <p>The impact you will have:</p>
    .replace(/<p>([^<]+)<\/p>/gi, (m, text) =>
      isHeadingText(text) && text.trim().endsWith(":") ? `<h2>${text.trim()}</h2>` : m);
}

module.exports = {
  KNOWN_HEADINGS, lineKind, blocksOf, textOfBlocks, BULLET_RE,
  isHeadingText, promoteHeadings,
};
