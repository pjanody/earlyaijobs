// test-google-indexing.js — unit tests for the Indexing API module.
// Run: node test-google-indexing.js    (no network — Google is faked)
//
// The network calls are stubbed by overriding global.fetch, so these tests
// exercise our real logic: JWT shape, quota stop, new-before-closed ordering,
// per-URL failure isolation, and the not-configured path.

const crypto = require("crypto");

let pass = 0, fail = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`PASS  ${name}`); })
    .catch((e) => { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); });
}
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const assert = (c, m) => { if (!c) throw new Error(m); };

// A real (throwaway) RSA key so the JWT actually signs.
const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const FAKE_KEY = JSON.stringify({ client_email: "bot@test.iam.gserviceaccount.com", private_key: privateKey });

(async () => {
const realFetch = global.fetch;

await check("not configured → reports it and sends nothing", async () => {
  delete process.env.GOOGLE_INDEXING_KEY;
  delete require.cache[require.resolve("./lib/google-indexing")];
  const { notify } = require("./lib/google-indexing");
  const r = await notify(["https://x/1"], [], {});
  eq(r.configured, false, "configured");
  eq(r.sent, 0, "sent");
});

await check("malformed key JSON → treated as not configured, no throw", async () => {
  process.env.GOOGLE_INDEXING_KEY = "{not json";
  delete require.cache[require.resolve("./lib/google-indexing")];
  const { notify } = require("./lib/google-indexing");
  const r = await notify(["https://x/1"], [], {});
  eq(r.configured, false, "configured");
});

process.env.GOOGLE_INDEXING_KEY = FAKE_KEY;
delete require.cache[require.resolve("./lib/google-indexing")];
const { notify, getAccessToken, loadKey } = require("./lib/google-indexing");

await check("JWT is well-formed and RS256-signed with the right claims", async () => {
  let captured;
  global.fetch = async (url, opts) => {
    captured = new URLSearchParams(opts.body).get("assertion");
    return { ok: true, json: async () => ({ access_token: "tok" }) };
  };
  const token = await getAccessToken(loadKey());
  eq(token, "tok", "token returned");
  const [h, c, s] = captured.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  const claims = JSON.parse(Buffer.from(c, "base64url"));
  eq(header.alg, "RS256", "alg");
  eq(claims.iss, "bot@test.iam.gserviceaccount.com", "iss");
  eq(claims.scope, "https://www.googleapis.com/auth/indexing", "scope");
  eq(claims.aud, "https://oauth2.googleapis.com/token", "aud");
  assert(claims.exp - claims.iat === 3600, "1h expiry");
  assert(s && s.length > 100, "signature present");
});

await check("dry run lists URLs, sends nothing, still dedupes and caps", async () => {
  global.fetch = async () => { throw new Error("network hit during dry run!"); };
  const r = await notify(["https://x/1", "https://x/1"], ["https://x/2"], { dryRun: true, cap: 2 });
  eq(r.sent, 0, "sent");
  eq(r.results.length, 2, "deduped to 2 within cap");
});

await check("new jobs are notified before closed jobs when the cap bites", async () => {
  const sent = [];
  global.fetch = async (url, opts) => {
    if (url.includes("oauth2")) return { ok: true, json: async () => ({ access_token: "t" }) };
    sent.push(JSON.parse(opts.body).url);
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const r = await notify(["https://x/new1", "https://x/new2"], ["https://x/closed1"], { cap: 2 });
  eq(r.sent, 2, "two sent");
  eq(JSON.stringify(sent), JSON.stringify(["https://x/new1", "https://x/new2"]), "new first, closed sacrificed");
  eq(r.skipped, 1, "closed one counted as skipped");
});

await check("HTTP 429 (quota exhausted) stops the batch cleanly", async () => {
  let calls = 0;
  global.fetch = async (url, opts) => {
    if (url.includes("oauth2")) return { ok: true, json: async () => ({ access_token: "t" }) };
    calls++;
    if (calls === 2) return { ok: false, status: 429, text: async () => "quota" };
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const r = await notify(["https://x/1", "https://x/2", "https://x/3", "https://x/4"], [], {});
  eq(r.sent, 1, "one succeeded");
  eq(r.failed, 1, "the 429 recorded");
  eq(r.skipped, 2, "rest skipped, not attempted");
});

await check("one URL failing does not abort the others", async () => {
  let calls = 0;
  global.fetch = async (url, opts) => {
    if (url.includes("oauth2")) return { ok: true, json: async () => ({ access_token: "t" }) };
    calls++;
    if (calls === 1) return { ok: false, status: 403, text: async () => "forbidden" };
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const r = await notify(["https://x/1", "https://x/2", "https://x/3"], [], {});
  eq(r.sent, 2, "others still sent");
  eq(r.failed, 1, "failure recorded");
  assert(r.results[0].detail.includes("forbidden"), "failure reason logged");
});

await check("every result carries url, type, timestamp and status (the audit log)", async () => {
  global.fetch = async (url) =>
    url.includes("oauth2")
      ? { ok: true, json: async () => ({ access_token: "t" }) }
      : { ok: true, status: 200, text: async () => "{}" };
  const r = await notify(["https://x/1"], [], {});
  const rec = r.results[0];
  for (const field of ["url", "type", "at", "status", "ok"]) assert(field in rec, `missing ${field}`);
  eq(rec.type, "URL_UPDATED", "type");
});

global.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
