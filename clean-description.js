// clean-description.js
// Turns a raw ATS description into role-specific classification text.
// Pure function module — no database, no network, no LLM. Importable and
// unit-testable in isolation.
//
//   full raw description
//     -> remove company boilerplate (exact line match, conservative)
//     -> find role-start heading (line-aware; structural headings preferred)
//     -> find trailing/stop heading (line-aware only)
//     -> extract role-specific text
//     -> fall back to cleaned full text if extraction looks unsafe
//     -> classification text (NO character cap)
//
// v1.1 changes:
//   - heading detection is LINE-AWARE: "Compensation" counts as a heading when
//     it is a heading-like line, not when the word appears mid-sentence.
//   - structural headings are separated from weak introductory phrases
//     ("you will", "in this role"), which are only consulted as a fallback.
//   - added retained-ratio safeguard (extraction must keep >= 15% of the
//     cleaned text, otherwise fall back).
//   - provenance now reports raw -> cleaned -> extracted lengths.

const CLEANER_VERSION = "1.1";

// Structural headings: real section titles. Matched only on heading-like lines.
const STRUCTURAL_ROLE_HEADINGS = [
  "about the role", "about this role", "the role", "role overview", "role summary",
  "position summary", "job summary", "job description", "about the position",
  "about the team", "about the job", "the opportunity", "your opportunity",
  "responsibilities", "key responsibilities", "core responsibilities",
  "what you'll do", "what you will do", "what you’ll do", "what you'll be doing",
  "what you’ll be doing", "what you will be doing", "your impact",
  "the impact you'll have", "what you'll own", "what you’ll own",
  "what we're looking for", "what we’re looking for", "day to day", "day-to-day",
];

// Weak introductory phrases. Used ONLY when no structural heading is found,
// and they may appear mid-prose. They must never outrank a real heading.
const FALLBACK_ROLE_PHRASES = [
  "in this role", "you will", "you'll be responsible", "you’ll be responsible",
  "as a member of", "we are looking for", "we're looking for", "we’re looking for",
];

// Stop headings: matched ONLY on heading-like lines. The words "compensation",
// "privacy" or "background check" occurring inside ordinary responsibilities
// must never truncate the role text.
const STOP_HEADINGS = [
  "benefits", "benefits and perks", "perks and benefits", "our benefits",
  "compensation", "total compensation", "compensation and benefits",
  "annual salary", "salary range", "pay range", "pay transparency", "base pay",
  "equal opportunity", "equal employment opportunity", "eeo", "eeoc",
  "accommodations", "reasonable accommodation", "privacy", "privacy policy",
  "how to apply", "application process", "application deadline",
  "e-verify", "visa sponsorship", "background check", "export control",
  "about anthropic", "about openai", "about us", "our mission", "why join",
];

// A stop heading is only honoured if enough role text precedes it.
const MIN_ROLE_TEXT_BEFORE_STOP = 600;
// Extraction must yield at least this much text.
const MIN_EXTRACTED_CHARS = 300;
// ...and at least this fraction of the cleaned description.
const MIN_RETAINED_RATIO = 0.15;
// Heading-like lines are short.
const MAX_HEADING_LINE_CHARS = 80;
const MAX_HEADING_WORDS = 8;

function normaliseLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

/** Split text into lines and record each line's character offset. */
function lineOffsets(text) {
  const lines = text.split("\n");
  const offsets = [];
  let pos = 0;
  for (const line of lines) { offsets.push(pos); pos += line.length + 1; }
  return { lines, offsets };
}

/**
 * A line looks like a heading when it is short and is not a full sentence:
 * either it ends with a colon, or it is few words and lacks terminal
 * punctuation. "Responsibilities" and "What you'll do:" qualify;
 * "...benefits of joining are many and we will describe the role now."
 * does not.
 */
function isHeadingLike(line) {
  const t = normaliseLine(line);
  if (!t || t.length > MAX_HEADING_LINE_CHARS) return false;
  if (/:$/.test(t)) return true;
  const words = t.split(/\s+/).length;
  const hasTerminalPunctuation = /[.!?]$/.test(t);
  return words <= MAX_HEADING_WORDS && !hasTerminalPunctuation;
}

/** Does this line begin with one of the phrases (ignoring trailing colon)? */
function headingPhraseOf(line, phrases) {
  const t = normaliseLine(line).toLowerCase().replace(/[:\-–—\s]+$/, "");
  for (const p of phrases) {
    if (t === p || t.startsWith(p)) return p;
  }
  return null;
}

/** First heading-like line matching any phrase. Returns {idx, phrase, line}. */
function findHeadingLine(text, phrases, minCharIdx = 0) {
  const { lines, offsets } = lineOffsets(text);
  for (let i = 0; i < lines.length; i++) {
    if (offsets[i] < minCharIdx) continue;
    if (!isHeadingLike(lines[i])) continue;
    const phrase = headingPhraseOf(lines[i], phrases);
    if (phrase) return { idx: offsets[i], phrase, line: normaliseLine(lines[i]) };
  }
  return { idx: -1, phrase: null, line: null };
}

