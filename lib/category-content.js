// lib/category-content.js — the human-written intro for each category page.
//
// RULES (from the Batch C review):
//   - Factual and specific to AI-company hiring. No generic SEO filler.
//   - No numbers. Counts drift daily; the live count is rendered separately
//     from the database, so the prose never goes stale or wrong.
//   - Every claim here is something our own corpus demonstrates. When hiring
//     patterns change, this file should change with them.
//
// A missing entry fails test-category-content.js, so a new category cannot
// ship without an intro.

export const CATEGORY_INTROS = {
  engineering:
    "Engineering is the largest hiring category at AI companies — software engineers building the products, platforms and robots around the models. The range is wide: backend and full-stack product work, machine-learning engineering, mobile, and at companies like Figure AI, robotics software. Titles run from intern to engineering manager and director.",
  research:
    "Research roles are the scientists and engineers working directly on models: pre-training, post-training, interpretability, evaluations and AI safety. Several labs use the title \"Member of Technical Staff\" for these positions. Expect deep technical bars and, at most labs, a strong preference for demonstrated research output.",
  data:
    "Data roles at AI companies cover data science, data engineering and analytics — the people who build pipelines, measure products and model user behaviour. This is analytical work on the business itself, distinct from the research teams who train the models.",
  product:
    "Product managers at AI companies own everything from consumer apps to developer APIs to the models themselves. Many roles here sit unusually close to research — writing requirements for capabilities that did not exist a quarter ago.",
  design:
    "Design hiring spans product design, brand and design systems, plus roles unique to AI products — conversational and voice designers shaping how agents speak, and creative studios producing the visual identity of fast-growing labs.",
  infrastructure:
    "Infrastructure is the compute story: GPU clusters, data centres, training and inference platforms, site reliability and internal systems. CoreWeave hires heavily here for physical data-centre operations; the labs hire for the software layers that keep training runs alive.",
  security:
    "Security roles range from detection and response and product security through trust & safety — including teams that investigate model misuse. AI companies are unusually attractive targets, and their security hiring reflects it.",
  solutions:
    "Solutions is one of the fastest-growing functions in AI hiring: forward-deployed engineers, solutions architects and strategists who embed with customers to make AI systems work inside real organisations. Scale AI, Sierra, Cohere and Harvey all run large forward-deployed teams under different names.",
  sales:
    "Sales covers account executives, partnerships, alliances and the broader go-to-market machine. AI companies sell to enterprises, governments and developers at once, so the roles range from SDR to public-sector capture to hyperscaler partnership leads.",
  marketing:
    "Marketing at AI companies spans product marketing, developer relations, growth, events and communications. Developer-facing companies weight heavily toward devrel and technical content; consumer-facing ones toward brand and lifecycle.",
  "customer-success":
    "Customer success includes support engineers, technical account managers and customer education — the people who keep deployments healthy after the sale. At AI companies this is unusually technical work: the product being supported is often an API or an agent.",
  operations:
    "Operations is the connective tissue: program managers, business operations, chief-of-staff roles, workplace and procurement. Robotics and infrastructure companies extend this into physical logistics and site operations.",
  "legal-compliance":
    "Legal hiring at AI companies goes beyond the usual counsel, privacy and compliance roles. Harvey — which builds AI for legal work — employs dozens of \"legal engineers\": qualified lawyers who configure AI systems for law firms rather than practise law themselves.",
  policy:
    "Policy teams manage the relationship between AI companies and governments: public policy, government affairs and economic research. Small teams, senior hires, and outsized importance given how quickly AI regulation is moving.",
  people:
    "People roles cover recruiting, HR business partners, benefits and people operations. Recruiting dominates — AI companies are in an aggressive growth phase, and technical recruiting in this market is its own specialism.",
  finance:
    "Finance spans accounting, FP&A, tax and treasury. The infrastructure players add unusual depth here: CoreWeave runs a dedicated operations-accounting function for its data-centre assets, a kind of role that barely existed a few years ago.",
  education:
    "Education roles build curriculum, training programmes and academic partnerships — from customer academies to Harvey's law-school programme. A small category, but a distinctive one.",
  manufacturing:
    "Manufacturing exists on this board because Figure AI builds humanoid robots: machinists, fabricators, production associates, robot operators and the supply-chain roles behind them. It is factory-floor and field work at an AI company — a category most software-only boards never need.",
  other:
    "Roles that don't fit a standard function — deliberately kept small. If a pattern emerges here, it usually becomes a category of its own, as manufacturing did.",
};
