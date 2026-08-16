// deterministic-classifier.js
// EarlyAIJobs deterministic role classifier v1.0
// No LLM/API calls. Same taxonomy family as classify-jobs.js v7.
//
// Design:
// - classify category and specialization by weighted evidence
// - score all candidates, not just the winner
// - compute placement fit and confidence from observable evidence
// - keep metadata uncertainty separate from classification uncertainty
// - review only concrete placement problems / low-confidence classification

const TAXONOMY_VERSION = "2.0";
const CLASSIFIER_VERSION = "deterministic-1.0";
const CONFIDENCE_VERSION = "evidence-margin-1.0";

const TAXONOMY = {
  "engineering":      ["software-engineering","ai-engineering","machine-learning","mlops","backend","frontend","full-stack","robotics","other"],
  "research":         ["ai-research","llm-generative-ai","reinforcement-learning","ai-safety","interpretability","computer-vision","nlp","robotics","other"],
  "data":             ["data-science","data-engineering","analytics","ai-data","other"],
  "product":          ["product-management","ai-product","product-operations","other"],
  "design":           ["product-design","ai-design","ux-research","visual-design","other"],
  "infrastructure":   ["ai-infrastructure","compute-gpu","inference","platform","cloud","data-center","software-engineering","other"],
  "security":         ["ai-security","cybersecurity","application-security","platform-security","trust-safety","other"],
  "solutions":        ["ai-solutions","solutions-architecture","implementation","technical-consulting","other"],
  "sales":            ["sales","enterprise-sales","mid-market-sales","account-management","partnerships","business-development","sales-engineering","other"],
  "marketing":        ["marketing","product-marketing","growth","developer-relations","communications","brand","content","other"],
  "customer-success": ["customer-success","technical-account-management","implementation","customer-education","other"],
  "operations":       ["program-management","project-management","business-operations","strategy-operations","procurement","workplace-operations","other"],
  "legal-compliance": ["legal","compliance","privacy","ai-governance","contracts","other"],
  "policy":           ["policy","government-affairs","public-affairs","economic-policy","other"],
  "people":           ["recruiting","people-operations","hr","talent","employee-relations","other"],
  "finance":          ["finance","accounting","fp-and-a","treasury","tax","investor-relations","other"],
  "education":        ["education-training","curriculum","learning-development","other"],
  "other":            ["other"],
};

const CATEGORIES = Object.keys(TAXONOMY);
const SENIORITIES = ["intern","entry","junior","mid","senior","staff","principal","lead","manager","director","vp","executive","unknown"];
const WORKPLACES = ["remote","hybrid","on-site","unknown"];
const LOCATION_TYPES = ["worldwide","country","region","state-province","city","unknown"];
const EMPLOYMENT = ["full-time","part-time","contract","internship","temporary","unknown"];

function R(phrase, weight, opts = {}) {
  return { phrase, weight, ...opts };
}

