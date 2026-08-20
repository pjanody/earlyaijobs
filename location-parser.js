// location-parser.js — deterministic location + workplace normalisation. v2.
// No AI, no network. Same input → same output, every decision explainable.
//
// Spec (Gate A, approved):
//   - workplace answers HOW; geography answers WHERE. Independent dimensions.
//   - location_scope is geographic RESOLUTION (worldwide|region|country|state|
//     city|unknown). Multiplicity is location_list.length — "multiple" is not
//     a scope.
//   - ALL locations are preserved and filterable (arrays are projections of
//     location_list and cannot drift from it).
//   - bare "Remote" with no stated geography → scope unknown (conservative;
//     worldwide only when the source says so).
//   - USCA is a documented Databricks source alias — NOT a general
//     concatenated-code parser. GBIE etc. stay unknown.
//   - description workplace pass uses explicit phrases only; conflicts with
//     ATS evidence are flagged, never silently overridden.
//   - unknown is always preferable to a guess.

// ---------- dictionaries ----------

const COUNTRIES = {
  "united states": "US", "united states of america": "US", "usa": "US",
  "u.s.": "US", "u.s.a.": "US", "us": "US", "america": "US",
  "canada": "CA", "mexico": "MX", "brazil": "BR", "argentina": "AR",
  "chile": "CL", "colombia": "CO", "peru": "PE", "costa rica": "CR",
  "united kingdom": "GB", "uk": "GB", "u.k.": "GB", "great britain": "GB",
  "england": "GB", "scotland": "GB", "wales": "GB",
  "ireland": "IE", "france": "FR", "germany": "DE", "spain": "ES",
  "portugal": "PT", "italy": "IT", "netherlands": "NL", "the netherlands": "NL",
  "belgium": "BE", "switzerland": "CH", "austria": "AT", "poland": "PL",
  "czech republic": "CZ", "czechia": "CZ", "romania": "RO", "hungary": "HU",
  "greece": "GR", "sweden": "SE", "norway": "NO", "denmark": "DK",
  "finland": "FI", "iceland": "IS", "luxembourg": "LU", "ukraine": "UA",
  "estonia": "EE", "latvia": "LV", "lithuania": "LT", "slovakia": "SK",
  "slovenia": "SI", "croatia": "HR", "bulgaria": "BG", "serbia": "RS",
  "turkey": "TR", "israel": "IL", "united arab emirates": "AE", "uae": "AE",
  "saudi arabia": "SA", "qatar": "QA", "egypt": "EG", "south africa": "ZA",
  "nigeria": "NG", "kenya": "KE",
  "japan": "JP", "china": "CN", "hong kong": "HK", "taiwan": "TW",
  "south korea": "KR", "korea": "KR", "singapore": "SG", "india": "IN",
  "australia": "AU", "new zealand": "NZ", "thailand": "TH", "vietnam": "VN",
  "philippines": "PH", "indonesia": "ID", "malaysia": "MY",
};

const COUNTRY_NAMES = {
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina",
  CL: "Chile", CO: "Colombia", PE: "Peru", CR: "Costa Rica", GB: "United Kingdom",
  IE: "Ireland", FR: "France", DE: "Germany", ES: "Spain", PT: "Portugal",
  IT: "Italy", NL: "Netherlands", BE: "Belgium", CH: "Switzerland", AT: "Austria",
  PL: "Poland", CZ: "Czechia", RO: "Romania", HU: "Hungary", GR: "Greece",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", IS: "Iceland",
  LU: "Luxembourg", UA: "Ukraine", EE: "Estonia", LV: "Latvia", LT: "Lithuania",
  SK: "Slovakia", SI: "Slovenia", HR: "Croatia", BG: "Bulgaria", RS: "Serbia",
  TR: "Turkey", IL: "Israel", AE: "United Arab Emirates", SA: "Saudi Arabia",
  QA: "Qatar", EG: "Egypt", ZA: "South Africa", NG: "Nigeria", KE: "Kenya",
  JP: "Japan", CN: "China", HK: "Hong Kong", TW: "Taiwan", KR: "South Korea",
  SG: "Singapore", IN: "India", AU: "Australia", NZ: "New Zealand",
  TH: "Thailand", VN: "Vietnam", PH: "Philippines", ID: "Indonesia", MY: "Malaysia",
};