/** Fallback: earliest occurrence of a weak phrase anywhere in the text. */
function findFallbackPhrase(textLower, phrases) {
  let best = { idx: -1, phrase: null };
  for (const p of phrases) {
    const i = textLower.indexOf(p);
    if (i !== -1 && (best.idx === -1 || i < best.idx)) best = { idx: i, phrase: p };
  }
  return best;
}

/**
 * Remove lines present in this company's boilerplate dictionary.
 * Exact normalised match only — conservative by design for v1.1.
 */
function removeBoilerplate(description, boilerplateSet) {
  const lines = String(description || "").split("\n");
  const kept = [];
  let removed = 0;
  for (const raw of lines) {
    const line = normaliseLine(raw);
    if (!line) continue;
    if (boilerplateSet && boilerplateSet.has(line)) { removed++; continue; }
    kept.push(line);
  }
  return { text: kept.join("\n"), linesRemoved: removed };
}

/**
 * Produce classification text from a raw description.
 * @param {object} job {title, description}
 * @param {Set<string>} boilerplateSet may be empty/undefined
 * @returns {{text, provenance}}
 */
function buildClassificationText(job, boilerplateSet) {
  const raw = String(job.description || "");
  const provenance = {
    cleaner_version: CLEANER_VERSION,
    raw_length: raw.length,
    cleaned_length: 0,
    boilerplate_lines_removed: 0,
    detection_mode: null,        // structural-heading | fallback-phrase | none
    role_heading: null,
    role_heading_index: null,
    stop_heading: null,
    stop_heading_index: null,
    stop_heading_ignored_reason: null,
    fallback_reason: null,
    method: null,                // heading-extraction | cleaned-full | empty-source
    final_length: 0,
  };

  if (!raw.trim()) {
    provenance.method = "empty-source";
    return { text: "", provenance };
  }

  // Stage 1 — boilerplate removal (never allowed to empty a job)
  const { text: cleaned, linesRemoved } = removeBoilerplate(raw, boilerplateSet);
  provenance.boilerplate_lines_removed = linesRemoved;
  const working = cleaned.trim() ? cleaned : raw;
  if (!cleaned.trim()) provenance.fallback_reason = "boilerplate-removal-emptied-text";
  provenance.cleaned_length = working.length;
  const lower = working.toLowerCase();

  // Stage 2 — locate the role section: structural headings first
  let role = findHeadingLine(working, STRUCTURAL_ROLE_HEADINGS);
  if (role.idx !== -1) {
    provenance.detection_mode = "structural-heading";
  } else {
    const weak = findFallbackPhrase(lower, FALLBACK_ROLE_PHRASES);
    if (weak.idx !== -1) {
      role = { idx: weak.idx, phrase: weak.phrase, line: null };
      provenance.detection_mode = "fallback-phrase";
    }
  }

  if (role.idx === -1) {
    provenance.detection_mode = "none";
    provenance.method = "cleaned-full";
    provenance.fallback_reason = provenance.fallback_reason || "no-role-heading-found";
    provenance.final_length = working.length;
    return { text: working, provenance };
  }
  provenance.role_heading = role.phrase;
  provenance.role_heading_index = role.idx;

  // Stage 3 — trailing boilerplate: heading-like lines only, after the role start
  const stop = findHeadingLine(working, STOP_HEADINGS, role.idx + String(role.phrase).length);
  let endIdx = working.length;
  if (stop.idx !== -1) {
    provenance.stop_heading = stop.phrase;
    provenance.stop_heading_index = stop.idx;
    if (stop.idx - role.idx >= MIN_ROLE_TEXT_BEFORE_STOP) {
      endIdx = stop.idx;
    } else {
      provenance.stop_heading_ignored_reason =
        `only ${stop.idx - role.idx} chars of role text before stop heading (min ${MIN_ROLE_TEXT_BEFORE_STOP})`;
    }
  }

  const extracted = working.slice(role.idx, endIdx).trim();

  // Stage 4 — accept only if substantial in absolute and relative terms
  const ratio = working.length > 0 ? extracted.length / working.length : 0;
  if (extracted.length < MIN_EXTRACTED_CHARS) {
    provenance.method = "cleaned-full";
    provenance.fallback_reason = `extraction produced only ${extracted.length} chars (min ${MIN_EXTRACTED_CHARS})`;
    provenance.final_length = working.length;
    return { text: working, provenance };
  }
  if (ratio < MIN_RETAINED_RATIO) {
    provenance.method = "cleaned-full";
    provenance.fallback_reason =
      `extraction retained only ${(ratio * 100).toFixed(1)}% of cleaned text (min ${MIN_RETAINED_RATIO * 100}%)`;
    provenance.final_length = working.length;
    return { text: working, provenance };
  }

  provenance.method = "heading-extraction";
  provenance.final_length = extracted.length;
  return { text: extracted, provenance };
}

module.exports = {
  CLEANER_VERSION,
  STRUCTURAL_ROLE_HEADINGS,
  FALLBACK_ROLE_PHRASES,
  STOP_HEADINGS,
  MIN_ROLE_TEXT_BEFORE_STOP,
  MIN_EXTRACTED_CHARS,
  MIN_RETAINED_RATIO,
  isHeadingLike,
  removeBoilerplate,
  buildClassificationText,
};
