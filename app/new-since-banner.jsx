"use client";

// "N new jobs since your last visit" — shown on the Jobs page when a
// returning visitor has new jobs waiting. All rules from the brief:
//   - first visit: initialize state, show nothing
//   - "visit" is a session: internal navigation never resets the reference
//   - the previous timestamp is read BEFORE being overwritten (beginVisit)
//   - dismissal lasts the session (sessionStorage), never erases history
//   - zero new jobs: no banner
//   - "new" = first seen by EarlyAIJobs (first_seen_at)
// The count comes from one head-only Supabase count via the public
// RLS-limited key — no rows travel, and failure just means no banner.

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { beginVisit, KEYS } from "../lib/local-state";

const APPROVED = ["openai", "anthropic", "scaleai", "elevenlabs", "databricks", "replit", "cohere", "perplexity", "cursor", "cognition", "mistral"];

export default function NewSinceBanner() {
  const [state, setState] = useState(null); // {count, since} when visible

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (window.sessionStorage.getItem(KEYS.bannerDismissed)) return;
        const visit = beginVisit(window.localStorage, window.sessionStorage);
        if (visit.firstVisit || !visit.previousVisitAt) return;

        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        );
        const { count, error } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_open", true)
          .in("company_name", APPROVED)
          .gte("first_seen_at", visit.previousVisitAt);
        if (error || cancelled || !count) return;
        setState({ count, since: visit.previousVisitAt });
      } catch { /* storage or network unavailable — no banner, no crash */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!state) return null;

  const dismiss = () => {
    try { window.sessionStorage.setItem(KEYS.bannerDismissed, "1"); } catch { /* fine */ }
    setState(null);
  };

  return (
    <div className="new-since-banner" role="status">
      <span>
        <b>{state.count.toLocaleString()}</b> new {state.count === 1 ? "job" : "jobs"} since your last visit
      </span>
      <a href={`/?since=${encodeURIComponent(state.since)}`}>View new jobs</a>
      <button type="button" aria-label="Dismiss" onClick={dismiss}>×</button>
    </div>
  );
}
