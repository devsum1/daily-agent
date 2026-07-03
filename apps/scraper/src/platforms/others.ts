// Instahyre / Hirist / Wellfound / Cutshort adapters.
//
// These follow the exact same PlatformAdapter contract as linkedin.ts. Selectors are
// scaffolded with the real result-page structure and marked TODO where you should verify
// against the live site (markup changes often). Each `search` is implemented enough to run;
// flesh out extractJd/easyApply per site the same way as the LinkedIn reference.
import type { BrowserContext } from 'playwright';
import type { Platform, RawJobCard } from '@jsa/core';
import { type PlatformAdapter, type SearchQuery, type JdDetailRaw, safeText } from './base';
import { humanDelay, isChallenged } from '../browser';

function makeAdapter(opts: {
  platform: Platform;
  buildUrl: (q: SearchQuery, page: number) => string;
  cardSel: string;
  titleSel: string;
  companySel: string;
  locationSel: string;
  linkSel: string;
  jdSel: string;
}): PlatformAdapter {
  return {
    platform: opts.platform,
    async search(ctx: BrowserContext, q: SearchQuery): Promise<RawJobCard[]> {
      const page = await ctx.newPage();
      const cards: RawJobCard[] = [];
      try {
        for (let p = 1; p <= q.pages; p++) {
          await page.goto(opts.buildUrl(q, p), { waitUntil: 'domcontentloaded' });
          await humanDelay();
          if (await isChallenged(ctx)) throw new Error(`${opts.platform} challenge — pausing`);
          await page.locator(opts.cardSel).first().waitFor({ timeout: 15_000 }).catch(() => {});
          const rows = page.locator(opts.cardSel);
          const n = await rows.count();
          for (let i = 0; i < n; i++) {
            const el = rows.nth(i);
            const title = (await el.locator(opts.titleSel).first().textContent().catch(() => ''))?.trim() ?? '';
            const company = (await el.locator(opts.companySel).first().textContent().catch(() => ''))?.trim() ?? '';
            const location = (await el.locator(opts.locationSel).first().textContent().catch(() => ''))?.trim() ?? '';
            const href = await el.locator(opts.linkSel).first().getAttribute('href').catch(() => null);
            if (!title || !href) continue;
            cards.push({
              platform: opts.platform, title, company, location,
              url: href.startsWith('http') ? href : new URL(href, opts.buildUrl(q, p)).toString(),
            });
            await humanDelay(250, 800);
          }
        }
        return cards;
      } finally {
        await page.close();
      }
    },
    async extractJd(ctx: BrowserContext, url: string): Promise<JdDetailRaw> {
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await humanDelay();
        return { description: await safeText(page, opts.jdSel) };
      } finally {
        await page.close();
      }
    },
    // easyApply intentionally omitted for these until verified live → API will queue them
    // as one-click/manual instead of auto-submitting.
  };
}

export const instahyre = makeAdapter({
  platform: 'INSTAHYRE' as Platform,
  buildUrl: (q, p) => `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(q.keyword)}&page=${p}`,
  cardSel: '.job-card, .candidate-job-card',
  titleSel: '.job-title, h3',
  companySel: '.company-name, .employer-name',
  locationSel: '.job-location, .location',
  linkSel: 'a',
  jdSel: '.job-description, .jd-content',
});

export const hirist = makeAdapter({
  platform: 'HIRIST' as Platform,
  buildUrl: (q, p) => `https://www.hirist.tech/search/${encodeURIComponent(q.keyword)}-jobs?page=${p}`,
  cardSel: '.job-listing, .listing-item',
  titleSel: '.job-title, h2',
  companySel: '.company, .recruiter-name',
  locationSel: '.location',
  linkSel: 'a',
  jdSel: '.job-detail, .jd',
});

export const wellfound = makeAdapter({
  platform: 'WELLFOUND' as Platform,
  buildUrl: (q, p) => `https://wellfound.com/role/r/${encodeURIComponent(q.keyword.toLowerCase().replace(/\s+/g, '-'))}?page=${p}`,
  cardSel: '[data-test="JobSearchResult"], .styles_component__job',
  titleSel: '[data-test="job-title"], .styles_title',
  companySel: '[data-test="startup-name"], .styles_name',
  locationSel: '.styles_location, [data-test="job-location"]',
  linkSel: 'a',
  jdSel: '[data-test="JobDescription"], .styles_description',
});

export const cutshort = makeAdapter({
  platform: 'CUTSHORT' as Platform,
  buildUrl: (q, p) => `https://cutshort.io/jobs/${encodeURIComponent(q.keyword.toLowerCase().replace(/\s+/g, '-'))}?page=${p}`,
  cardSel: '.job-card, .opening-card',
  titleSel: '.job-title, h3',
  companySel: '.company-name',
  locationSel: '.location',
  linkSel: 'a',
  jdSel: '.job-description, .description',
});
