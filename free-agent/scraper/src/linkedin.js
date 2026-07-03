// LinkedIn discovery via the public guest search endpoint (no login, no API key).
// Returns normalized job cards; optionally enriches top cards with the full JD
// text so scoring in Apps Script has real content to match against.
import * as cheerio from 'cheerio';
import { SEARCHES, MAX_DESCRIPTION_FETCHES, REQUEST_DELAY_MS, USER_AGENT } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseCards(html) {
  const $ = cheerio.load(html);
  const cards = [];
  $('li').each((_, li) => {
    const el = $(li);
    const title = el.find('.base-search-card__title').text().trim();
    const company = el.find('.base-search-card__subtitle').text().trim();
    const location = el.find('.job-search-card__location').text().trim();
    const url = el.find('a.base-card__full-link').attr('href')?.split('?')[0] ?? '';
    const postedAt = el.find('time').attr('datetime') ?? '';
    if (title && company && url) {
      cards.push({ source: 'LinkedIn', title, company, location, url, postedAt, salary: '', experience: '', description: '' });
    }
  });
  return cards;
}

async function fetchDescription(jobUrl) {
  try {
    const html = await fetchHtml(jobUrl);
    const $ = cheerio.load(html);
    return $('.show-more-less-html__markup').text().replace(/\s+/g, ' ').trim().slice(0, 6000);
  } catch {
    return '';
  }
}

export async function scrapeLinkedIn() {
  const seen = new Set();
  const jobs = [];

  for (const keyword of SEARCHES.keywords) {
    for (const location of SEARCHES.locations) {
      const url =
        'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search' +
        `?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location + ', India')}` +
        `&f_TPR=${SEARCHES.linkedinFreshness}&start=0`;
      try {
        const html = await fetchHtml(url);
        for (const card of parseCards(html)) {
          if (!seen.has(card.url)) { seen.add(card.url); jobs.push(card); }
        }
      } catch (e) {
        console.warn(`linkedin: ${keyword} @ ${location} failed — ${e.message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }

  // Enrich the first N with full descriptions for better keyword scoring.
  for (const job of jobs.slice(0, MAX_DESCRIPTION_FETCHES)) {
    job.description = await fetchDescription(job.url);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`linkedin: ${jobs.length} jobs`);
  return jobs;
}
