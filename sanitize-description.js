// sanitize-description.js — deterministic allowlist HTML sanitizer for
// employer job descriptions. No dependencies, no network, no AI.
//
// Contract (the whole point of Phase B):
//   EVERY WORD of the employer's text survives. Only markup is filtered.
//   Output contains ONLY tags this module itself constructs — nothing from
//   the source passes through verbatim, which is what makes it XSS-safe:
//     - allowlisted structure tags, attributes discarded
//     - <a> rebuilt with a validated http(s) href and safe rel/target
//     - script/style/iframe etc. removed WITH their contents
//     - every other tag dropped, its inner text kept
//
// Greenhouse double-encodes the whole document ("&lt;p&gt;"), so we decode
// entities exactly once before tokenizing — same rule the text cleaner uses.

const ALLOWED = new Set([
  "p", "br", "ul", "ol", "li", "strong", "b", "em", "i",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
]);

// Tags whose CONTENT is not employer prose and must go with the tag.
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "noscript", "svg", "head", "title", "object", "embed"]);

function decodeOnce(s) {
  return String(s || "")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

function escapeText(s) {
  return s.replace(/&(?![a-zA-Z]{2,8};|#\d{1,6};|#x[0-9a-fA-F]{1,5};)/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hrefOf(attrs) {
  const m = String(attrs || "").match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const url = (m && (m[1] || m[2] || m[3]) || "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/** @param {string} html raw (possibly entity-encoded) ATS description HTML
 *  @returns {string|null} sanitized HTML, or null for empty input */
// Real HTML tag names we expect from ATS output. A "<" starting anything else
// ("x <y comparisons", "< 5 years") is employer prose, not markup — escape it
// so the tokenizer can't eat the words after it.
const KNOWN_TAG = "p|br|ul|ol|li|strong|b|em|i|h[1-6]|blockquote|a|div|span|script|style|iframe|noscript|svg|head|title|object|embed|table|thead|tbody|tfoot|tr|td|th|hr|img|u|s|strike|small|sub|sup|code|pre|section|article|header|footer|figure|figcaption|form|input|button|label|center|font|main|nav|aside|mark|time|abbr|dl|dt|dd|html|body|meta|link|source|video|audio|picture";
const NOT_A_TAG_RE = new RegExp(`<(?!\\/?(?:${KNOWN_TAG})[\\s/>]|\\/?(?:${KNOWN_TAG})>|!)`, "gi");

function sanitizeDescriptionHtml(html) {
  if (!html || !String(html).trim()) return null;
  const src = decodeOnce(html).replace(NOT_A_TAG_RE, "&lt;");
  const tokens = src.split(/(<[^>]*>)/);
  const out = [];
  const stack = [];           // open allowlisted tags, for balancing
  let dropUntil = null;       // inside a DROP_WITH_CONTENT element

  for (const tok of tokens) {
    const isTag = tok.startsWith("<") && tok.endsWith(">");
    if (!isTag) {
      if (!dropUntil && tok) out.push(escapeText(tok));
      continue;
    }
    const m = tok.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*?)?)\/?\s*>$/);
    if (!m) continue; // malformed tag — drop it, keep going
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = m[3];

    if (dropUntil) {
      if (closing && name === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing) dropUntil = name;
      continue;
    }

    if (name === "br") { out.push("<br>"); continue; }

    if (name === "a") {
      if (closing) {
        const i = stack.lastIndexOf("a");
        if (i !== -1) { stack.splice(i, 1); out.push("</a>"); }
      } else {
        const url = hrefOf(attrs);
        if (url) {
          out.push(`<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer nofollow">`);
          stack.push("a");
        }
        // no valid http(s) href → tag dropped, text inside is kept
      }
      continue;
    }

    if (ALLOWED.has(name)) {
      if (closing) {
        const i = stack.lastIndexOf(name);
        if (i !== -1) { stack.splice(i, 1); out.push(`</${name}>`); }
      } else {
        out.push(`<${name}>`);
        stack.push(name);
      }
    }
    // anything else: tag vanishes, surrounding text stays
  }

  // Close whatever the source left open, innermost first.
  for (let i = stack.length - 1; i >= 0; i--) out.push(`</${stack[i]}>`);

  const result = out.join("").replace(/(<br>\s*){3,}/g, "<br><br>").trim();
  return result || null;
}

/** Visible text of an HTML string — for fidelity testing. Mirrors what a
 *  reader (or screen reader) receives. */
function textOf(html) {
  return decodeOnce(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

module.exports = { sanitizeDescriptionHtml, textOf, decodeOnce };
