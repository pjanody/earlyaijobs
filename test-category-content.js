// test-category-content.js — every category page must have real content.
// Run: node test-category-content.js   (no database, no network)
//
// The Batch C review rule: no generic SEO copy. This suite can't judge prose
// quality, but it CAN enforce the structural rules — every category covered,
// no duplicates, no placeholder text, no numbers that would go stale.

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

(async () => {
const { CATEGORY_INTROS } = await import("./lib/category-content.js");

// Mirror of CATEGORY_LABELS keys in lib/db.js. Kept literal on purpose: if a
// category is added there and forgotten here, this file fails loudly instead
// of the new page silently shipping without an intro.
const CATEGORIES = [
  "engineering", "research", "data", "product", "design", "infrastructure",
  "security", "solutions", "sales", "marketing", "customer-success",
  "operations", "legal-compliance", "policy", "people", "finance",
  "education", "manufacturing", "other",
];

check("every category has an intro; no orphan intros", () => {
  for (const c of CATEGORIES) assert(CATEGORY_INTROS[c], `missing intro: ${c}`);
  for (const k of Object.keys(CATEGORY_INTROS)) assert(CATEGORIES.includes(k), `orphan intro: ${k}`);
});

check("intros are substantial but not essays", () => {
  for (const [c, text] of Object.entries(CATEGORY_INTROS)) {
    assert(text.length >= 80, `${c}: too short to say anything (${text.length} chars)`);
    assert(text.length <= 600, `${c}: too long for an intro (${text.length} chars)`);
  }
});

check("no two intros share a first sentence (also feeds meta descriptions)", () => {
  const seen = new Map();
  for (const [c, text] of Object.entries(CATEGORY_INTROS)) {
    const first = text.split(". ")[0];
    assert(!seen.has(first), `${c} and ${seen.get(first)} share a first sentence`);
    seen.set(first, c);
  }
});

check("no live counts baked into prose (they drift daily)", () => {
  for (const [c, text] of Object.entries(CATEGORY_INTROS)) {
    assert(!/\b\d{2,}(,\d{3})?\s+(open\s+)?(jobs|roles|positions)\b/i.test(text),
      `${c}: contains a job count that will go stale`);
  }
});

check("no placeholder or filler-signal text", () => {
  for (const [c, text] of Object.entries(CATEGORY_INTROS)) {
    for (const bad of ["TODO", "lorem", "Lorem", "placeholder", "best jobs", "top jobs", "click here"]) {
      assert(!text.includes(bad), `${c}: contains "${bad}"`);
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