// Title evidence should dominate isolated description keywords.
// Exact/common title phrases receive the largest weights.
const CATEGORY_RULES = {
  engineering: [
    R("software engineer", 28), R("software developer", 27), R("machine learning engineer", 32),
    R("ml engineer", 32), R("ai engineer", 32), R("backend engineer", 30),
    R("frontend engineer", 30), R("front end engineer", 30), R("full stack engineer", 30),
    R("full-stack engineer", 30), R("robotics engineer", 30), R("engineering manager", 24),
    R("developer", 10), R("engineer", 8)
  ],
  research: [
    R("research scientist", 34), R("research engineer", 30), R("researcher", 28),
    R("applied scientist", 30), R("scientist", 14), R("research", 12)
  ],
  data: [
    R("data scientist", 32), R("data engineer", 32), R("analytics engineer", 28),
    R("data analyst", 30), R("analytics", 16), R("data science", 20)
  ],
  product: [
    R("product manager", 34), R("product management", 28), R("product operations", 32),
    R("product ops", 30), R("head of product", 32), R("vp of product", 32),
    R("product lead", 28)
  ],
  design: [
    R("product designer", 34), R("ux researcher", 34), R("ux designer", 32),
    R("visual designer", 32), R("design lead", 25), R("designer", 20)
  ],
  infrastructure: [
    R("infrastructure engineer", 34), R("platform engineer", 30), R("site reliability engineer", 32),
    R("sre", 28), R("cloud engineer", 30), R("systems engineer", 22),
    R("data center", 24), R("gpu", 16), R("compute", 12), R("inference infrastructure", 28)
  ],
  security: [
    R("security engineer", 34), R("security analyst", 30), R("security researcher", 26),
    R("cybersecurity", 28), R("trust and safety", 28), R("trust & safety", 28),
    R("application security", 30), R("appsec", 30)
  ],
  solutions: [
    R("solutions architect", 34), R("solution architect", 34), R("solutions engineer", 32),
    R("solution engineer", 32), R("technical consultant", 30), R("implementation consultant", 28),
    R("forward deployed engineer", 25)
  ],
  sales: [
    R("account executive", 36), R("sales development representative", 36), R("business development representative", 34),
    R("sales engineer", 30), R("account manager", 30), R("business development", 28),
    R("partnerships", 26), R("sales", 24), R("commercial", 12)
  ],
  marketing: [
    R("product marketing", 34), R("growth marketing", 34), R("developer advocate", 36),
    R("developer relations", 36), R("developer evangelist", 36), R("technical evangelist", 36),
    R("content marketing", 30), R("communications", 28), R("brand", 22), R("marketing", 24),
    R("community manager", 24)
  ],
  "customer-success": [
    R("customer success", 36), R("customer experience", 28), R("technical account manager", 34),
    R("customer education", 30), R("customer support", 24)
  ],
  operations: [
    R("program manager", 32), R("project manager", 32), R("business operations", 34),
    R("strategy and operations", 34), R("strategy & operations", 34), R("chief of staff", 26),
    R("procurement", 30), R("workplace operations", 32), R("operations", 20)
  ],
  "legal-compliance": [
    R("counsel", 34), R("lawyer", 34), R("attorney", 34), R("legal", 30),
    R("compliance", 30), R("privacy", 26), R("contracts", 26)
  ],
  policy: [
    R("policy", 32), R("government affairs", 34), R("public affairs", 32),
    R("economic policy", 34)
  ],
  people: [
    R("recruiter", 36), R("recruiting", 34), R("talent acquisition", 34),
    R("people operations", 34), R("human resources", 32), R("hr ", 24),
    R("employee relations", 30), R("talent", 22)
  ],
  finance: [
    R("chief financial officer", 38), R("cfo", 38), R("finance", 30),
    R("accountant", 32), R("accounting", 30), R("fp&a", 32), R("financial planning", 30),
    R("treasury", 30), R("tax", 28), R("investor relations", 30)
  ],
  education: [
    R("curriculum", 32), R("learning and development", 32), R("learning & development", 32),
    R("instructional designer", 30), R("educator", 28), R("trainer", 24), R("education", 24)
  ]
};

