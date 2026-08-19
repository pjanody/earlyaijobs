// language-parser.js — deterministic posting-language detection. No AI, no
// network, no statistical model. Two stages:
//
//   1. Unicode script analysis — Japanese/Chinese/Korean/Cyrillic characters
//      are unambiguous. This alone catches our real-world problem (Japanese
//      Databricks postings).
//   2. Stopword ratios for Latin-script languages — "the/and/for" vs
//      "der/und/für" vs "le/et/pour". Function words are the most frequent
//      words in any language and almost never overlap.
//
// Evidence priority: the DESCRIPTION decides; the title is only consulted
// when the description is missing or too short. "Solutions Architect" based
// in Tokyo with an English description is an English posting.
//
// Returns "und" (undetermined) when evidence is thin — and the site POLICY is
// that "und" stays visible. A detector confused by "C++ Python SQL AWS" must
// never hide a legitimate posting.

const STOPWORDS = {
  en: ["the","and","for","with","you","will","our","are","this","that","have","team","work","role","as","be","we","to","of","in","is","on"],
  de: ["der","die","das","und","für","mit","sie","wir","ist","nicht","eine","als","auch","werden","bei","oder","dem","den","ein","zu"],
  fr: ["le","la","les","et","pour","vous","nous","dans","une","des","est","sont","avec","qui","que","du","au","aux","vos","nos"],
  es: ["el","los","las","para","con","una","que","es","en","del","por","como","más","nuestro","equipo","trabajo","será","sus"],
  pt: ["os","as","para","com","uma","que","em","do","da","não","por","você","nossa","equipe","trabalho","será","seus","mais"],
  pl: ["i","w","na","do","jest","się","nie","oraz","przez","dla","jako","które","pracy","zespołu","będzie","twoje","nasz","lub"],
  it: ["il","la","le","per","con","una","che","di","del","non","sono","nel","della","lavoro","nostro","team","sarà","più"],
  nl: ["de","het","en","voor","met","een","van","is","niet","op","bij","worden","je","onze","werk","team","zal","naar"],
};

const SCRIPTS = [
  { lang: "ja", name: "hiragana/katakana", re: /[぀-ヿ]/g },
  { lang: "zh", name: "han",               re: /[一-鿿]/g },
  { lang: "ko", name: "hangul",            re: /[가-힯]/g },
  { lang: "ru", name: "cyrillic",          re: /[Ѐ-ӿ]/g },
];

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** Detect language of a single text. Returns { language, method }. */
function detectText(text) {
  const t = String(text || "");
  if (!t.trim()) return { language: "und", method: "empty" };

  // Stage 1 — scripts. Ratio over all letters, so code snippets and numbers
  // don't dilute the signal.
  const letters = (t.match(/\p{L}/gu) || []).length;
  if (letters === 0) return { language: "und", method: "no-letters" };

  const hira = countMatches(t, SCRIPTS[0].re);
  const han = countMatches(t, SCRIPTS[1].re);
  const hangul = countMatches(t, SCRIPTS[2].re);
  const cyr = countMatches(t, SCRIPTS[3].re);

  // Japanese uses hiragana/katakana + han; Chinese uses han alone.
  if ((hira + han) / letters > 0.15) {
    return { language: hira > 0 ? "ja" : "zh", method: "script" };
  }
  if (hangul / letters > 0.15) return { language: "ko", method: "script" };
  if (cyr / letters > 0.30) return { language: "ru", method: "script" };

  // Stage 2 — stopword ratios for Latin scripts.
  const words = t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 8) return { language: "und", method: "too-short" };

  const hits = {};
  for (const [lang, stops] of Object.entries(STOPWORDS)) {
    const set = new Set(stops);
    hits[lang] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
  }

  const ranked = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  const [bestLang, bestHits] = ranked[0];
  const en = hits.en;

  // English wins ties: our corpus is overwhelmingly English, and false
  // exclusion is the expensive mistake.
  if (en >= bestHits) return en >= 3 ? { language: "en", method: "stopwords" } : { language: "und", method: "weak-signal" };
  if (bestHits >= 5 && bestHits > en * 1.5) return { language: bestLang, method: "stopwords" };
  if (en >= 3) return { language: "en", method: "stopwords" };
  return { language: "und", method: "weak-signal" };
}

/**
 * Detect the language of a job posting.
 * @param {{title?: string, description?: string}} job
 * @returns {{ language: string, method: string, basis: "description"|"title" }}
 */
function detectPostingLanguage(job) {
  const desc = String(job.description || "");
  if (desc.trim().length >= 40) {
    const r = detectText(desc);
    return { ...r, basis: "description" };
  }
  const r = detectText(job.title || "");
  return { ...r, basis: "title" };
}

// Languages the site currently publishes. Lives in CODE, not the database —
// posting_language is stored; supported-ness is derived here so changing the
// set is a one-line edit, never a migration. "und" is included by policy.
const SUPPORTED_LANGUAGES = new Set(["en", "und"]);

module.exports = { detectPostingLanguage, detectText, SUPPORTED_LANGUAGES };
