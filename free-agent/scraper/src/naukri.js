// Naukri discovery via their public search JSON API (same one the website uses).
// Free, no login. The response already includes skills + a JD snippet, so no
// per-job enrichment requests are needed.
import { SEARCHES, REQUEST_DELAY_MS, USER_AGENT } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchOnce(keyword, location) {
  const url =
    'https://www.naukri.com/jobapi/v3/search?noOfResults=20&urlType=search_by_key_loc' +
    `&searchType=adv&keyword=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}` +
    '&pageNo=1&jobAge=1&src=jobsearchDesk';
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      appid: '109',
      systemid: 'Naukri',
      accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobDetails ?? []).map((j) => ({
    source: 'Naukri',
    title: j.title ?? '',
    company: j.companyName ?? '',
    location: (j.placeholders?.find((p) => p.type === 'location')?.label) ?? location,
    experience: (j.placeholders?.find((p) => p.type === 'experience')?.label) ?? '',
    salary: (j.placeholders?.find((p) => p.type === 'salary')?.label) ?? '',
    url: j.jdURL ? `https://www.naukri.com${j.jdURL}` : '',
    postedAt: j.footerPlaceholderLabel ?? '',
    description: [j.jobDescription ?? '', j.tagsAndSkills ?? ''].join(' | ').replace(/<[^>]+>/g, ' ').slice(0, 6000),
  }));
}

export async function scrapeNaukri() {
  const seen = new Set();
  const jobs = [];
  for (const keyword of SEARCHES.keywords) {
    for (const location of SEARCHES.locations) {
      try {
        for (const job of await searchOnce(keyword, location)) {
          if (job.url && !seen.has(job.url)) { seen.add(job.url); jobs.push(job); }
        }
      } catch (e) {
        if (/HTTP (406|403)/.test(e.message)) {
          // Captcha-gated for non-browser clients — known, documented. Gmail
          // job alerts are the Naukri channel; don't hammer 30 doomed requests.
          console.log('naukri: API captcha-gated (expected) — skipping; Naukri jobs arrive via Gmail alerts instead');
          return jobs;
        }
        console.warn(`naukri: ${keyword} @ ${location} failed — ${e.message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  console.log(`naukri: ${jobs.length} jobs`);
  return jobs;
}
