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

// ---------------------------------------------------------------------------
// HTML heading promotion (Databricks / some OpenAI postings mark sections with
// bold or colon lines instead of real headings). Markup changes; text must not.
// ---------------------------------------------------------------------------
const { promoteHeadings } = require("./description-format");
const visibleText = (html) => String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function promoFidelity(html) {
  const out = promoteHeadings(html);
  if (visibleText(out) !== visibleText(html)) {
    throw new Error(`text changed!\n  in:  ${visibleText(html)}\n  out: ${visibleText(out)}`);
  }
  return out;
}

check("bold-only paragraph becomes a heading (Databricks)", () => {
  const out = promoFidelity("<p><strong>Pay Range Transparency</strong></p><p>Databricks is committed to fair pay.</p>");
  if (!out.includes("<h2>Pay Range Transparency</h2>")) throw new Error(out);
});

check("colon line becomes a heading (Databricks)", () => {
  const out = promoFidelity("<p>The impact you will have:</p><ul><li>Lead projects</li></ul>");
  if (!out.includes("<h2>The impact you will have:</h2>")) throw new Error(out);
});

check("known label without colon becomes a heading", () => {
  const out = promoFidelity("<p><strong>Benefits</strong></p><p>We offer things.</p>");
  if (!out.includes("<h2>Benefits</h2>")) throw new Error(out);
});

check("real sentences are NEVER promoted", () => {
  const long = "<p>We are committed to fair and equitable compensation practices across every region we operate in.</p>";
  if (promoFidelity(long).includes("<h2>")) throw new Error("sentence promoted");
  const bolded = "<p><strong>We encourage you to apply even if you do not meet every qualification.</strong></p>";
  if (promoFidelity(bolded).includes("<h2>")) throw new Error("bold sentence promoted");
});

check("bold label followed by body text is left alone", () => {
  const out = promoFidelity("<p><strong>Minimum education:</strong> Bachelor&apos;s degree or equivalent</p>");
  if (out.includes("<h2>")) throw new Error(`inline label promoted: ${out}`);
});

check("existing real headings untouched", () => {
  const out = promoFidelity("<h2>About the role</h2><p>Text.</p>");
  if (!out.startsWith("<h2>About the role</h2>")) throw new Error(out);
});

check("plain-text known headings promoted (OpenAI 'About the Team')", () => {
  const out = promoFidelity("<p>About the Team</p><p>Our team brings products to the world.</p><p>About the Role</p><p>You will lead things.</p>");
  if (!out.includes("<h2>About the Team</h2>") || !out.includes("<h2>About the Role</h2>")) throw new Error(out);
});

check("plain short sentences NOT promoted without colon or known title", () => {
  const out = promoFidelity("<p>Join our mission today</p><p>We build useful things.</p>");
  if (out.includes("<h2>")) throw new Error(`short sentence promoted: ${out}`);
});

// ---------------------------------------------------------------------------
// ATS requisition codes (2026-08-23)
//
// Databricks opens every posting with <p><strong>CSQ227R215</strong></p>. The
// short-bold-line rule promoted it to an <h2>, so the job page led with a
// meaningless giant heading and that code headed the "ON THIS PAGE" nav.
//
// These are the ONLY tests in this file where output text may differ from
// input, so they call promoteHeadings directly rather than promoFidelity.
// The fidelity guarantee still holds for everything else — the tests below
// prove prose containing code-like tokens is never touched.
// ---------------------------------------------------------------------------
const { isReferenceCode } = require("./description-format");

check("Databricks requisition code is removed, not turned into a heading", () => {
  const out = promoteHeadings("<p><strong>CSQ227R215</strong></p><p>As a Staff Designated Engineer you will…</p>");
  if (out.includes("CSQ227R215")) throw new Error(`code survived: ${out}`);
  if (out.includes("<h2>")) throw new Error(`code became a heading: ${out}`);
  if (!out.includes("As a Staff Designated Engineer")) throw new Error(`body text lost: ${out}`);
});

check("code recognised in several ATS formats", () => {
  for (const c of ["CSQ227R215", "CSQ327R31", "JR102938", "R-12345", "REQ4471"]) {
    if (!isReferenceCode(c)) throw new Error(`not detected: ${c}`);
  }
  // Removed whether bold, plain, or already a heading.
  for (const html of ["<p><strong>JR102938</strong></p>", "<p>JR102938</p>", "<h1>JR102938</h1>", "<h2>JR102938</h2>"]) {
    if (promoteHeadings(html).includes("JR102938")) throw new Error(`survived: ${html}`);
  }
});

check("REAL headings and prose are never mistaken for codes", () => {
  for (const t of [
    "Benefits", "EEO", "Compensation", "About Databricks", "Pay Range Transparency",
    "What you'll do", "Requirements", "Level 3", "Tier 2 Support", "Q4",
  ]) {
    if (isReferenceCode(t)) throw new Error(`wrongly treated as a code: ${t}`);
  }
});

check("a code with any other word beside it is left completely alone", () => {
  // The rule only fires on a paragraph that is NOTHING BUT a code. Anything
  // else — including a sentence that mentions one — keeps every character.
  promoFidelity("<p>Requisition CSQ227R215</p>");
  promoFidelity("<p><strong>Job ID: CSQ227R215</strong></p>");
  promoFidelity("<p>Quote reference CSQ227R215 when applying.</p>");
});

check("known headings still promote after the code is stripped", () => {
  const out = promoteHeadings(
    "<p><strong>CSQ227R215</strong></p><p><strong>Pay Range Transparency</strong></p><p>Databricks is committed to fair pay.</p>"
  );
  if (out.includes("CSQ227R215")) throw new Error(`code survived: ${out}`);
  if (!out.includes("<h2>Pay Range Transparency</h2>")) throw new Error(`heading lost: ${out}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
