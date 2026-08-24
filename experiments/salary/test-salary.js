// test-salary.js — regression suite for deterministic salary extraction.
// Run: node test-salary.js      (no database, no network, no AI)
//
// The false-positive cases matter more than the positives: publishing a
// wrong salary is far worse than publishing none.

const { extractSalary, formatSalary } = require("./lib/salary");

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
// US country context: bare "$" resolves via the job's own parsed country,
// which is exactly how production will call this.
const job = (description, countries = ["US"]) => ({ description, location_countries: countries });
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// ---------------- straightforward ranges ----------------
check("plain USD range", () => {
  const r = extractSalary(job("The annual salary range for this position is $180,000 - $240,000 USD."));
  eq(r.status, "parsed", "status"); eq(r.min, 180000, "min"); eq(r.max, 240000, "max");
  eq(r.currency, "USD", "currency"); eq(r.period, "year", "period");
});

check("en-dash range", () => {
  const r = extractSalary(job("Annual Salary: $245,000—$285,000 USD"));
  eq(r.status, "parsed", "status"); eq(r.min, 245000, "min"); eq(r.max, 285000, "max");
});

check("K shorthand", () => {
  const r = extractSalary(job("Base salary range: $180K – $240K USD per year."));
  eq(r.min, 180000, "min"); eq(r.max, 240000, "max");
});

// USD-only policy: non-USD pay is detected and recorded, never displayed.
check("GBP detected but NOT published", () => {
  const r = extractSalary(job("The base salary for this role is £90,000 - £120,000 per year.", ["GB"]));
  eq(r.status, "non-usd", "status"); eq(r.currency, "GBP", "currency");
  eq(r.min, null, "min withheld"); eq(r.max, null, "max withheld");
});

check("EUR detected but NOT published", () => {
  const r = extractSalary(job("Compensation: €6,000–€8,000 per month.", ["FR"]));
  eq(r.status, "non-usd", "status"); eq(r.currency, "EUR", "currency"); eq(r.min, null, "min withheld");
});

check("Canadian dollars are not US dollars", () => {
  const r = extractSalary(job("Salary range: $150,000 - $190,000 annually.", ["CA"]));
  eq(r.status, "non-usd", "status"); eq(r.currency, "CAD", "currency");
});

check("hourly stays hourly", () => {
  const r = extractSalary(job("The hourly rate for this position is $45 - $60 per hour."));
  eq(r.period, "hour", "period"); eq(r.min, 45, "min"); eq(r.max, 60, "max");
});

check("CA$ marker → non-usd", () => {
  const r = extractSalary(job("Salary range: CA$150,000 - CA$190,000 annually."));
  eq(r.status, "non-usd", "status"); eq(r.currency, "CAD", "currency");
});

// ---------------- partial forms ----------------
check("'starting at' → open-ended max", () => {
  const r = extractSalary(job("Base salary starting at $150,000 USD per year."));
  eq(r.status, "parsed", "status"); eq(r.min, 150000, "min"); eq(r.max, null, "max");
  eq(formatSalary(r), "From $150K / year", "display");
});

check("'up to' → open-ended min", () => {
  const r = extractSalary(job("Compensation of up to $220,000 USD annually."));
  eq(r.min, null, "min"); eq(r.max, 220000, "max");
  eq(formatSalary(r), "Up to $220K / year", "display");
});

// ---------------- the dedupe case (Databricks) ----------------
check("identical repeated ranges collapse to one (Databricks zones)", () => {
  const r = extractSalary(job(
    "Pay Range Transparency. Zone 1 Pay Range: $182,000—$250,208 USD. " +
    "Zone 2 Pay Range: $182,000—$250,208 USD. Zone 3 Pay Range: $182,000—$250,208 USD. " +
    "Zone 4 Pay Range: $182,000—$250,208 USD."
  ));
  eq(r.status, "parsed", "status"); eq(r.min, 182000, "min"); eq(r.max, 250208, "max");
});

check("genuinely different ranges → ambiguous, nothing published", () => {
  const r = extractSalary(job(
    "Compensation. San Francisco salary range: $220,000—$300,000 USD. " +
    "New York salary range: $200,000—$280,000 USD."
  ));
  eq(r.status, "ambiguous", "status"); eq(r.min, null, "min"); eq(r.max, null, "max");
});

// ---------------- OTE ----------------
check("OTE flagged; base is what gets parsed", () => {
  const r = extractSalary(job(
    "Base salary range: $120,000—$150,000 USD. On-target earnings (OTE) reach higher with commission."
  ));
  eq(r.has_ote, true, "has_ote"); eq(r.min, 120000, "base min");
});

// ---------------- FALSE POSITIVES — the important half ----------------
check("company valuation is not salary", () => {
  eq(extractSalary(job("We recently raised at a $1B valuation and have $100M ARR.")).status, "none", "status");
});

check("relocation allowance is not salary", () => {
  eq(extractSalary(job("We offer a $10,000 relocation allowance to new employees.")).status, "none", "status");
});

check("learning stipend is not salary", () => {
  eq(extractSalary(job("Every employee receives a $2,000 annual learning stipend.")).status, "none", "status");
});

check("401k match is not salary", () => {
  eq(extractSalary(job("We match 401(k) contributions up to $5,000 per year.")).status, "none", "status");
});

check("equity is not salary", () => {
  eq(extractSalary(job("This role includes an equity grant valued at $400,000 over four years.")).status, "none", "status");
});

check("no compensation section at all → none", () => {
  eq(extractSalary(job("We are hiring a Software Engineer to build distributed systems.")).status, "none", "status");
});

check("bare $ on a MULTI-country posting → refuses to pick a dollar", () => {
  const r = extractSalary(job("The salary range for this role is $180,000 - $240,000 per year.", ["US", "CA"]));
  eq(r.status, "ambiguous", "status");
});

check("no currency marker at all → never published", () => {
  const r = extractSalary(job("The salary range for this role is 180,000 - 240,000 per year.", []));
  if (r.status === "parsed" && r.currency === null) throw new Error("published a range with no currency");
  if (r.status === "parsed" && r.currency === "USD") throw new Error("guessed USD without evidence");
});

check("absurd magnitudes rejected", () => {
  eq(extractSalary(job("Salary: $500,000,000 USD per year.")).status, "none", "status");
});

check("empty and missing descriptions never throw", () => {
  eq(extractSalary(job("")).status, "none", "empty");
  eq(extractSalary({}).status, "none", "missing");
  eq(extractSalary({ description: null }).status, "none", "null");
});

// ---------------- display formatting ----------------
check("formatter output", () => {
  eq(formatSalary({ min: 180000, max: 240000, currency: "USD", period: "year" }), "$180K–$240K / year", "annual");
  eq(formatSalary({ min: 45, max: 60, currency: "USD", period: "hour" }), "$45–$60 / hour", "hourly");
  eq(formatSalary({ min: null, max: null, currency: null, period: null }), null, "empty");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
