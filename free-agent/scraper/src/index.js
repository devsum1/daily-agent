// Entry point. Scrapes all platforms, then POSTs the combined batch to the
// Apps Script webhook, which dedupes, scores, and writes to Google Sheets.
//
//   node src/index.js            → scrape + push (needs env vars)
//   node src/index.js --dry-run  → scrape only, print a sample, no push
//
// Env: SHEETS_WEBHOOK_URL (Apps Script /exec URL), WEBHOOK_SECRET (shared token)
import { scrapeLinkedIn } from './linkedin.js';
import { scrapeNaukri } from './naukri.js';
import { scrapeOthers } from './others.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function push(jobs) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!url || !secret) throw new Error('SHEETS_WEBHOOK_URL and WEBHOOK_SECRET must be set');

  // Apps Script answers POSTs with a 302 to googleusercontent.com; fetch
  // follows it and the JSON body arrives from the redirect target.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, jobs }),
    redirect: 'follow',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}: ${text.slice(0, 300)}`);
  console.log(`webhook response: ${text.slice(0, 300)}`);
}

async function main() {
  const results = await Promise.allSettled([scrapeLinkedIn(), scrapeNaukri(), scrapeOthers()]);
  const jobs = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  for (const r of results) {
    if (r.status === 'rejected') console.warn(`platform failed entirely: ${r.reason?.message}`);
  }

  console.log(`total scraped: ${jobs.length}`);
  if (!jobs.length) {
    console.warn('no jobs scraped — check connectivity / endpoint changes');
    return;
  }

  if (DRY_RUN) {
    console.log('sample:', JSON.stringify(jobs.slice(0, 3), null, 2));
    return;
  }
  await push(jobs);
}

main().catch((e) => { console.error(e); process.exit(1); });
