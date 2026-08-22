"use client";

// Save/unsave toggle — a small client island dropped into server-rendered
// cards and detail pages. Hydration-safe: renders a neutral outline heart on
// the server and only reflects real saved state after mount, so server and
// client HTML always agree at hydration time.

import { useEffect, useState, useCallback } from "react";
import { isSaved, toggleSaved, CHANGE_EVENT, KEYS } from "../lib/local-state";

export default function SaveButton({ jobId, size = "card" }) {
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    try { setSaved(isSaved(window.localStorage, jobId)); } catch { /* storage off */ }
  }, [jobId]);

  useEffect(() => {
    setMounted(true);
    refresh();
    // Same-page islands (card grid + nav count) sync via a custom event;
    // other tabs sync via the native storage event.
    const onChange = () => refresh();
    const onStorage = (e) => { if (!e.key || e.key === KEYS.saved) refresh(); };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const onClick = (e) => {
    // The button lives inside a card that is itself a link — the save action
    // must never navigate.
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = toggleSaved(window.localStorage, jobId);
      setSaved(result.saved);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch { /* storage unavailable — do nothing, never crash */ }
  };

  const showSaved = mounted && saved;
  return (
    <button
      type="button"
      className={`save-btn ${size}${showSaved ? " on" : ""}`}
      aria-label={showSaved ? "Remove saved job" : "Save job"}
      aria-pressed={showSaved}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
        fill={showSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M12 21s-7.5-4.9-10-9.2C.4 8.6 1.6 5 4.9 4.1c2-.6 4.2.2 5.4 1.9l1.7 2.1 1.7-2.1c1.2-1.7 3.4-2.5 5.4-1.9 3.3.9 4.5 4.5 2.9 7.7C19.5 16.1 12 21 12 21z" />
      </svg>
      {size === "detail" && <span>{showSaved ? "Saved" : "Save"}</span>}
    </button>
  );
}
