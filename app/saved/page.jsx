// /saved — the user's local collection: saved jobs + recently viewed.
// Server shell only; all storage-dependent rendering happens in the client
// component (localStorage does not exist on the server).

import SavedList from "./saved-list";

export const metadata = {
  title: "Saved jobs — EarlyAIJobs",
  description: "Jobs you've saved on this device.",
  robots: { index: false }, // personal page — nothing for crawlers here
};

export default function SavedPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Saved jobs</h1>
          <p>Jobs you&apos;ve saved on this device.</p>
        </div>
      </section>
      <div className="wrap" style={{ paddingTop: 22, paddingBottom: 50 }}>
        <SavedList />
      </div>
    </>
  );
}
