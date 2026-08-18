# EarlyAIJobs — LinkedIn posts: launch + retrospective

Two posts, two jobs. Wednesday delivers the product. Thursday teaches, which is
the one strangers share.

**Mechanics both days:** post 8:30am ET · one image · URL in the FIRST COMMENT,
never the post body (links in the body suppress reach) · stay in the comments
for 60–90 minutes, which is the window the algorithm judges · reply with
substance, not "thanks!"

---

# POST 1 — LAUNCH (Wednesday)

*Edit into your own voice. Numbers are live as of writing; refresh before posting.*

> Twelve days ago I typed "cat" into a terminal and it stopped responding for 20
> minutes. I'd created an infinite parrot.
>
> Today EarlyAIJobs.com is live.
>
> It tracks every open role at six AI companies — OpenAI, Anthropic, Databricks,
> Scale AI, ElevenLabs and Replit — refreshes itself every hour, and sorts
> newest first, because applying in the first 48 hours measurably improves your
> odds.
>
> 2,493 open jobs. 18 categories. Filters for company, function and remote.
> Built for the people I actually know: not just engineers, but the recruiters,
> lawyers, marketers and ops people who want into AI companies and can't find
> those roles buried under "AI Engineer" listings.
>
> Who built it: a community manager. Five years of Discord servers and account
> management, zero engineering background. My co-builder was AI — it wrote the
> code, I made the product decisions and every mistake in the book.
>
> Things I did not know two weeks ago: what an API was, what JSON was, what a
> database was, what deploying meant, what DNS did. I can now explain all of
> them, which was the actual goal.
>
> The hardest part wasn't code. It was judgment. Deciding what belongs on the
> site, catching the bug where my job descriptions were being truncated before
> the responsibilities section, and choosing to delete a "confidence score"
> feature because every wrong answer it produced came back at 90% confident.
>
> Link in the first comment. Tell me what's broken — day-one feedback is a gift.
>
> What's the thing you've been told you "can't build" because you're not
> technical?

**Image:** clean screenshot of the homepage — hero stats and the first few job
rows with green freshness badges. Take it on a wide browser window, light mode.

**First comment (post immediately):**

> https://earlyaijobs.com
>
> Stack, for anyone curious: Node scripts pull public ATS feeds (Greenhouse,
> Lever, Ashby) → Postgres on Supabase → deterministic classifier assigns one of
> 18 categories → Next.js front end → DigitalOcean App Platform, with an hourly
> scheduled job doing ingestion and classification. No LLM calls in production —
> the classifier is rules-based, which makes it free, instant and auditable.

---

# POST 2 — RETROSPECTIVE (Thursday)

*This is the post that travels. It teaches rather than announces.*

> Seven things I learned building an AI job board in 12 days as a
> non-engineer. Some of them cost me hours.
>
> **1. Verify your inputs before tuning your logic.**
> I spent a day refining classification rules that kept producing nonsense. The
> cause wasn't the rules. My ingestion script truncated job descriptions at 800
> characters, and the first 800 characters of a job posting are the company
> boilerplate. I was classifying "Anthropic is an AI safety and research
> company" over and over. Everything downstream was noise.
>
> **2. A confidently wrong system is worse than an uncertain one.**
> I had the AI rate its own confidence on every classification. Every single
> misclassification came back at 90%+ confident. A model that misreads a job
> misreads it fluently. I deleted the feature.
>
> **3. Two numbers on the same screen that should agree, and don't, is how you
> find bugs.**
> My homepage said "2,493 jobs" while the sidebar said "1,000." Turns out the
> database caps responses at 1,000 rows, so my counting code was tallying a
> truncated slice. The fix was to ask the database to count instead of counting
> rows myself.
>
> **4. Automation needs to be able to refuse.**
> My collector marked jobs closed when they vanished from a company's feed.
> Sensible — until a feed fails, and it closes everything. It now reconciles
> per company, only after a successful fetch, and refuses outright if it's about
> to close more than 40% of a company's jobs. That refusal fired within an hour
> of shipping and saved 746 listings.
>
> **5. Design constraints hide in pricing pages.**
> I planned to host on Vercel until I found its free tier caps scheduled tasks
> at once per day. For a product called EarlyAIJobs, a daily refresh isn't a
> limitation, it's a contradiction. Moved to DigitalOcean, which bills scheduled
> jobs by the second.
>
> **6. Check before you delete.**
> Habit I picked up: run `select count(*)` with the exact same conditions before
> any `delete`. It caught me about to run a delete against the wrong database
> entirely.
>
> **7. Getting two AIs to review each other is powerful, and also a trap.**
> Claude built, GPT reviewed, and the reviews genuinely caught a bug that would
> have emptied my site. But by round six we were refining a classifier for a
> website that didn't exist yet. I had to stop the loop and ship. Review is
> valuable; unbounded review is procrastination in a lab coat.
>
> The site: EarlyAIJobs.com — 2,493 jobs at six AI companies, refreshed hourly.
>
> I'm looking at roles where community and operations experience meets AI
> adoption. If your team is figuring out how to actually use this stuff, my DMs
> are open.

**Format option worth considering:** this content works well as a **PDF
carousel** (document post), which averages the highest engagement of any
LinkedIn format — one lesson per slide, big type, minimal words. Say the word
and I'll build it.

**Image if posting as text:** either a screenshot of the run report showing
`Companies OK: 6/6`, or the terminal moment where the 40% ceiling refused to
close 746 jobs. Real terminal output outperforms polished graphics for this kind
of post.

---

# NOTES

- Refresh the job count before each post; the pipeline updates hourly
- Both posts state you're a non-engineer, deliberately: it's the hook, and it's
  true
- Post 2's closing ask is soft and appears once. That's the version that works
- Do NOT post extra updates between these two. Two strong posts beat five weak
  ones, and reach per post drops when you post daily
