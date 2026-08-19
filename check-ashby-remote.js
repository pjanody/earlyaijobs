// check-ashby-remote.js — READ-ONLY. Answers GPT's question directly:
// what does OpenAI's Ashby feed actually say about remote work, and does our
// reading of isRemote hold up?
//
//   node check-ashby-remote.js
//
// Why this matters more than anything else in the plan: 759 of our 914 remote
// classifications come from the ATS field. If most of those are OpenAI and the
// flag doesn't mean what we assume, the entire "Remote jobs only" filter —
// the only workplace filter v1 would expose — is built on sand.
//
// No database, no keys. Just the public feed.

const COMPANIES = ["openai", "elevenlabs", "replit"]; // our Ashby companies

async function inspect(slug) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) { console.log(`${slug}: HTTP ${res.status}`); return; }
  const data = await res.json();
  const jobs = data.jobs || [];

  const isRemote = {}, workplaceType = {}, combos = {};
  const remoteWithCity = [], remoteWithoutCity = [];

  for (const j of jobs) {
    const ir = String(j.isRemote);
    const wt = String(j.workplaceType || "—");
    isRemote[ir] = (isRemote[ir] || 0) + 1;
    workplaceType[wt] = (workplaceType[wt] || 0) + 1;
    const key = `isRemote=${ir} · workplaceType=${wt}`;
    combos[key] = (combos[key] || 0) + 1;

    if (j.isRemote === true) {
      const loc = j.location || "";
      const looksLikeCity = loc && !/remote|anywhere/i.test(loc);
      (looksLikeCity ? remoteWithCity : remoteWithoutCity).push(`${loc} — ${String(j.title).slice(0, 55)}`);
    }
  }

  console.log(`\n${"=".repeat(74)}\n${slug.toUpperCase()} — ${jobs.length} jobs in the Ashby feed\n${"=".repeat(74)}`);
  console.log("isRemote:", JSON.stringify(isRemote));
  console.log("workplaceType:", JSON.stringify(workplaceType));
  console.log("\ncombinations:");
  Object.entries(combos).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

  console.log(`\nisRemote=true WITH a specific city (suspicious if large): ${remoteWithCity.length}`);
  remoteWithCity.slice(0, 12).forEach((s) => console.log(`    ${s}`));
  console.log(`isRemote=true with remote/blank location (expected): ${remoteWithoutCity.length}`);
  remoteWithoutCity.slice(0, 5).forEach((s) => console.log(`    ${s}`));

  // Does the posting text itself corroborate the flag?
  const sample = jobs.filter((j) => j.isRemote === true).slice(0, 3);
  for (const j of sample) {
    const txt = String(j.descriptionPlain || j.descriptionHtml || "").replace(/<[^>]+>/g, " ");
    const m = txt.match(/.{0,110}\b(remote|hybrid|in[- ]office|on-?site|days? (a|per) week)\b.{0,110}/i);
    console.log(`\n  "${String(j.title).slice(0, 60)}" (${j.location})`);
    console.log(`    description says: ${m ? "…" + m[0].replace(/\s+/g, " ").trim() + "…" : "(no workplace language found)"}`);
  }
}

(async () => {
  for (const c of COMPANIES) {
    try { await inspect(c); } catch (e) { console.log(`${c}: ${e.message}`); }
  }
  console.log(`\n${"=".repeat(74)}`);
  console.log("READ AS: if isRemote=true dominates AND most of those list a specific");
  console.log("city, the flag likely means 'remote-eligible' or is simply unmaintained —");
  console.log("and our Remote filter needs a different evidence source.");
})();