// ISO-style codes appearing as suffixes: "Dublin, IE" · "Zürich, CH" · "Ontario, CAN"
const COUNTRY_CODES = { can: "CA", uk: "GB" };
for (const code of Object.keys(COUNTRY_NAMES)) COUNTRY_CODES[code.toLowerCase()] = code;

const US_STATES = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California",
  co: "Colorado", ct: "Connecticut", de: "Delaware", fl: "Florida", ga: "Georgia",
  hi: "Hawaii", id: "Idaho", il: "Illinois", in: "Indiana", ia: "Iowa",
  ks: "Kansas", ky: "Kentucky", la: "Louisiana", me: "Maine", md: "Maryland",
  ma: "Massachusetts", mi: "Michigan", mn: "Minnesota", ms: "Mississippi",
  mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada", nh: "New Hampshire",
  nj: "New Jersey", nm: "New Mexico", ny: "New York", nc: "North Carolina",
  nd: "North Dakota", oh: "Ohio", ok: "Oklahoma", or: "Oregon", pa: "Pennsylvania",
  ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota", tn: "Tennessee",
  tx: "Texas", ut: "Utah", vt: "Vermont", va: "Virginia", wa: "Washington",
  wv: "West Virginia", wi: "Wisconsin", wy: "Wyoming", dc: "District of Columbia",
};

const CA_PROVINCES = {
  "ontario": "Ontario", "british columbia": "British Columbia", "quebec": "Quebec",
  "québec": "Quebec", "alberta": "Alberta", "manitoba": "Manitoba",
  "saskatchewan": "Saskatchewan", "nova scotia": "Nova Scotia",
  "new brunswick": "New Brunswick",
};

const CITIES = {
  "san francisco": ["US", "California"], "new york": ["US", "New York"],
  "new york city": ["US", "New York"], "nyc": ["US", "New York"],
  "seattle": ["US", "Washington"], "austin": ["US", "Texas"],
  "boston": ["US", "Massachusetts"], "chicago": ["US", "Illinois"],
  "los angeles": ["US", "California"], "san diego": ["US", "California"],
  "san jose": ["US", "California"], "palo alto": ["US", "California"],
  "mountain view": ["US", "California"], "menlo park": ["US", "California"],
  "sunnyvale": ["US", "California"], "denver": ["US", "Colorado"],
  "boulder": ["US", "Colorado"], "atlanta": ["US", "Georgia"],
  "miami": ["US", "Florida"], "dallas": ["US", "Texas"], "houston": ["US", "Texas"],
  "philadelphia": ["US", "Pennsylvania"], "pittsburgh": ["US", "Pennsylvania"],
  "portland": ["US", "Oregon"], "phoenix": ["US", "Arizona"],
  "salt lake city": ["US", "Utah"], "minneapolis": ["US", "Minnesota"],
  "nashville": ["US", "Tennessee"], "raleigh": ["US", "North Carolina"],
  "detroit": ["US", "Michigan"], "columbus": ["US", "Ohio"],
  // NOTE: bare "washington" is deliberately NOT here. "Remote - Washington"
  // means Washington State; only the explicit D.C. forms mean the district.
  "washington dc": ["US", "District of Columbia"],
  "bellevue": ["US", "Washington"], "redmond": ["US", "Washington"],
  "kirkland": ["US", "Washington"],
  "toronto": ["CA", "Ontario"], "vancouver": ["CA", "British Columbia"],
  "montreal": ["CA", "Quebec"], "montréal": ["CA", "Quebec"],
  "london": ["GB", null], "edinburgh": ["GB", null], "manchester": ["GB", null],
  "bristol": ["GB", null], "leeds": ["GB", null], "dublin": ["IE", null],
  "paris": ["FR", null], "berlin": ["DE", null], "munich": ["DE", null],
  "münchen": ["DE", null], "frankfurt": ["DE", null], "hamburg": ["DE", null],
  "zurich": ["CH", null], "zürich": ["CH", null], "geneva": ["CH", null],
  "amsterdam": ["NL", null], "brussels": ["BE", null], "vienna": ["AT", null],
  "warsaw": ["PL", null], "krakow": ["PL", null], "kraków": ["PL", null],
  "prague": ["CZ", null], "lisbon": ["PT", null], "madrid": ["ES", null],
  "barcelona": ["ES", null], "milan": ["IT", null], "rome": ["IT", null],
  "stockholm": ["SE", null], "copenhagen": ["DK", null], "oslo": ["NO", null],
  "helsinki": ["FI", null], "tel aviv": ["IL", null], "dubai": ["AE", null],
  "doha": ["QA", null], "tokyo": ["JP", null], "osaka": ["JP", null],
  "seoul": ["KR", null], "singapore": ["SG", null], "hong kong": ["HK", null],
  "taipei": ["TW", null], "sydney": ["AU", null], "melbourne": ["AU", null],
  "auckland": ["NZ", null], "bangalore": ["IN", null], "bengaluru": ["IN", null],
  "mumbai": ["IN", null], "delhi": ["IN", null], "new delhi": ["IN", null],
  "hyderabad": ["IN", null], "são paulo": ["BR", null], "sao paulo": ["BR", null],
  "mexico city": ["MX", null],
};

