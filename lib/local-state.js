// lib/local-state.js — pure logic for the local-first features (saved jobs,
// visit state). No React, no window access at module level: every function
// takes a storage object, so the exact code that runs in the browser is
// unit-tested in Node with a fake storage.
//
// Storage contract (per the retention-sprint brief):
//   - namespaced keys:            earlyaijobs:saved-jobs, :visit-state
//   - every payload is versioned: { version: 1, ... }
//   - IDs only, never job metadata (metadata goes stale; fetch fresh by ID)
//   - malformed/unavailable storage NEVER throws — falls back to empty state

export const KEYS = {
  saved: "earlyaijobs:saved-jobs",
  visit: "earlyaijobs:visit-state",
  bannerDismissed: "earlyaijobs:new-jobs-banner-dismissed", // sessionStorage
  sessionStart: "earlyaijobs:session-start",                 // sessionStorage
};

// The browser event islands use to stay in sync on the same page.
export const CHANGE_EVENT = "earlyaijobs:local-state-change";

// ---------- safe storage primitives ----------

export function safeRead(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function safeWrite(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota/private mode — feature degrades, app never crashes
  }
}

// Job IDs come back OUT of storage and INTO database queries, so they are
// untrusted input. Ours are integers; anything else is discarded.
export function validId(id) {
  return /^\d{1,12}$/.test(String(id));
}

// ---------- saved jobs ----------

export function readSaved(storage) {
  const data = safeRead(storage, KEYS.saved);
  if (!data || data.version !== 1 || typeof data.jobs !== "object" || !data.jobs) {
    return { version: 1, jobs: {} };
  }
  const jobs = {};
  for (const [id, meta] of Object.entries(data.jobs)) {
    if (validId(id)) jobs[id] = { savedAt: (meta && meta.savedAt) || null };
  }
  return { version: 1, jobs };
}

export function isSaved(storage, id) {
  return Boolean(readSaved(storage).jobs[String(id)]);
}

export function toggleSaved(storage, id, now = new Date().toISOString()) {
  const sid = String(id);
  if (!validId(sid)) return { saved: false, count: savedCount(storage) };
  const data = readSaved(storage);
  let saved;
  if (data.jobs[sid]) {
    delete data.jobs[sid];
    saved = false;
  } else {
    data.jobs[sid] = { savedAt: now };
    saved = true;
  }
  safeWrite(storage, KEYS.saved, data);
  return { saved, count: Object.keys(data.jobs).length };
}

export function savedCount(storage) {
  return Object.keys(readSaved(storage).jobs).length;
}

/** IDs sorted most-recently-saved first — the /saved page default order. */
export function savedIds(storage) {
  return Object.entries(readSaved(storage).jobs)
    .sort((a, b) => String(b[1].savedAt || "").localeCompare(String(a[1].savedAt || "")))
    .map(([id]) => id);
}

// ---------- visit state ----------
//
// The sequencing trap the brief warns about: the PREVIOUS visit timestamp
// must be read and returned BEFORE anything overwrites it. beginVisit() does
// read-then-write in one step and is session-stable: within one browsing
// session (sessionStorage marker), repeated calls return the same reference
// timestamp and do NOT advance the stored visit time.

export function beginVisit(storage, session, now = new Date().toISOString()) {
  // Same session? Reuse the reference point captured when the session began.
  try {
    const marker = session.getItem(KEYS.sessionStart);
    if (marker) {
      const parsed = JSON.parse(marker);
      if (parsed && typeof parsed === "object" && "previousVisitAt" in parsed) {
        return { previousVisitAt: parsed.previousVisitAt, firstVisit: !parsed.previousVisitAt };
      }
    }
  } catch { /* fall through to fresh-session path */ }

  // New session: read the last visit BEFORE overwriting it.
  const data = safeRead(storage, KEYS.visit);
  const previousVisitAt =
    data && data.version === 1 && typeof data.currentVisitAt === "string"
      ? data.currentVisitAt
      : null;

  safeWrite(storage, KEYS.visit, { version: 1, previousVisitAt, currentVisitAt: now });
  try { session.setItem(KEYS.sessionStart, JSON.stringify({ previousVisitAt, sessionStartedAt: now })); } catch { /* fine */ }

  return { previousVisitAt, firstVisit: !previousVisitAt };
}

/** Validate a since= URL value: real ISO date, not in the future, max 90 days
 *  old (older than that, "new since your last visit" stops meaning anything). */
export function validSince(value) {
  if (!value || typeof value !== "string" || value.length > 40) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  if (t > now || now - t > 90 * 24 * 3600000) return null;
  return new Date(t).toISOString();
}
