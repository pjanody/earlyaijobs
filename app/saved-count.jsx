"use client";

// "Saved (N)" nav link. Server renders plain "Saved" (no count — localStorage
// doesn't exist there); the count appears after mount and updates instantly
// on save/unsave via the shared change event, and across tabs via storage.

import { useEffect, useState, useCallback } from "react";
import { savedCount, CHANGE_EVENT, KEYS } from "../lib/local-state";

export default function SavedCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    try { setCount(savedCount(window.localStorage)); } catch { /* storage off */ }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    const onStorage = (e) => { if (!e.key || e.key === KEYS.saved) refresh(); };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  // Nav stays symmetrical (no reserved width, Patrick's call) — the count
  // appearing after hydration nudges the links beside it slightly, once.
  return (
    <a href="/saved" suppressHydrationWarning>
      Saved{count > 0 ? ` (${count > 99 ? "99+" : count})` : ""}
    </a>
  );
}
