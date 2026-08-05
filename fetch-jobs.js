// fetch-jobs.js — our first data collector.
// It visits each company's Greenhouse feed and prints what it finds.

// The list of companies we collect from. Each name is the company's
// Greenhouse "slug" — the same word you saw in the URLs by hand.
const companies = [
    "anthropic", "stripe", "duolingo", "databricks", "figma",
    "gitlab", "discord", "reddit", "robinhood", "brex",
    "gusto", "mongodb", "airtable", "asana", "affirm",
    "doordashusa", "instacart", "lyft", "pinterest", "dropbox",
    "elastic", "clickup", "vercel", "huggingface", "scaleai"
];

// "async" = this function will wait for slow things (like the internet).
async function main() {
    let total = 0;
    // Loop: do the indented steps once per company in the list.
    for (const company of companies) {
        // Build the same URL you typed by hand, with the company plugged in.
        const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`;

        // fetch() = "go get this URL". "await" = wait for the reply.
        const response = await fetch(url);
        // If the reply isn't a success (e.g. company not on Greenhouse),
        // note it and skip to the next company instead of crashing.
        if (!response.ok) {
            console.log(`\n${company}: not on Greenhouse — skipped`);
            continue;
        }
        // Turn the reply's text into structured data we can walk through.
        const data = await response.json();

        // data.jobs is the big list you saw. .length = how many items in it.
        console.log(`\n${company}: ${data.jobs.length} jobs`);
        total = total + data.jobs.length;

        // Print the first 3 jobs: title + location, using the label-paths
        // you learned: job.title, job.location.name
        for (const job of data.jobs.slice(0, 3)) {
            console.log(`  - ${job.title} (${job.location.name})`);
        }
    }
    console.log(`\nGRAND TOTAL: ${total} jobs`);
}

main(); // Nothing above runs until this line says "go".