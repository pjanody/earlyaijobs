// test-sanitize.js — fidelity + safety tests for the description sanitizer.
// Run: node test-sanitize.js      (no database, no network, no AI)
//
// THE metric, per the formatting brief: did every employer word survive?
// Every case asserts BOTH safety (no dangerous markup out) and fidelity
// (visible text in === visible text out).

const { sanitizeDescriptionHtml, textOf } = require("./sanitize-description");

let pass = 0, fail = 0;
function check(name, fn) {
  try {
    fn();
    pass++; console.log(`PASS  ${name}`);
  } catch (e) {
    fail++; console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}
function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function fidelity(input) {
  const out = sanitizeDescriptionHtml(input);
  eq(textOf(out), textOf(input), "visible text changed");
  return out;
}

check("plain paragraphs survive verbatim", () => {
  const out = fidelity("<p>About the role</p><p>You will build things.</p>");
  eq(out, "<p>About the role</p><p>You will build things.</p>", "output");
});

check("headings, lists, emphasis preserved", () => {
  const out = fidelity("<h2>What you'll do</h2><ul><li>Own the <strong>full</strong> cycle</li><li>Build pipeline</li></ul>");
  if (!/<h2>/.test(out) || !/<ul><li>/.test(out) || !/<strong>full<\/strong>/.test(out)) throw new Error(`structure lost: ${out}`);
});

check("ordered lists stay ordered", () => {
  const out = fidelity("<ol><li>First</li><li>Second</li></ol>");
  if (!/<ol>/.test(out)) throw new Error(out);
});

check("valid links rebuilt with safe attributes", () => {
  const out = fidelity('<p>Apply <a href="https://example.com/x" onclick="evil()">here</a></p>');
  if (!out.includes('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">here</a>')) throw new Error(out);
  if (out.includes("onclick")) throw new Error("onclick survived");
});

check("javascript: links dropped, link TEXT kept", () => {
  const out = fidelity('<p>Click <a href="javascript:alert(1)">this link</a> now</p>');
  if (out.includes("<a ")) throw new Error("unsafe link survived");
  if (!out.includes("this link")) throw new Error("link text lost");
});

check("script removed WITH its contents", () => {
  const out = sanitizeDescriptionHtml("<p>Real text</p><script>document.cookie</script><p>More text</p>");
  if (out.includes("cookie") || out.includes("script")) throw new Error(out);
  eq(textOf(out), "Real text More text", "text");
});

check("style/iframe removed with contents", () => {
  const out = sanitizeDescriptionHtml('<style>p{display:none}</style><p>Visible</p><iframe src="https://x.y"></iframe>');
  eq(textOf(out), "Visible", "text");
  if (/<(style|iframe)/.test(out)) throw new Error(out);
});

check("unknown tags vanish, their text stays", () => {
  const out = fidelity('<div class="x"><span style="color:red">Salary: $150,000—$200,000.</span></div>');
  if (/<(div|span)/.test(out)) throw new Error(out);
  if (!out.includes("$150,000—$200,000.")) throw new Error("salary text lost");
});

check("Greenhouse double-encoding decoded exactly once", () => {
  const out = sanitizeDescriptionHtml("&lt;p&gt;Pay range: $100 &amp;amp; equity&lt;/p&gt;");
  if (!out.startsWith("<p>")) throw new Error(`not decoded: ${out}`);
  eq(textOf(out), "Pay range: $100 & equity", "text");
});

check("literal < in prose is escaped, not eaten", () => {
  const out = sanitizeDescriptionHtml("<p>Experience with C++ and x <y comparisons</p>");
  eq(textOf(out), "Experience with C++ and x <y comparisons", "text");
});

check("unclosed tags get closed", () => {
  const out = fidelity("<ul><li>One<li>Two");
  if ((out.match(/<li>/g) || []).length !== (out.match(/<\/li>/g) || []).length) throw new Error(out);
  if (!out.endsWith("</ul>")) throw new Error(`ul not closed: ${out}`);
});

check("stray closing tags ignored", () => {
  const out = fidelity("</div>Text here</p>");
  eq(textOf(out), "Text here", "text");
});

check("empty input → null", () => {
  eq(sanitizeDescriptionHtml(""), null, "empty");
  eq(sanitizeDescriptionHtml("   "), null, "blank");
  eq(sanitizeDescriptionHtml(null), null, "null");
});

check("event handlers on allowed tags are discarded", () => {
  const out = fidelity('<p onmouseover="steal()">Hello</p>');
  eq(out, "<p>Hello</p>", "output");
});

check("long realistic posting keeps every word", () => {
  const input = `<h2>About Anthropic</h2><p>Anthropic&#39;s mission is to create reliable systems.</p>
<h2>About the role</h2><p>You will own the <em>full</em> sales cycle for mid-market accounts across the region.</p>
<h3>What you'll do</h3><ul><li>Own the full sales cycle</li><li>Build and manage pipeline</li><li>Partner with cross-functional teams</li></ul>
<h3>Minimum qualifications</h3><ul><li>5+ years of experience</li><li>Excellent communication</li></ul>
<p>The expected salary range for this position is $150,000&mdash;$200,000.</p>
<p>Anthropic is an equal opportunity employer. See our <a href="https://www.anthropic.com/careers">careers page</a>.</p>`;
  fidelity(input);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