const SPECIALIZATION_RULES = {
  engineering: {
    "software-engineering": [R("software engineer", 26), R("software development", 18), R("software systems", 14)],
    "ai-engineering": [R("ai engineer", 30), R("artificial intelligence", 14), R("ai systems", 18), R("ai application", 16)],
    "machine-learning": [R("machine learning", 28), R("ml engineer", 30), R("deep learning", 18), R("pytorch", 8), R("tensorflow", 8)],
    "mlops": [R("mlops", 30), R("model deployment", 18), R("model serving", 18), R("ml platform", 18), R("feature store", 14)],
    "backend": [R("backend", 30), R("back-end", 30), R("server-side", 16), R("distributed systems", 12)],
    "frontend": [R("frontend", 30), R("front-end", 30), R("react", 10), R("typescript", 8)],
    "full-stack": [R("full stack", 30), R("full-stack", 30)],
    "robotics": [R("robotics", 30), R("robot", 18), R("autonomous systems", 16)]
  },
  research: {
    "ai-research": [R("ai research", 28), R("artificial intelligence research", 26), R("machine learning research", 24), R("research scientist", 12)],
    "llm-generative-ai": [R("large language model", 28), R("llm", 26), R("generative ai", 26), R("foundation model", 24), R("pre-training", 22), R("post-training", 22), R("token", 8)],
    "reinforcement-learning": [R("reinforcement learning", 32), R("rlhf", 30), R("reward model", 26), R("policy optimization", 26), R("rl ", 16)],
    "ai-safety": [R("ai safety", 30), R("alignment", 28), R("red team", 22), R("safeguards", 20), R("model safety", 28), R("biosecurity", 18), R("biological safety", 20)],
    "interpretability": [R("interpretability", 34), R("mechanistic interpretability", 34), R("model internals", 14)],
    "computer-vision": [R("computer vision", 32), R("vision model", 24), R("image recognition", 20), R("multimodal vision", 18)],
    "nlp": [R("natural language processing", 32), R("nlp", 30), R("language understanding", 18)],
    "robotics": [R("robotics", 32), R("robot learning", 26), R("embodied ai", 24)]
  },
  data: {
    "data-science": [R("data scientist", 30), R("data science", 28), R("statistical modeling", 18), R("experimentation", 10)],
    "data-engineering": [R("data engineer", 30), R("data pipeline", 22), R("etl", 20), R("data warehouse", 18), R("spark", 10)],
    "analytics": [R("analytics", 28), R("data analyst", 28), R("business intelligence", 24), R("bi ", 10)],
    "ai-data": [R("training data", 28), R("data labeling", 26), R("annotation", 22), R("synthetic data", 24), R("ai data", 24)]
  },
  product: {
    "product-management": [R("product manager", 30), R("product management", 28), R("product strategy", 18), R("roadmap", 10)],
    "ai-product": [R("ai product", 30), R("model behavior", 22), R("llm product", 26), R("generative ai product", 26)],
    "product-operations": [R("product operations", 32), R("product ops", 32)]
  },
  design: {
    "product-design": [R("product designer", 30), R("product design", 28), R("interaction design", 18)],
    "ai-design": [R("ai design", 30), R("ai interaction", 20), R("conversational design", 22)],
    "ux-research": [R("ux researcher", 32), R("user research", 28), R("ux research", 30)],
    "visual-design": [R("visual designer", 30), R("visual design", 28), R("graphic design", 22)]
  },
  infrastructure: {
    "ai-infrastructure": [R("ai infrastructure", 32), R("ml infrastructure", 30), R("training infrastructure", 28), R("model infrastructure", 26)],
    "compute-gpu": [R("gpu", 28), R("cuda", 28), R("accelerator", 18), R("compute cluster", 24), R("h100", 20)],
    "inference": [R("inference", 30), R("model serving", 22), R("serving stack", 20), R("latency", 10)],
    "platform": [R("platform engineer", 28), R("platform", 22), R("developer platform", 20)],
    "cloud": [R("cloud", 24), R("aws", 12), R("gcp", 12), R("azure", 12), R("kubernetes", 10)],
    "data-center": [R("data center", 32), R("datacenter", 32), R("facility", 12)],
    "software-engineering": [R("software engineer", 22), R("software systems", 16)]
  },
  security: {
    "ai-security": [R("ai security", 32), R("model security", 28), R("llm security", 28), R("adversarial", 14)],
    "cybersecurity": [R("cybersecurity", 30), R("cyber security", 30), R("incident response", 18), R("threat", 12)],
    "application-security": [R("application security", 32), R("appsec", 32), R("secure code", 18)],
    "platform-security": [R("platform security", 32), R("cloud security", 26), R("infrastructure security", 26)],
    "trust-safety": [R("trust and safety", 32), R("trust & safety", 32), R("abuse", 18), R("integrity", 12)]
  },
  solutions: {
    "ai-solutions": [R("ai solutions", 32), R("generative ai solutions", 28), R("llm solutions", 28)],
    "solutions-architecture": [R("solutions architect", 32), R("solution architect", 32), R("architecture", 14)],
    "implementation": [R("implementation", 28), R("deployment", 14), R("onboarding", 12)],
    "technical-consulting": [R("technical consultant", 32), R("consulting", 20), R("advisory", 14)]
  },
  sales: {
    "sales": [R("sales", 26), R("account executive", 22)],
    "enterprise-sales": [R("enterprise", 22), R("enterprise account executive", 32), R("strategic account executive", 26)],
    "mid-market-sales": [R("mid market", 30), R("mid-market", 30)],
    "account-management": [R("account manager", 30), R("account management", 28)],
    "partnerships": [R("partnerships", 30), R("partner", 16), R("alliances", 22)],
    "business-development": [R("business development", 32), R("bd ", 12)],
    "sales-engineering": [R("sales engineer", 32), R("pre-sales", 26), R("presales", 26)]
  },
  marketing: {
    "marketing": [R("marketing", 26)],
    "product-marketing": [R("product marketing", 34)],
    "growth": [R("growth marketing", 32), R("growth", 24), R("acquisition", 14), R("lifecycle", 12)],
    "developer-relations": [R("developer relations", 36), R("developer advocate", 36), R("developer evangelist", 36), R("technical evangelist", 36), R("devrel", 34)],
    "communications": [R("communications", 32), R("public relations", 26), R("pr ", 10)],
    "brand": [R("brand", 30), R("creative strategy", 16)],
    "content": [R("content", 28), R("editorial", 20), R("copywriter", 22)]
  },
  "customer-success": {
    "customer-success": [R("customer success", 34)],
    "technical-account-management": [R("technical account manager", 34), R("tam ", 12)],
    "implementation": [R("implementation", 28), R("onboarding", 18)],
    "customer-education": [R("customer education", 32), R("training customers", 20)]
  },
  operations: {
    "program-management": [R("program manager", 32), R("program management", 30), R("technical program manager", 32)],
    "project-management": [R("project manager", 32), R("project management", 30)],
    "business-operations": [R("business operations", 34), R("bizops", 30)],
    "strategy-operations": [R("strategy and operations", 34), R("strategy & operations", 34), R("strategic operations", 30)],
    "procurement": [R("procurement", 34), R("sourcing", 20), R("vendor management", 18)],
    "workplace-operations": [R("workplace operations", 34), R("facilities", 20), R("office operations", 24)]
  },
  "legal-compliance": {
    "legal": [R("legal", 28), R("counsel", 28), R("attorney", 28)],
    "compliance": [R("compliance", 32), R("regulatory compliance", 28)],
    "privacy": [R("privacy", 32), R("data protection", 24)],
    "ai-governance": [R("ai governance", 34), R("responsible ai", 28), R("model governance", 26)],
    "contracts": [R("contracts", 32), R("commercial contracts", 30)]
  },
  policy: {
    "policy": [R("policy", 28)],
    "government-affairs": [R("government affairs", 34), R("government relations", 30)],
    "public-affairs": [R("public affairs", 34)],
    "economic-policy": [R("economic policy", 34), R("economist", 20)]
  },
  people: {
    "recruiting": [R("recruiter", 34), R("recruiting", 32), R("talent acquisition", 32)],
    "people-operations": [R("people operations", 34), R("people ops", 32)],
    "hr": [R("human resources", 32), R("hr ", 24), R("hrbp", 30)],
    "talent": [R("talent", 28), R("talent management", 30)],
    "employee-relations": [R("employee relations", 34)]
  },
  finance: {
    "finance": [R("finance", 28), R("financial", 18)],
    "accounting": [R("accounting", 32), R("accountant", 32), R("controller", 22)],
    "fp-and-a": [R("fp&a", 34), R("financial planning and analysis", 34)],
    "treasury": [R("treasury", 34)],
    "tax": [R("tax", 32)],
    "investor-relations": [R("investor relations", 34)]
  },
  education: {
    "education-training": [R("training", 28), R("education", 26), R("enablement", 18)],
    "curriculum": [R("curriculum", 34), R("instructional", 24)],
    "learning-development": [R("learning and development", 34), R("learning & development", 34), R("l&d", 28)]
  }
};

