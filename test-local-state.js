// test-local-state.js — unit tests for the local-first storage logic.
// Run: node test-local-state.js     (no browser, no database, no network)
//
// Uses a fake storage so the EXACT production code paths run in Node,
// including the malformed-data and storage-unavailable branches.

let mod;
(async () => {
mod = await import("./lib/local-state.js");
const {
  KEYS, readSaved, isSaved, toggleSaved, savedCount, savedIds,
  readRecent, recordView, recentIds, clearRecent, beginVisit, validSince, validId,
} = mod;

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
function brokenStorage() {
  return {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
  };
}

// ---------- saved jobs ----------
check("save → unsave round trip, counts update", () => {
  const s = fakeStorage();
  assert(toggleSaved(s, 123).saved === true, "first toggle saves");
  assert(isSaved(s, 123), "isSaved true");
  assert(savedCount(s) === 1, "count 1");
  assert(toggleSaved(s, 123).saved === false, "second toggle unsaves");
  assert(savedCount(s) === 0, "count 0");
});

check("duplicate save does not duplicate", () => {
  const s = fakeStorage();
  toggleSaved(s, 5); toggleSaved(s, 5); toggleSaved(s, 5);
  assert(savedCount(s) === 1, `count ${savedCount(s)}`);
});

check("state persists across 'reload' (same storage, fresh reads)", () => {
  const s = fakeStorage();
  toggleSaved(s, 42, "2026-08-22T10:00:00Z");
  toggleSaved(s, 99, "2026-08-22T11:00:00Z");
  assert(savedIds(s).join(",") === "99,42", "most recently saved first");
});

check("malformed saved-jobs storage falls back to empty", () => {
  const s = fakeStorage({ [KEYS.saved]: "{not json" });
  assert(savedCount(s) === 0, "empty");
  assert(toggleSaved(s, 7).saved === true, "recovers by writing fresh state");
});

check("wrong version treated as empty (future-migration safety)", () => {
  const s = fakeStorage({ [KEYS.saved]: JSON.stringify({ version: 99, jobs: { 1: {} } }) });
  assert(savedCount(s) === 0, "v99 ignored");
});

check("storage unavailable never throws", () => {
  const s = brokenStorage();
  assert(savedCount(s) === 0, "read fallback");
  const r = toggleSaved(s, 1);
  assert(r.saved === true || r.saved === false, "toggle returns without throwing");
});

check("invalid IDs from storage are discarded (untrusted input)", () => {
  const s = fakeStorage({
    [KEYS.saved]: JSON.stringify({ version: 1, jobs: { "123": {}, "abc": {}, "1;drop table": {}, "": {} } }),
  });
  assert(savedIds(s).join(",") === "123", `got ${savedIds(s)}`);
  assert(validId("383589") && !validId("x") && !validId("1e9") && !validId(""), "validId rules");
});

// ---------- recently viewed ----------
check("view adds, duplicate moves to front with fresh timestamp", () => {
  const s = fakeStorage();
  recordView(s, 1, "t1"); recordView(s, 2, "t2"); recordView(s, 1, "t3");
  const jobs = readRecent(s).jobs;
  assert(jobs.map(j => j.id).join(",") === "1,2", `order ${jobs.map(j => j.id)}`);
  assert(jobs[0].viewedAt === "t3", "timestamp updated");
});

check("capped at 20", () => {
  const s = fakeStorage();
  for (let i = 1; i <= 30; i++) recordView(s, i);
  assert(recentIds(s).length === 20, `${recentIds(s).length}`);
  assert(recentIds(s)[0] === "30", "newest first");
});

check("malformed recent storage falls back, clear works", () => {
  const s = fakeStorage({ [KEYS.recent]: JSON.stringify({ version: 1, jobs: "nope" }) });
  assert(recentIds(s).length === 0, "fallback");
  recordView(s, 8);
  clearRecent(s);
  assert(recentIds(s).length === 0, "cleared");
});

// ---------- visit state ----------
check("first visit: no previous timestamp, no banner", () => {
  const local = fakeStorage(), session = fakeStorage();
  const v = beginVisit(local, session, "2026-08-22T12:00:00.000Z");
  assert(v.firstVisit === true && v.previousVisitAt === null, JSON.stringify(v));
});

check("second visit (new session) sees the FIRST visit's timestamp", () => {
  const local = fakeStorage();
  beginVisit(local, fakeStorage(), "2026-08-21T09:00:00.000Z"); // visit 1
  const v2 = beginVisit(local, fakeStorage(), "2026-08-22T09:00:00.000Z"); // visit 2, new session
  assert(v2.previousVisitAt === "2026-08-21T09:00:00.000Z", `got ${v2.previousVisitAt}`);
  assert(v2.firstVisit === false, "not first");
});

check("timestamp is not overwritten before being read (the trap)", () => {
  const local = fakeStorage();
  beginVisit(local, fakeStorage(), "2026-08-20T00:00:00.000Z");
  const v = beginVisit(local, fakeStorage(), "2026-08-22T00:00:00.000Z");
  // If the implementation wrote before reading, previousVisitAt would equal
  // the CURRENT call's timestamp and the new-jobs count would always be 0.
  assert(v.previousVisitAt !== "2026-08-22T00:00:00.000Z", "read-before-write violated");
});

check("internal navigation (same session) does not advance the reference", () => {
  const local = fakeStorage(), session = fakeStorage();
  beginVisit(local, fakeStorage(), "2026-08-21T00:00:00.000Z"); // prior visit
  const a = beginVisit(local, session, "2026-08-22T10:00:00.000Z");
  const b = beginVisit(local, session, "2026-08-22T10:05:00.000Z"); // nav to another page
  const c = beginVisit(local, session, "2026-08-22T10:30:00.000Z");
  assert(a.previousVisitAt === b.previousVisitAt && b.previousVisitAt === c.previousVisitAt, "stable within session");
  const stored = JSON.parse(local.getItem(KEYS.visit));
  assert(stored.currentVisitAt === "2026-08-22T10:00:00.000Z", "visit time not advanced by navigation");
});

check("malformed visit storage → treated as first visit", () => {
  const local = fakeStorage({ [KEYS.visit]: "garbage{{" });
  const v = beginVisit(local, fakeStorage(), "2026-08-22T12:00:00.000Z");
  assert(v.firstVisit === true, "fallback to first visit");
});

// ---------- since= URL validation ----------
check("validSince accepts recent ISO, rejects junk/future/ancient", () => {
  const recent = new Date(Date.now() - 24 * 3600000).toISOString();
  assert(validSince(recent) !== null, "recent accepted");
  assert(validSince("not-a-date") === null, "junk rejected");
  assert(validSince(new Date(Date.now() + 3600000).toISOString()) === null, "future rejected");
  assert(validSince("2020-01-01T00:00:00Z") === null, "ancient rejected");
  assert(validSince("x".repeat(100)) === null, "oversized rejected");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
