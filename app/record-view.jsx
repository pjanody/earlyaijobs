"use client";

// Invisible island on job-detail pages: records the view for the Recently
// Viewed list. Renders nothing; runs once per page load after mount.

import { useEffect } from "react";
import { recordView, CHANGE_EVENT } from "../lib/local-state";

export default function RecordView({ jobId }) {
  useEffect(() => {
    try {
      recordView(window.localStorage, jobId);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch { /* storage unavailable — skip silently */ }
  }, [jobId]);
  return null;
}