const TITLE_STOPWORDS_FOR_ROLE_HEAD = new Set([
  "senior","sr","sr.","junior","jr","jr.","staff","principal","lead","manager","director",
  "vp","vice","president","head","chief","global","regional","associate","intern"
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}+#&./ -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseMatches(text, phrase) {
  if (!text || !phrase) return false;
  const p = normalizeText(phrase);
  if (!p) return false;
  if (p.length <= 3 && /^[a-z]+$/.test(p)) {
    return new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
  }
  return text.includes(p);
}

function scoreRules(text, rules, multiplier, source, candidate, signals) {
  let score = 0;
  for (const rule of rules || []) {
    if (phraseMatches(text, rule.phrase)) {
      const points = Math.round(rule.weight * multiplier);
      score += points;
      signals.push({ source, candidate, phrase: rule.phrase, points });
    }
  }
  return score;
}

function rank(scoreObj) {
  return Object.entries(scoreObj)
    .map(([label, score]) => ({ label, score }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function bestCategoryForText(text, multiplier = 1) {
  const scores = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const dummy = [];
  for (const category of CATEGORIES) {
    if (category === "other") continue;
    scores[category] = scoreRules(text, CATEGORY_RULES[category], multiplier, "probe", category, dummy);
  }
  return rank(scores)[0];
}

function scoreCategory(job) {
  const title = normalizeText(job.title);
  const description = normalizeText(job.description);
  const scores = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const signals = [];

  for (const category of CATEGORIES) {
    if (category === "other") continue;
    // Title phrase evidence is intentionally stronger than description occurrence.
    scores[category] += scoreRules(title, CATEGORY_RULES[category], 1.0, "title", category, signals);
    scores[category] += scoreRules(description, CATEGORY_RULES[category], 0.28, "description", category, signals);
  }

  // Cross-category contextual adjustments.
  // Research Engineer: title indicates both research and engineering. Description breaks the tie.
  if (phraseMatches(title, "research engineer")) {
    const descResearch = bestCategoryForText(description, 1);
    if (descResearch?.label === "research") scores.research += 8;
    if (descResearch?.label === "infrastructure") scores.infrastructure += 8;
    if (descResearch?.label === "engineering") scores.engineering += 8;
  }

  // Developer-relations titles are a deliberate taxonomy override.
  if (["developer advocate","developer relations","developer evangelist","technical evangelist"].some(p => phraseMatches(title, p))) {
    scores.marketing += 35;
  }

  // Sales engineering is functionally sales in this taxonomy.
  if (phraseMatches(title, "sales engineer")) scores.sales += 30;

  // Solutions engineer is functionally solutions in this taxonomy.
  if (phraseMatches(title, "solutions engineer") || phraseMatches(title, "solution engineer")) scores.solutions += 30;

  return { scores, signals, ranked: rank(scores) };
}

function scoreSpecialization(job, category) {
  const title = normalizeText(job.title);
  const description = normalizeText(job.description);
  const legal = TAXONOMY[category] || ["other"];
  const scores = Object.fromEntries(legal.map(s => [s, 0]));
  const signals = [];
  const map = SPECIALIZATION_RULES[category] || {};

  for (const spec of legal) {
    if (spec === "other") continue;
    scores[spec] += scoreRules(title, map[spec], 1.0, "title", spec, signals);
    scores[spec] += scoreRules(description, map[spec], 0.35, "description", spec, signals);
  }

  // Prefer generic specialization only when there is real generic evidence.
  if (legal.includes("other")) scores.other = 0;
  return { scores, signals, ranked: rank(scores) };
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function strengthFromWinner(categoryWinner, specWinner, titleSignalCount, descriptionSignalCount) {
  // Saturating rather than linear: after enough corroborating evidence, more repeated words add little.
  const combined = categoryWinner.score + specWinner.score;
  const base = 100 * (1 - Math.exp(-combined / 55));
  const diversityBonus = Math.min(12, titleSignalCount * 2 + Math.min(descriptionSignalCount, 6));
  return clamp(Math.round(base + diversityBonus));
}

function marginScore(winner, runnerUp) {
  const w = Math.max(0, winner?.score || 0);
  const r = Math.max(0, runnerUp?.score || 0);
  if (w === 0) return 0;
  const absolute = clamp((w - r) * 4);
  const relative = clamp(((w - r) / Math.max(w, 1)) * 100);
  return Math.round(absolute * 0.45 + relative * 0.55);
}

function consistencyScore(job, chosenCategory) {
  const title = normalizeText(job.title);
  const description = normalizeText(job.description);
  const titleBest = bestCategoryForText(title);
  const descBest = bestCategoryForText(description);

  if (!titleBest || titleBest.score === 0) {
    if (!descBest || descBest.score === 0) return 55;
    return descBest.label === chosenCategory ? 78 : 48;
  }
  if (!descBest || descBest.score === 0) {
    return titleBest.label === chosenCategory ? 85 : 45;
  }
  if (titleBest.label === chosenCategory && descBest.label === chosenCategory) return 100;
  if (titleBest.label === chosenCategory || descBest.label === chosenCategory) return 72;
  return 30;
}

function provenanceScore(job) {
  const title = normalizeText(job.title);
  const description = normalizeText(job.description);
  let score = 20;
  if (title.length >= 4) score += 28;
  if (description.length >= 800) score += 32;
  else if (description.length >= 200) score += 22;
  else if (description.length > 0) score += 10;
  if (WORKPLACES.includes(normalizeText(job.workplace_type)) && normalizeText(job.workplace_type) !== "unknown") score += 10;
  if (EMPLOYMENT.includes(normalizeText(job.employment_type)) && normalizeText(job.employment_type) !== "unknown") score += 10;
  return clamp(score);
}

function inferSeniority(titleRaw) {
  const title = normalizeText(titleRaw);
  const patterns = [
    ["executive", [/\bchief\b/, /\bcfo\b/, /\bcto\b/, /\bceo\b/, /\bcoo\b/, /\bciso\b/, /\bchief .* officer\b/]],
    ["vp", [/\bvice president\b/, /\bvp\b/]],
    ["director", [/\bdirector\b/]],
    ["principal", [/\bprincipal\b/]],
    ["staff", [/\bstaff\b/]],
    ["senior", [/\bsenior\b/, /\bsr\.?\b/]],
    ["junior", [/\bjunior\b/, /\bjr\.?\b/]],
    ["entry", [/\bentry[- ]level\b/, /\bnew grad\b/, /\bgraduate\b/]],
    ["intern", [/\bintern(ship)?\b/]],
    ["lead", [/\blead\b/, /\bhead of\b/]],
    ["manager", [/\bmanager\b/]],
  ];
  for (const [level, regexes] of patterns) {
    if (regexes.some(r => r.test(title))) return { value: level, evidence: "explicit-title" };
  }
  return { value: "unknown", evidence: "not-explicit" };
}

function canonicalWorkplace(value) {
  const v = normalizeText(value);
  if (WORKPLACES.includes(v)) return v;
  if (v === "onsite" || v === "on site") return "on-site";
  return null;
}

function inferWorkplace(job) {
  const ats = canonicalWorkplace(job.workplace_type);
  if (ats && ats !== "unknown") return { value: ats, evidence: "ats" };

  const location = normalizeText(job.location);
  const desc = normalizeText(job.description);
  const combined = `${location} ${desc.slice(0, 2500)}`;

  if (/\bhybrid\b/.test(combined)) return { value: "hybrid", evidence: "explicit-text" };
  if (/\bremote\b/.test(combined)) return { value: "remote", evidence: "explicit-text" };
  if (/\bon[- ]site\b|\bonsite\b|\bin[- ]office\b/.test(combined)) return { value: "on-site", evidence: "explicit-text" };
  return { value: "unknown", evidence: "not-explicit" };
}

function canonicalEmployment(value) {
  const v = normalizeText(value);
  const aliases = {
    "full time": "full-time", "full-time": "full-time",
    "part time": "part-time", "part-time": "part-time",
    "contract": "contract", "contractor": "contract",
    "intern": "internship", "internship": "internship",
    "temporary": "temporary", "temp": "temporary"
  };
  return aliases[v] || null;
}

function inferEmployment(job) {
  const ats = canonicalEmployment(job.employment_type);
  if (ats) return { value: ats, evidence: "ats" };
  const title = normalizeText(job.title);
  const desc = normalizeText(job.description).slice(0, 3000);
  const text = `${title} ${desc}`;
  if (/\bintern(ship)?\b/.test(text)) return { value: "internship", evidence: "explicit-text" };
  if (/\bpart[- ]time\b/.test(text)) return { value: "part-time", evidence: "explicit-text" };
  if (/\bcontract(or)?\b/.test(text)) return { value: "contract", evidence: "explicit-text" };
  if (/\btemporary\b|\btemp role\b/.test(text)) return { value: "temporary", evidence: "explicit-text" };
  if (/\bfull[- ]time\b/.test(text)) return { value: "full-time", evidence: "explicit-text" };
  return { value: "unknown", evidence: "not-explicit" };
}

const US_STATES = {
  al:"Alabama", ak:"Alaska", az:"Arizona", ar:"Arkansas", ca:"California", co:"Colorado", ct:"Connecticut",
  de:"Delaware", fl:"Florida", ga:"Georgia", hi:"Hawaii", id:"Idaho", il:"Illinois", in:"Indiana",
  ia:"Iowa", ks:"Kansas", ky:"Kentucky", la:"Louisiana", me:"Maine", md:"Maryland", ma:"Massachusetts",
  mi:"Michigan", mn:"Minnesota", ms:"Mississippi", mo:"Missouri", mt:"Montana", ne:"Nebraska", nv:"Nevada",
  nh:"New Hampshire", nj:"New Jersey", nm:"New Mexico", ny:"New York", nc:"North Carolina", nd:"North Dakota",
  oh:"Ohio", ok:"Oklahoma", or:"Oregon", pa:"Pennsylvania", ri:"Rhode Island", sc:"South Carolina",
  sd:"South Dakota", tn:"Tennessee", tx:"Texas", ut:"Utah", vt:"Vermont", va:"Virginia", wa:"Washington",
  wv:"West Virginia", wi:"Wisconsin", wy:"Wyoming", dc:"District of Columbia"
};

function inferLocation(job, workplace) {
  const raw = String(job.location || "").trim();
  const loc = normalizeText(raw);

  if (!loc) {
    if (workplace.value === "remote" && workplace.evidence === "explicit-text") {
      return { type: "worldwide", country: null, region: null, city: null, evidence: "remote-no-restriction" };
    }
    return { type: "unknown", country: null, region: null, city: null, evidence: "missing" };
  }

  if (/\bworldwide\b|\banywhere\b|\bglobal remote\b/.test(loc)) {
    return { type: "worldwide", country: null, region: null, city: null, evidence: "explicit" };
  }

  if (/\bunited states\b|\busa\b|\bu\.s\.\b|\bus only\b/.test(loc)) {
    // If there is also a city/state pattern below, allow it to be more specific.
    const m = raw.match(/^\s*([^,]+),\s*([A-Z]{2})\b/);
    if (m && US_STATES[m[2].toLowerCase()]) {
      return { type: "city", country: "United States", region: US_STATES[m[2].toLowerCase()], city: m[1].trim(), evidence: "parsed" };
    }
    return { type: "country", country: "United States", region: null, city: null, evidence: "explicit" };
  }

  const us = raw.match(/^\s*([^,]+),\s*([A-Z]{2})(?:\s|$|,)/);
  if (us && US_STATES[us[2].toLowerCase()]) {
    return { type: "city", country: "United States", region: US_STATES[us[2].toLowerCase()], city: us[1].trim(), evidence: "parsed" };
  }

  if (/\bcanada\b/.test(loc)) {
    return { type: "country", country: "Canada", region: null, city: null, evidence: "explicit" };
  }
  if (/\bunited kingdom\b|\buk\b/.test(loc)) {
    return { type: "country", country: "United Kingdom", region: null, city: null, evidence: "explicit" };
  }

  // Conservative fallback: preserve unknown rather than inventing city/country.
  return { type: "unknown", country: null, region: null, city: null, evidence: "unparsed" };
}

function hardFilters(job) {
  const reasons = [];
  if (!String(job.title || "").trim()) reasons.push("missing-title");
  // Do NOT reject a job merely because description, seniority, location,
  // employment type, or workplace are missing.
  return { pass: reasons.length === 0, reasons };
}

function classificationBlockers({ categoryRanked, specRanked, confidence, category, specialization, consistency }) {
  const blockers = [];

  const catW = categoryRanked[0] || { score: 0 };
  const catR = categoryRanked[1] || { score: 0 };
  const specW = specRanked[0] || { score: 0 };
  const specR = specRanked[1] || { score: 0 };

  if (catW.score === 0) blockers.push("no-category-evidence");
  if (category === "other") blockers.push("category-other");
  if (specialization === "other" && specW.score === 0) blockers.push("no-specialization-evidence");

  // Near ties only block when there is enough evidence for both candidates.
  if (catW.score >= 18 && catR.score >= 18 && (catW.score - catR.score) <= 4) blockers.push("category-near-tie");
  if (specW.score >= 16 && specR.score >= 16 && (specW.score - specR.score) <= 3) blockers.push("specialization-near-tie");

  if (consistency <= 35) blockers.push("title-description-conflict");
  if (confidence < 50) blockers.push("very-low-classification-confidence");

  return [...new Set(blockers)];
}

function classifyJob(job) {
  const filter = hardFilters(job);
  if (!filter.pass) {
    return {
      decision: "reject",
      hard_filter_reasons: filter.reasons,
      category: "other",
      specialization: "other",
      classification_confidence: 0,
      classification_band: "weak",
      placement_fit_score: 0,
      needs_review: false,
      review_reasons: []
    };
  }

  const categoryResult = scoreCategory(job);
  let categoryWinner = categoryResult.ranked[0] || { label: "other", score: 0 };
  const categoryRunner = categoryResult.ranked[1] || { label: "other", score: 0 };

  let category = categoryWinner.score > 0 ? categoryWinner.label : "other";

  const specResult = scoreSpecialization(job, category);
  let specWinner = specResult.ranked[0] || { label: "other", score: 0 };
  const specRunner = specResult.ranked[1] || { label: "other", score: 0 };
  let specialization = specWinner.score > 0 ? specWinner.label : "other";

  if (!TAXONOMY[category]?.includes(specialization)) specialization = "other";

  const titleSignalCount =
    categoryResult.signals.filter(s => s.source === "title" && s.candidate === category).length +
    specResult.signals.filter(s => s.source === "title" && s.candidate === specialization).length;
  const descSignalCount =
    categoryResult.signals.filter(s => s.source === "description" && s.candidate === category).length +
    specResult.signals.filter(s => s.source === "description" && s.candidate === specialization).length;

  const evidenceStrength = strengthFromWinner(categoryWinner, specWinner, titleSignalCount, descSignalCount);
  const categoryMargin = marginScore(categoryWinner, categoryRunner);
  const specializationMargin = marginScore(specWinner, specRunner);
  const margin = Math.round(categoryMargin * 0.6 + specializationMargin * 0.4);
  const consistency = consistencyScore(job, category);
  const provenance = provenanceScore(job);

  const confidence = clamp(Math.round(
    evidenceStrength * 0.35 +
    margin * 0.30 +
    consistency * 0.20 +
    provenance * 0.15
  ));

  // Placement fit: direct positive support for the selected taxonomy placement.
  // Unlike confidence, it does not care much about runner-up ambiguity.
  const placementFit = clamp(Math.round(
    evidenceStrength * 0.70 +
    consistency * 0.20 +
    provenance * 0.10
  ));

  const seniority = inferSeniority(job.title);
  const workplace = inferWorkplace(job);
  const employment = inferEmployment(job);
  const location = inferLocation(job, workplace);

  const blockers = classificationBlockers({
    categoryRanked: categoryResult.ranked,
    specRanked: specResult.ranked,
    confidence,
    category,
    specialization,
    consistency
  });

  const informational = [];
  if (seniority.value === "unknown") informational.push("unknown-seniority");
  if (workplace.value === "unknown") informational.push("unknown-workplace-type");
  if (employment.value === "unknown") informational.push("unknown-employment-type");
  if (location.type === "unknown") informational.push("unknown-location");

  const band = confidence >= 80 ? "strong" : confidence >= 60 ? "moderate" : "weak";

  // Review should be sparse: 50-59 is review; 60+ publishes unless a blocker exists.
  // A blocker can also catch a high-scoring but internally contradictory placement.
  const needsReview = blockers.length > 0 || confidence < 60;
  const decision = needsReview ? "review" : "accept";

  const winningSignals = [...categoryResult.signals, ...specResult.signals]
    .filter(s => s.candidate === category || s.candidate === specialization)
    .sort((a, b) => b.points - a.points)
    .slice(0, 20);

  return {
    decision,
    category,
    specialization,
    seniority: seniority.value,
    workplace_type: workplace.value,
    location_type: location.type,
    location_country: location.country,
    location_region: location.region,
    location_city: location.city,
    employment_type: employment.value,

    placement_fit_score: placementFit,
    classification_confidence: confidence,
    classification_band: band,

    confidence_components: {
      evidence_strength: evidenceStrength,
      winner_margin: margin,
      internal_consistency: consistency,
      evidence_provenance: provenance
    },

    category_score: categoryWinner.score,
    category_runner_up: categoryRunner.label,
    category_runner_up_score: categoryRunner.score,
    specialization_score: specWinner.score,
    specialization_runner_up: specRunner.label,
    specialization_runner_up_score: specRunner.score,

    needs_review: needsReview,
    review_reasons: blockers,
    informational_flags: informational,
    classification_signals: winningSignals,

    taxonomy_version: TAXONOMY_VERSION,
    classifier_version: CLASSIFIER_VERSION,
    confidence_scorer_version: CONFIDENCE_VERSION
  };
}

module.exports = {
  TAXONOMY,
  TAXONOMY_VERSION,
  CLASSIFIER_VERSION,
  CONFIDENCE_VERSION,
  classifyJob,
  hardFilters,
  normalizeText
};
