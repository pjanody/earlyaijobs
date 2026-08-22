"use client";

// /saved page body: Saved jobs + Recently viewed, both resolved fresh from
// the database by ID (storage holds IDs only — metadata would go stale).
// One .in() query per section, IDs validated before querying. Closed jobs
// stay visible with a Closed badge; vanished IDs get an unavailable row.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  savedIds, recentIds, clearRecent, toggleSaved, validId, CHANGE_EVENT, KEYS,
} from "../../lib/local-state";
import SaveButton from "../save-button";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder-key"
);

const COMPANY_LABELS = {
  openai: "OpenAI", anthropic: "Anthropic", scaleai: "Scale AI",
  elevenlabs: "ElevenLabs", databricks: "Databricks", replit: "Replit",
};
const CATEGORY_LABELS = {
  engineering: "Engineering", research: "Research", data: "Data", product: "Product",
  design: "Design", infrastructure: "Infrastructure", security: "Security",
  solutions: "Solutions", sales: "Sales", marketing: "Marketing",
  "customer-success": "Customer Success", operations: "Operations",
  "legal-compliance": "Legal & Compliance", policy: "Policy", people: "People",
  finance: "Finance", education: "Education", other: "Other",
};

function timeAgo(dateString) {
  if (!dateString) return null;
  const hours = Math.floor((Date.now() - new Date(dateString).getTime()) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

async function fetchByIds(ids) {
  const clean = ids.filter(validId);
  if (!clean.length) return {};
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company_name, location, category, is_remote, is_open, first_published")
    .in("id", clean);
  if (error) throw new Error(error.message);
  const byId = {};
  for (const job of data || []) byId[String(job.id)] = job;
  return byId;
}

function JobRow({ id, job, onRemove }) {
  if (!job) {
    return (
      <div className="job saved-missing">
        <div className="job-main">
          <p>This saved job is no longer available.</p>
        </div>
        {onRemove && <button type="button" className="chip" onClick={onRemove}>Remove</button>}
      </div>
    );
  }
  return (
    <a className="job" href={`/job/${id}`}>
      <div className="job-main">
        <h2>{job.title}</h2>
        <div className="meta">
          <span className="co">{COMPANY_LABELS[job.company_name] || job.company_name}</span>
          {job.location && <><span className="dot">·</span><span>{String(job.location).split(/[;|]/)[0].trim()}</span></>}
          {job.category && <span className="tag">{CATEGORY_LABELS[job.category] || job.category}</span>}
          {job.is_remote === true && <span className="tag tag-remote">Remote</span>}
          {job.is_open === false && <span className="tag tag-closed">Closed</span>}
        </div>
      </div>
      <span className="save-slot"><SaveButton jobId={id} /></span>
      {timeAgo(job.first_published) && <span className="when">{timeAgo(job.first_published)}</span>}
    </a>
  );
}

export default function SavedList() {
  const [state, setState] = useState({ loading: true, error: false, saved: [], recent: [], byId: {} });

  const load = useCallback(async () => {
    let saved = [], recent = [];
    try {
      saved = savedIds(window.localStorage);
      recent = recentIds(window.localStorage).filter((id) => !saved.includes(id));
    } catch { /* storage unavailable → both empty */ }
    try {
      const byId = await fetchByIds([...new Set([...saved, ...recent])]);
      setState({ loading: false, error: false, saved, recent, byId });
    } catch {
      // Network failure is not user intent: keep IDs, show error, offer retry.
      setState({ loading: false, error: true, saved, recent, byId: {} });
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    const onStorage = (e) => { if (!e.key || e.key === KEYS.saved || e.key === KEYS.recent) load(); };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);

  if (state.loading) {
    return <p className="saved-note">Loading your saved jobs…</p>;
  }
  if (state.error) {
    return (
      <div>
        <p className="saved-note">We couldn&apos;t load your saved jobs right now.</p>
        <button type="button" className="chip" onClick={load}>Retry</button>
      </div>
    );
  }

  const removeMissing = (id) => {
    try {
      toggleSaved(window.localStorage, id);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch { /* fine */ }
  };

  const clearHistory = () => {
    try {
      clearRecent(window.localStorage);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch { /* fine */ }
  };

  return (
    <>
      {state.saved.length === 0 ? (
        <div className="saved-empty">
          <h2>No saved jobs yet</h2>
          <p>Save jobs you want to come back to and they&apos;ll appear here.</p>
          <a className="apply" href="/">Browse jobs</a>
        </div>
      ) : (
        state.saved.map((id) => (
          <JobRow key={id} id={id} job={state.byId[id]} onRemove={() => removeMissing(id)} />
        ))
      )}

      {state.recent.length > 0 && (
        <>
          <div className="saved-section-head">
            <h2>Recently viewed</h2>
            <button type="button" className="chip" onClick={clearHistory}>Clear recently viewed</button>
          </div>
          {state.recent.map((id) => state.byId[id] && (
            <JobRow key={id} id={id} job={state.byId[id]} />
          ))}
        </>
      )}

      <p className="saved-note">
        Saved and recently viewed jobs are stored locally in this browser.
        They won&apos;t follow you to other devices.
      </p>
    </>
  );
}
