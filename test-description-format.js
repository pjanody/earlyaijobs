// test-description-format.js — fidelity tests for the plain-text description
// renderer. Run: node test-description-format.js
//
// Primary metric (per the formatting brief): every employer word survives,
// in order. These tests run against the SAME module the job page imports.

const { blocksOf, textOfBlocks, lineKind } = require("./description-format");

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const norm = (s) => String(s).split("\n").map((l) => l.trim().replace(/^[•·◦▪-]\s+/, "")).filter(Boolean).join("\n");
function fidelity(source) {
  const rendered = textOfBlocks(blocksOf(source));
  if (norm(source) !== norm(rendered)) {
    throw new Error(`text loss!\n  source:   ${JSON.stringify(norm(source)).slice(0, 200)}\n  rendered: ${JSON.stringify(norm(rendered)).slice(0, 200)}`);
  }
}

check("no text loss: realistic posting", () => {
  fidelity(`About the role
We are hiring across offices. We can only consider one application in 30 days.

The impact you will have:

Work with a team to build features for the platform

What we look for:

- You will graduate in fall 2027
- Implementation skills with Python, Java, or C++

Compensation
The expected salary range is $150,000—$200,000.

Equal opportunity
We are an equal opportunity employer.`);
});

check("no text loss: no headings at all (graceful fallback)", () => {
  fidelity("Just one paragraph.\n\nAnd another paragraph with details.\n\nAnd a third.");
});

check("no text loss: bullets only", () => {
  fidelity("• First item\n• Second item\n• Third item");
});

check("order preserved exactly", () => {
  const blocks = blocksOf("About us\nIntro text.\nRequirements\n- One\n- Two\nBenefits\nGreat ones.");
  const kinds = blocks.map((b) => b.kind).join(",");
  if (kinds !== "heading,p,heading,bullet-list,heading,p") throw new Error(kinds);
});

check("headings recognized: colon form and known bare form", () => {
  if (lineKind("The impact you will have:") !== "heading") throw new Error("colon form");
  if (lineKind("Minimum qualifications") !== "heading") throw new Error("bare form");
  if (lineKind("Perks & benefits") !== "heading") throw new Error("ampersand form");
});

check("sentences never become headings", () => {
  if (lineKind("Our minimum qualifications include experience building distributed systems.") === "heading")
    throw new Error("sentence promoted to heading");
  if (lineKind("Note: our office is at 123 Main St. For example: parking is free.") === "heading")
    throw new Error("colon-in-prose promoted");
});

check("consecutive bullets group into ONE list, split by paragraphs", () => {
  const blocks = blocksOf("- a\n- b\nMiddle paragraph.\n- c\n- d");
  const lists = blocks.filter((b) => b.kind === "bullet-list");
  if (lists.length !== 2 || lists[0].items.length !== 2 || lists[1].items.length !== 2)
    throw new Error(JSON.stringify(blocks));
});

check("empty input renders nothing, throws nothing", () => {
  if (blocksOf("").length !== 0 || blocksOf(null).length !== 0) throw new Error("phantom blocks");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