const REGION_TOKENS = {
  "worldwide": "worldwide", "anywhere": "worldwide", "global": "worldwide",
  "emea": "emea", "apac": "apac", "asia pacific": "apac", "asia-pacific": "apac",
  "latam": "latin-america", "latin america": "latin-america",
  "europe": "europe", "european union": "europe", "eu": "europe",
  "north america": "north-america", "middle east": "middle-east", "africa": "africa",
  "us time zones": "north-america", "americas": "north-america",
};

const REGION_MEMBERS = {
  "north-america": ["US", "CA", "MX"],
  "latin-america": ["MX", "BR", "AR", "CL", "CO", "PE", "CR"],
  "europe": ["GB","IE","FR","DE","ES","PT","IT","NL","BE","CH","AT","PL","CZ","RO","HU","GR","SE","NO","DK","FI","IS","LU","UA","EE","LV","LT","SK","SI","HR","BG","RS"],
  "middle-east": ["IL","AE","SA","QA","TR","EG"],
  "africa": ["ZA","NG","KE","EG"],
  "apac": ["JP","CN","HK","TW","KR","SG","IN","AU","NZ","TH","VN","PH","ID","MY"],
};
REGION_MEMBERS.emea = [...new Set([...REGION_MEMBERS.europe, ...REGION_MEMBERS["middle-east"], ...REGION_MEMBERS.africa])];

// Source-specific location aliases.
// USCA: Databricks-specific location code meaning a remote role eligible in
// the United States and Canada. This is a documented source-specific mapping,
// NOT a generic concatenated-country parser — GBIE, USMX etc. stay unknown.
const SOURCE_ALIASES = {
  "usca": {
    workplace_type: "remote",
    list: [{ country_code: "US", state: null, city: null }, { country_code: "CA", state: null, city: null }],
    location_source: "source-specific-rule",
  },
};

// ---------- workplace detection ----------

