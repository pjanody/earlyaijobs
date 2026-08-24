// lib/salary.js — deterministic salary extraction. No AI, no estimates, no
// market data, no currency conversion, no annualizing.
//
// THE RULE: extract explicit employer-disclosed compensation, or nothing.
// A job with no salary field is not a failure — it means the employer didn't
// publish one, and saying so honestly beats guessing.
//
// v1 scope (deliberately narrower than the full brief):
//   - one range per job. Multiple DIFFERENT ranges → ambiguous, store raw only.
//     (Databricks publishes four "Zone" ranges that are usually IDENTICAL, so
//     dedupe first — that alone resolves most multi-range postings.)
//   - base pay only. If OTE appears alongside base, take base and flag it.
//   - period stored as disclosed. Never convert hourly→annual.
//   - USD ONLY (Patrick's call, 2026-08-23). Non-USD compensation is detected
//     and recorded as "non-usd" but never displayed. Publishing "€100,000"
//     next to "$100,000" invites people to compare numbers that aren't
//     comparable, and we don't convert currencies.
//
// Returns:
//   { status, min, max, currency, period, raw, has_ote }
//   status: "parsed"    — USD, safe to display
//           "non-usd"   — employer disclosed pay in another currency
//           "ambiguous" — pay mentioned but not safely parseable
//           "none"      — no compensation disclosed

// ---------------------------------------------------------------------------
// Context gates — a number is only compensation if it sits near comp language.
// ---------------------------------------------------------------------------

// Section headings that introduce compensation.
const COMP_HEADINGS = [
  "compensation", "salary", "pay range", "pay transparency", "base pay",
  "salary range", "compensation & benefits", "compensation and benefits",
  "total rewards", "pay range transparency", "annual salary", "base salary",
  "expected salary", "compensation range", "pay", "salary information",
];

// Phrases that must appear near a number for it to count as pay.
const COMP_CONTEXT = /\b(salary|compensation|base pay|pay range|annual pay|hourly rate|hourly|per hour|OTE|on-target earnings|on target earnings|total cash|pay for this role|paid|earn)\b/i;

// Phrases that disqualify a number even if it looks like money. These are the
// false positives the brief warns about: funding, budgets, perks, stipends.
const NOT_COMP = /\b(revenue|valuation|budget|funding|raised|ARR|contract value|market cap|stipend|relocation|reimburse\w*|allowance|per diem|wellness|learning|equipment|home ?office|donation|match(?:ing)? up to|401\s?\(?k\)?|savings|discount|bonus pool|grant|equity|options|RSU)\b/i;

// ---------------------------------------------------------------------------
// Number + currency parsing
// ---------------------------------------------------------------------------

const CURRENCY_BY_SYMBOL = [
  [/\bCA\$|\bC\$|\bCAD\b/i, "CAD"],
  [/\bA\$|\bAUD\b/i, "AUD"],
  [/\bNZ\$|\bNZD\b/i, "NZD"],
  [/\bS\$|\bSGD\b/i, "SGD"],
  [/£|\bGBP\b/i, "GBP"],
  [/€|\bEUR\b/i, "EUR"],
  [/¥|\bJPY\b/i, "JPY"],
  [/\bCHF\b/i, "CHF"],
  [/\bINR\b|₹/i, "INR"],
  [/\bUSD\b/i, "USD"],
];

