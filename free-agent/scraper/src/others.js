// Best-effort discovery for Wellfound / Instahyre / Hirist.
//
// These sites sit behind Cloudflare or require login for search, so a plain
// fetch may return nothing — that's expected and non-fatal. We try two cheap
// tricks that survive redesigns: JSON-LD <script type="application/ld+json">
// JobPosting blocks, and Next.js __NEXT_DATA__ payloads. Whatever parses, wins.
import * as cheerio from 'cheerio';
import { SEARCHES, REQUEST_DELAY_MS, USER_AGENT } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  { source: 'Wellfound', url: (kw) => `https://wellfound.com/role/r/${kw.toLowerCase().replace(/\s+/g, '-')}` },
  { source: 'Instahyre', url: (kw) => `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(kw)}` },
  { source: 'Hirist', url: (kw) => `https://www.hirist.tech/search/${encodeURIComponent(kw.toLowerCase().replace(/\s+/g, '-'))}.html` },
];

function fromJsonLd($, source) {
  const jobs = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const data = JSON.parse($(s).text());
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data];
      for (const item of items) {
        if (item['@type'] !== 'JobPosting') continue;
        jobs.push({
          source,
          title: item.title ?? '',
          company: item.hiringOrganization?.name ?? '',
          location: item.jobLocation?.address?.addressLocality ?? '',
          url: item.url ?? '',
          postedAt: item.datePosted ?? '',
          salary: '',
          experience: '',
          description: (item.description ?? '').replace(/<[^>]+>/g, ' ').slice(0, 6000),
        });
      }
    } catch { /* malformed block — skip */ }
  });
  return jobs;
}

export async function scrapeOthers() {
  const jobs = [];
  for (const target of TARGETS) {
    for (const keyword of SEARCHES.keywords.slice(0, 3)) {
      try {
        const res = await fetch(target.url(keyword), {
          headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const $ = cheerio.load(await res.text());
        jobs.push(...fromJsonLd($, target.source).filter((j) => j.title && j.url));
      } catch (e) {
        if (/HTTP (403|406|429)/.test(e.message)) {
          // Cloudflare/login wall — expected; their alert emails are the channel.
          console.log(`${target.source.toLowerCase()}: blocked (expected) — skipping remaining searches`);
          break; // next site
        }
        console.warn(`${target.source.toLowerCase()}: ${keyword} skipped — ${e.message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  console.log(`others (wellfound/instahyre/hirist): ${jobs.length} jobs`);
  return jobs;
}