// Explicit description phrases only, each with a RULE ID so every
// description-derived classification can be traced to the exact pattern and
// matched sentence that produced it. Generic mentions ("our office",
// "remote team", "distributed systems") deliberately do NOT match.
const DESC_RULES = [
  // --- hybrid ---
  { id: "hybrid:li-tag",        value: "hybrid",  re: /#LI-hybrid\b/i },
  { id: "hybrid:explicit",      value: "hybrid",  re: /\bhybrid (role|position|work(ing)?|model|schedule|policy)\b/i },
  { id: "hybrid:office-days",   value: "hybrid",  re: /\b\d+ days? (a|per) week (in|at)( the)? office\b|\bminimum \d+ days? (on-?site|in( the)? office)\b/i },
  { id: "hybrid:split-time",    value: "hybrid",  re: /\bsplit (your )?time between home and (the )?office\b/i },
  { id: "hybrid:percent-policy",value: "hybrid",  re: /\bin (one of )?our offices? at least \d+%? (of the time|per)\b|\bexpect(ed)? (all staff|employees|you) to be in (one of )?(our|the) offices?\b/i },
  // --- on-site ---
  { id: "onsite:li-tag",        value: "on-site", re: /#LI-onsite\b/i },
  { id: "onsite:explicit",      value: "on-site", re: /\bon-?site (role|position)\b|\bin-?office (role|position)\b|\boffice-based (role|position)\b/i },
  { id: "onsite:must-work",     value: "on-site", re: /\bmust work from (our|the) office\b|\b(five|5) days? (a|per) week (in|at)( the)? office\b/i },
  // --- remote ---
  { id: "remote:li-tag",        value: "remote",  re: /#LI-remote\b/i },
  { id: "remote:fully",         value: "remote",  re: /\bfully remote\b|\b100% remote\b|\bremote-first\b/i },
  { id: "remote:this-role",     value: "remote",  re: /\bthis (position|role) (is|can be) remote\b/i },
  { id: "remote:explicit",      value: "remote",  re: /\bremote (role|position)\b|\bwork remotely\b/i },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/** Run the description rules independently of any other evidence.
 *  Returns { value, rule, text } or null. Rules are ordered hybrid → on-site
 *  → remote, because hybrid postings routinely mention "remote" too. */
function detectWorkplaceFromDescription(description) {
  const d = String(description || "");
  if (!d) return null;
  for (const rule of DESC_RULES) {
    const m = d.match(rule.re);
    if (m) {
      const i = Math.max(0, m.index - 80);
      const text = d.slice(i, m.index + m[0].length + 80).replace(/\s+/g, " ").trim();
      return { value: rule.value, rule: rule.id, text };
    }
  }
  return null;
}

/** Workplace from ATS field, raw location text, then description phrases.
 *  Returns the chosen value plus FULL evidence from every source, so a
 *  conflict can be audited without re-deriving anything. */
function detectWorkplace(atsWorkplace, rawText, description) {
  const ats = norm(atsWorkplace);
  let atsValue = null;
  if (["remote", "hybrid", "on-site"].includes(ats)) atsValue = ats;
  else if (ats === "onsite" || ats === "on site") atsValue = "on-site";

  const t = norm(rawText);
  let textValue = null;
  if (/\bhybrid\b/.test(t)) textValue = "hybrid";
  else if (/\bremote\b/.test(t)) textValue = "remote";
  else if (/\bon-?site\b|\bin-?office\b/.test(t)) textValue = "on-site";

  const desc = detectWorkplaceFromDescription(description);
  const evidence = {
    ats: atsValue,
    location_text: textValue,
    description: desc ? desc.value : null,
    description_rule: desc ? desc.rule : null,
    description_text: desc ? desc.text : null,
  };

  if (atsValue) {
    return { value: atsValue, source: "ats", conflict: Boolean(desc && desc.value !== atsValue), evidence };
  }
  if (textValue) {
    return { value: textValue, source: "location-text", conflict: Boolean(desc && desc.value !== textValue), evidence };
  }
  if (desc) {
    return { value: desc.value, source: "description", conflict: false, evidence, rule: desc.rule };
  }
  return { value: "unknown", source: "none", conflict: false, evidence };
}

// ---------- segment parsing ----------

function title(s) {
  return String(s).replace(/\p{L}[\p{L}'’-]*/gu, (w) => w[0].toUpperCase() + w.slice(1));
}

/** Parse one location segment → {city,state,country_code} | {region_code} | null. */
function parseSegment(segRaw) {
  let seg = norm(segRaw)
    .replace(/\bd\.c\.?/g, "dc")
    // "Remote-Friendly, United States" was parsing "Friendly" as a city.
    // (There is a real Friendly, West Virginia — population 100 — but no AI
    // company is hiring there, and the phrase is always workplace language.)
    .replace(/\bremote[-\s]?friendly\b/g, " ")
    .replace(/\btravel[-\s]?required\b/g, " ")
    .replace(/\b(remote|hybrid|on-?site|friendly)\b/g, " ")
    .replace(/[():]/g, " ")
    .replace(/\bselect locations\b/g, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/^[-,\s]+|[-,\s]+$/g, "")
    .replace(/,\s*$/, "").replace(/\s*,\s*/g, ", ");
  if (!seg) return null;

  for (const [token, code] of Object.entries(REGION_TOKENS)) {
    if (seg === token || seg.includes(token)) return { region_code: code };
  }

  let m = seg.match(/^(.+?),\s*([a-z]{2})$/);
  if (m && US_STATES[m[2]]) return { city: title(m[1].trim()), state: US_STATES[m[2]], country_code: "US" };

  const parts = seg.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const first = parts[0];
    if (COUNTRIES[last]) {
      const cc = COUNTRIES[last];
      const known = CITIES[first];
      return { city: title(first), state: known && known[0] === cc ? known[1] : null, country_code: cc };
    }
    if (COUNTRY_CODES[last]) {
      const cc = COUNTRY_CODES[last];
      if (CA_PROVINCES[first]) return { state: CA_PROVINCES[first], country_code: cc };
      const known = CITIES[first];
      return { city: title(first), state: known && known[0] === cc ? known[1] : null, country_code: cc };
    }
    const stateName = Object.values(US_STATES).find((s) => s.toLowerCase() === last);
    if (stateName) return { city: title(first), state: stateName, country_code: "US" };
  }

  if (COUNTRIES[seg]) return { country_code: COUNTRIES[seg] };

  // "D.C." alone (normalised to "dc" above). The ONLY bare two-letter state
  // abbreviation we accept — "in", "or", "de" etc. are ordinary words/codes.
  if (seg === "dc") return { city: "Washington", state: "District of Columbia", country_code: "US" };

  // Known city BEFORE bare state: "New York" alone means the city in job
  // postings, not the state. (State-level postings write "New York State"
  // or arrive as lists like "Maryland; Virginia".)
  if (CITIES[seg]) {
    const [cc, state] = CITIES[seg];
    return { city: title(seg), state, country_code: cc };
  }

  const bareState = Object.values(US_STATES).find((s) => s.toLowerCase() === seg);
  if (bareState) return { state: bareState, country_code: "US" };
  if (CA_PROVINCES[seg]) return { state: CA_PROVINCES[seg], country_code: "CA" };

  const words = seg.split(" ").map((w) => w.replace(/,$/, ""));
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      if (COUNTRIES[phrase]) return { country_code: COUNTRIES[phrase] };
      if (REGION_TOKENS[phrase]) return { region_code: REGION_TOKENS[phrase] };
      if (CITIES[phrase]) {
        const [cc, state] = CITIES[phrase];
        return { city: title(phrase), state, country_code: cc };
      }
    }
  }
  return null;
}

/** Parse one structured ATS location entry (Greenhouse office / Ashby
 *  address). Uses structured fields when present, falls back to name text. */
function parseStructuredEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const addr = entry.address && typeof entry.address === "object" ? entry.address : entry;
  const countryRaw = norm(addr.addressCountry || addr.country || "");
  const cc = COUNTRIES[countryRaw] || COUNTRY_CODES[countryRaw] || null;
  const city = addr.addressLocality || addr.locality || addr.city || null;
  const state = addr.addressRegion || addr.region || addr.state || null;
  if (cc || city || state) {
    return {
      city: city ? title(norm(city)) : null,
      state: state ? title(norm(String(state))) : null,
      country_code: cc,
    };
  }
  const text = entry.location || entry.name || null;
  return text ? parseSegment(String(text)) : null;
}

// ---------- main ----------

const RELATIONSHIP_DEFAULT = {
  remote: "eligibility", hybrid: "both", "on-site": "office", unknown: "unknown",
};

/**
 * @param {{location?: string, workplace_type?: string, description?: string,
 *          ats_locations?: {source?: string, items?: object[]}}} job
 */
function parseLocation(job) {
  const raw = String(job.location || "");
  const wp = detectWorkplace(job.workplace_type, raw, job.description);
  const qa = [];
  if (wp.conflict) qa.push("workplace-source-conflict");

  // Source-specific aliases run first (whole-string match on the raw field).
  const alias = SOURCE_ALIASES[norm(raw)];
  if (alias) {
    return finish({
      wp: { value: alias.workplace_type || wp.value, source: "source-specific-rule" },
      list: alias.list, regions: [], source: alias.location_source, qa, raw,
    });
  }

  // Structured ATS locations are higher-authority evidence than the raw string.
  let list = [];
  let regions = [];
  let source = "none";

  const structured = job.ats_locations && Array.isArray(job.ats_locations.items) ? job.ats_locations.items : null;
  if (structured && structured.length) {
    for (const entry of structured) {
      const p = parseStructuredEntry(entry);
      if (!p) continue;
      if (p.region_code) { if (!regions.includes(p.region_code)) regions.push(p.region_code); continue; }
      pushUnique(list, p);
    }
    if (list.length || regions.length) {
      source = job.ats_locations.source === "ashby-structured" ? "ashby-structured" : "greenhouse-structured";
    }
  }

  // Fall back to the raw location string.
  if (!list.length && !regions.length) {
    const segments = raw.split(/\s*[|;\/]\s*|\s+or\s+/i).filter((s) => s.trim());

    // Context pass: names that are both a city and a US state ("New York")
    // are read as STATES when a sibling segment is a bare state — e.g.
    // "Maryland; Virginia; New York" is a list of states, while "New York"
    // alone is the city. Deterministic, and only affects ambiguous names.
    const parsedSegs = segments.map((seg) => ({ seg, p: parseSegment(seg) }));
    const hasBareStateSibling = parsedSegs.some(
      ({ p }) => p && p.state && !p.city && p.country_code === "US"
    );

    for (const { seg, p } of parsedSegs) {
      if (!p) continue;
      if (p.region_code) { if (!regions.includes(p.region_code)) regions.push(p.region_code); continue; }

      let entry = p;
      // Only reinterpret when the state was INFERRED from the city itself
      // (state null, or identical to the city name). An explicitly stated
      // different state — "Washington, D.C." → District of Columbia — is
      // real evidence and must survive.
      const stateWasInferred = !p.state || norm(p.state) === norm(p.city);
      if (hasBareStateSibling && p.city && p.country_code === "US" && stateWasInferred) {
        const asState = Object.values(US_STATES).find(
          (s) => s.toLowerCase() === norm(p.city)
        );
        if (asState) entry = { state: asState, country_code: "US" };
      }
      pushUnique(list, entry);
    }
    if (list.length || regions.length) {
      source = wp.source === "ats" ? "ats+raw-parser" : "raw-location-parser";
    }
  }

  return finish({ wp, list, regions, source, qa, raw });
}

function pushUnique(list, p) {
  const entry = {
    country_code: p.country_code || null,
    state: p.state || null,
    city: p.city || null,
  };
  if (!list.some((e) => e.city === entry.city && e.state === entry.state && e.country_code === entry.country_code)) {
    list.push(entry);
  }
}

function finish({ wp, list, regions, source, qa, raw }) {
  const primary = list[0] || {};

  // Scope = geographic RESOLUTION of the primary location. Multiplicity is
  // location_list.length, not a scope value.
  let scope = "unknown";
  if (regions.includes("worldwide")) scope = "worldwide";
  else if (primary.city) scope = "city";
  else if (primary.state) scope = "state";
  else if (primary.country_code) scope = "country";
  else if (regions.length) scope = "region";
  // bare "Remote" with no geography stays unknown — conservative by spec.

  // Arrays are projections of location_list — computed, never independent.
  const countries = [...new Set(list.map((e) => e.country_code).filter(Boolean))];
  const states = [...new Set(list.map((e) => e.state).filter(Boolean))];
  const cities = [...new Set(list.map((e) => e.city).filter(Boolean))];
  const regionCodes = regions.filter((r) => r !== "worldwide");

  const anyGeo = scope !== "unknown";

  return {
    workplace_type: wp.value,
    workplace_source: wp.source,
    workplace_rule: wp.rule || null,
    workplace_evidence: wp.evidence || null,
    location_scope: scope,
    location_relationship: anyGeo || wp.value !== "unknown" ? RELATIONSHIP_DEFAULT[wp.value] : "unknown",
    location_region_codes: regionCodes,
    location_countries: countries,
    location_states: states,
    location_cities: cities,
    location_list: list,
    location_source: source,
    location_qa_flags: qa,
  };
}

module.exports = {
  parseLocation, parseSegment, parseStructuredEntry, detectWorkplace,
  detectWorkplaceFromDescription, DESC_RULES,
  COUNTRIES, COUNTRY_NAMES, COUNTRY_CODES, CITIES, REGION_TOKENS,
  REGION_MEMBERS, SOURCE_ALIASES, US_STATES, CA_PROVINCES,
};
