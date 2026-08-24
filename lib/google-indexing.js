// lib/google-indexing.js — tell Google the moment a job appears or closes.
//
// Google's Indexing API exists specifically for JobPosting pages: instead of
// waiting for a crawl, the site notifies Google that a URL was added, updated
// or removed, and Google schedules a fresh crawl promptly. For a site whose
// promise is "jobs at AI companies, found early", telling Google early is the
// whole point.
//
// DESIGN RULES (from the Batch B spec):
//   - Standalone. Nothing in ingestion imports this; a Google outage can never
//     break the pipeline. The pipeline writes OUR data first, then notifies.
//   - No new dependencies. The service-account OAuth flow is a signed JWT,
//     which Node's crypto does natively (RS256). fetch is built in.
//   - Both notification kinds are URL_UPDATED. A closed job's page still
//     EXISTS for up to 7 days (noindexed, with a "role has closed" state), so
//     URL_DELETED — which tells Google the page is gone — would be a lie until
//     the row is actually deleted. URL_UPDATED makes Google recrawl and see
//     the noindex, which is the truth.
//   - Quota-aware. The default quota is 200 publishes/day. We cap each run and
//     spend the budget on NEW jobs first: getting a fresh job discovered is
//     worth more than hastening a dead one's removal, and closed pages are
//     already noindexed the moment Google recrawls them anyway.
//
// Credentials: GOOGLE_INDEXING_KEY env var containing the service account's
// JSON key, verbatim. Absent key = module reports "not configured" and does
// nothing; the pipeline treats that as informational, not an error.

const crypto = require("crypto");

const ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/indexing";

function loadKey() {
  const raw = process.env.GOOGLE_INDEXING_KEY;
  if (!raw) return null;
  try {
    const key = JSON.parse(raw);
    if (!key.client_email || !key.private_key) return null;
    return key;
  } catch {
    return null;
  }
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** OAuth access token via the service-account JWT flow. No libraries. */
async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(key.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data.access_token;
}

/**
 * Publish one notification. Returns a log-friendly record; never throws for
 * per-URL failures (a 4xx on one URL must not abort the batch).
 */
async function publishOne(token, url) {
  const started = new Date().toISOString();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    });
    const body = await res.text();
    return {
      url, type: "URL_UPDATED", at: started, status: res.status,
      ok: res.ok,
      // 429 means the daily quota is spent — the caller stops the batch.
      quotaExhausted: res.status === 429,
      detail: res.ok ? null : body.slice(0, 300),
    };
  } catch (e) {
    return { url, type: "URL_UPDATED", at: started, status: 0, ok: false, quotaExhausted: false, detail: String(e.message).slice(0, 300) };
  }
}

/**
 * Notify Google about a list of URLs, new jobs first.
 *
 * @param {string[]} newUrls     job pages that appeared this cycle
 * @param {string[]} closedUrls  job pages that closed this cycle
 * @param {object}   [opts]      { cap = 180, dryRun = false }
 * @returns {{configured:boolean, sent:number, failed:number, skipped:number, results:Array}}
 */
async function notify(newUrls, closedUrls, opts = {}) {
  const { cap = 180, dryRun = false } = opts;
  const key = loadKey();
  if (!key) {
    return { configured: false, sent: 0, failed: 0, skipped: 0, results: [], note: "GOOGLE_INDEXING_KEY not set or unparseable — skipping (not an error)" };
  }

  // New jobs first; the cap protects the daily quota (200/day default, we
  // leave headroom). Whatever doesn't fit is picked up by the next cycle's
  // window or, failing that, by the ordinary sitemap crawl.
  const queue = [...new Set([...(newUrls || []), ...(closedUrls || [])])].slice(0, cap);
  const skipped = (newUrls || []).length + (closedUrls || []).length - queue.length;

  if (dryRun) {
    return { configured: true, sent: 0, failed: 0, skipped, results: queue.map((url) => ({ url, dryRun: true })) };
  }

  const token = await getAccessToken(key);
  const results = [];
  for (const url of queue) {
    const r = await publishOne(token, url);
    results.push(r);
    if (r.quotaExhausted) {
      // Daily budget gone. Stop cleanly; tomorrow's runs continue.
      break;
    }
  }
  return {
    configured: true,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    skipped: skipped + (queue.length - results.length),
    results,
  };
}

module.exports = { notify, loadKey, getAccessToken, publishOne };