/** "$180,000" | "180K" | "180k" → 180000. Returns null if not a clean number. */
function toNumber(digits, kSuffix) {
  const cleaned = String(digits).replace(/[, ]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  let n = parseFloat(cleaned);
  if (kSuffix) n *= 1000;
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

// A bare "$" is used by the US, Canada, Australia, Singapore and others, so it
// is not self-identifying. We resolve it only from evidence already on the
// record: an explicit code in the posting, or the job's OWN parsed country
// when that country is unambiguous. Anything else stays null.
const DOLLAR_BY_COUNTRY = { US: "USD", CA: "CAD", AU: "AUD", SG: "SGD", NZ: "NZD" };

/** Currency from an explicit symbol/code, then from the job's country, else null. */
function detectCurrency(window, wholeText, job) {
  for (const [re, code] of CURRENCY_BY_SYMBOL) {
    if (re.test(window)) return code;
  }
  if (/\$/.test(window)) {
    if (/\bUSD\b/i.test(wholeText)) return "USD";
    // Single-country postings tell us which dollar this is.
    const countries = Array.isArray(job && job.location_countries) ? job.location_countries : [];
    if (countries.length === 1 && DOLLAR_BY_COUNTRY[countries[0]]) return DOLLAR_BY_COUNTRY[countries[0]];
    // Multi-country US+CA postings: both use "$" but at different values —
    // refuse rather than pick one.
    return null;
  }
  return null;
}

/** Pay period as disclosed. Never inferred from magnitude. */
function detectPeriod(window) {
  if (/\b(per hour|\/\s?hour|\/\s?hr\b|hourly|an hour)\b/i.test(window)) return "hour";
  if (/\b(per month|\/\s?month|monthly|a month)\b/i.test(window)) return "month";
  if (/\b(per week|\/\s?week|weekly)\b/i.test(window)) return "week";
  if (/\b(per day|\/\s?day|daily|per diem)\b/i.test(window)) return "day";
  if (/\b(per year|\/\s?year|\/\s?yr\b|annual\w*|per annum|yearly|a year)\b/i.test(window)) return "year";
  return null;
}

// Sanity bounds per period — a parse outside these is a parsing error, not a
// salary, and we discard rather than publish something absurd.
const BOUNDS = {
  year:  [10000, 2000000],
  month: [500, 200000],
  week:  [200, 50000],
  day:   [50, 10000],
  hour:  [5, 2000],
};

function plausible(value, period) {
  const b = BOUNDS[period];
  if (!b) return false;
  return value >= b[0] && value <= b[1];
}

// ---------------------------------------------------------------------------
// Range extraction
// ---------------------------------------------------------------------------

const AMOUNT = String.raw`(?:[$£€¥]|CA\$|C\$|A\$|S\$|NZ\$)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k|K)?`;
const DASH = String.raw`\s*(?:-|–|—|to|through)\s*`;
const RANGE_RE = new RegExp(`${AMOUNT}${DASH}${AMOUNT}`, "g");
const SINGLE_RE = new RegExp(AMOUNT, "g");

/** Pull the plain text out of a description (handles both storage shapes). */
function plainText(job) {
  const src = job.description_html || job.description || "";
  return String(src)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentences/segments that plausibly describe pay. */
function compSegments(text) {
  const segs = [];
  // Split on sentence-ish boundaries but keep them reasonably long.
  for (const part of text.split(/(?<=[.!?;])\s+|\n+/)) {
    const s = part.trim();
    if (!s || s.length > 400) continue;
    const headingHit = COMP_HEADINGS.some((h) => s.toLowerCase().includes(h));
    if ((headingHit || COMP_CONTEXT.test(s)) && !NOT_COMP.test(s)) segs.push(s);
  }
  return segs;
}

/** @returns {{status, min, max, currency, period, raw, has_ote}} */
function extractSalary(job) {
  const text = plainText(job);
  const empty = { status: "none", min: null, max: null, currency: null, period: null, raw: null, has_ote: false };
  if (!text) return empty;

  const segments = compSegments(text);
  if (!segments.length) return empty;

  const has_ote = /\b(OTE|on-target earnings|on target earnings)\b/i.test(text);

  const found = [];
  for (const seg of segments) {
    // Prefer explicit ranges; only fall back to single values in the same seg.
    RANGE_RE.lastIndex = 0;
    let m, sawRange = false;
    while ((m = RANGE_RE.exec(seg)) !== null) {
      const lo = toNumber(m[1], m[2]);
      const hi = toNumber(m[3], m[4]);
      if (lo === null || hi === null || hi < lo) continue;
      const period = detectPeriod(seg) || "year";
      if (!plausible(lo, period) || !plausible(hi, period)) continue;
      const currency = detectCurrency(seg, text, job);
      found.push({ min: lo, max: hi, currency, period, raw: m[0].trim(), seg });
      sawRange = true;
    }
    if (sawRange) continue;

    // Single-value forms: "Salary: $180,000", "starting at $150,000",
    // "up to $220,000". Only inside a comp segment, only with a currency mark.
    if (!/[$£€¥]|\b(USD|CAD|GBP|EUR|AUD|SGD|JPY|CHF|INR)\b/i.test(seg)) continue;
    SINGLE_RE.lastIndex = 0;
    const singles = [];
    while ((m = SINGLE_RE.exec(seg)) !== null) {
      const n = toNumber(m[1], m[2]);
      if (n !== null) singles.push({ n, raw: m[0].trim() });
    }
    if (singles.length !== 1) continue; // 0 or many → too ambiguous for v1
    const period = detectPeriod(seg) || "year";
    if (!plausible(singles[0].n, period)) continue;
    const currency = detectCurrency(seg, text, job);
    const startsAt = /\b(starting at|from|minimum of|at least)\b/i.test(seg);
    const upTo = /\b(up to|as much as|maximum of)\b/i.test(seg);
    found.push({
      min: upTo ? null : singles[0].n,
      max: startsAt ? null : singles[0].n,
      currency, period, raw: singles[0].raw, seg,
    });
  }

  if (!found.length) return { ...empty, has_ote };

  // Dedupe identical ranges — Databricks publishes the same numbers under four
  // "Zone" headings; that is one range stated four times, not four ranges.
  const key = (f) => `${f.min}|${f.max}|${f.currency}|${f.period}`;
  const distinct = [...new Map(found.map((f) => [key(f), f])).values()];

  if (distinct.length > 1) {
    // Genuinely different ranges (per-location or per-level). Unknown beats
    // inventing a merged range that means nothing.
    return {
      status: "ambiguous", min: null, max: null, currency: null, period: null,
      raw: distinct.map((d) => d.raw).join(" | ").slice(0, 300), has_ote,
    };
  }

  const f = distinct[0];

  // USD only. Everything else is recorded honestly and displayed never.
  if (f.currency && f.currency !== "USD") {
    return {
      status: "non-usd", min: null, max: null, currency: f.currency,
      period: f.period, raw: f.raw, has_ote,
    };
  }

  if (!f.currency) {
    // We know the numbers but not the unit. Publishing "180,000–240,000" with
    // no currency is worse than publishing nothing.
    return { status: "ambiguous", min: null, max: null, currency: null, period: null, raw: f.raw, has_ote };
  }

  return {
    status: "parsed",
    min: f.min, max: f.max, currency: f.currency, period: f.period,
    raw: f.seg.length <= 200 ? f.seg : f.raw,
    has_ote,
  };
}

/** Display helper — one place formats money for the whole site. */
function formatSalary({ min, max, currency, period }) {
  if (!currency || !period) return null;
  const sym = { USD: "$", CAD: "CA$", GBP: "£", EUR: "€", AUD: "A$", SGD: "S$", JPY: "¥", CHF: "CHF ", NZD: "NZ$", INR: "₹" }[currency] || `${currency} `;
  const short = (n) => (period === "year" && n >= 1000 ? `${Math.round(n / 1000)}K` : n.toLocaleString());
  const unit = { year: "/ year", hour: "/ hour", month: "/ month", week: "/ week", day: "/ day" }[period] || "";
  if (min !== null && max !== null && min !== max) return `${sym}${short(min)}–${sym}${short(max)} ${unit}`.trim();
  if (min !== null && max !== null) return `${sym}${short(min)} ${unit}`.trim();
  if (min !== null) return `From ${sym}${short(min)} ${unit}`.trim();
  if (max !== null) return `Up to ${sym}${short(max)} ${unit}`.trim();
  return null;
}

module.exports = { extractSalary, formatSalary, plainText, compSegments };
