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

module.exports = { KNOWN_HEADINGS, lineKind, blocksOf, textOfBlocks, BULLET_RE };
