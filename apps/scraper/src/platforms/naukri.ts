import type { BrowserContext } from 'playwright';
import type { Platform, RawJobCard } from '@jsa/core';
import {
  type PlatformAdapter, type SearchQuery, type JdDetailRaw,
  type ApplyTarget, type ApplyOutcome, safeText,
} from './base';
import { humanDelay, isChallenged } from '../browser';

const OUTBOUND = process.env.OUTBOUND_ENABLED === 'true';

export const naukri: PlatformAdapter = {
  platform: 'NAUKRI' as Platform,

  async search(ctx: BrowserContext, q: SearchQuery): Promise<RawJobCard[]> {
    const page = await ctx.newPage();
    const cards: RawJobCard[] = [];
    try {
      const kw = q.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const loc = q.location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      for (let p = 1; p <= q.pages; p++) {
        await page.goto(`https://www.naukri.com/${kw}-jobs-in-${loc}-${p}`, { waitUntil: 'domcontentloaded' });
        await humanDelay();
        if (await isChallenged(ctx)) throw new Error('Naukri challenge — pausing');
        await page.locator('.srp-jobtuple-wrapper, article.jobTuple').first().waitFor({ timeout: 15_000 }).catch(() => {});
        const rows = page.locator('.srp-jobtuple-wrapper, article.jobTuple');
        const n = await rows.count();
        for (let i = 0; i < n; i++) {
          const el = rows.nth(i);
          const title = (await el.locator('a.title').first().textContent().catch(() => ''))?.trim() ?? '';
          const href = await el.locator('a.title').first().getAttribute('href').catch(() => null);
          const company = (await el.locator('.comp-name, a.subTitle').first().textContent().catch(() => ''))?.trim() ?? '';
          const location = (await el.locator('.locWdth, .location').first().textContent().catch(() => ''))?.trim() ?? '';
          const salaryText = (await el.locator('.sal-wrap, .salary').first().textContent().catch(() => ''))?.trim();
          const rating = (await el.locator('.rating, .star_text').first().textContent().catch(() => ''))?.trim();
          if (!title || !href) continue;
          cards.push({ platform: 'NAUKRI', title, company, location, url: href, salaryText, snippet: rating });
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
      const description = await safeText(page, '.styles_JDC__dang-inner-html__h0K4t, .job-desc, section.job-desc');
      const salaryText = await safeText(page, '.styles_jhc__salary__jdfEC, .salary');
      const companyRatingTxt = await safeText(page, '.styles_amb-rating__4UyFL, .rating');
      const companyRating = parseFloat(companyRatingTxt) || undefined;
      return { description, salaryText, companyRating };
    } finally {
      await page.close();
    }
  },

  async easyApply(ctx: BrowserContext, job: ApplyTarget): Promise<ApplyOutcome> {
    if (!OUTBOUND) return { status: 'NEEDS_MANUAL', reason: 'OUTBOUND_ENABLED=false (kill switch)' };
    const page = await ctx.newPage();
    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded' });
      await humanDelay();
      const applyBtn = page.locator('#apply-button, button:has-text("Apply")').first();
      if (!(await applyBtn.count())) return { status: 'EXTERNAL', reason: 'Company-site apply' };
      await applyBtn.click();
      await humanDelay();
      // Naukri often opens a chatbot for extra questions → flag for manual.
      if (await page.locator('.chatbot_DrawerContentWrapper, ._chatBotContainer').count()) {
        const shot = `artifacts/${job.jobId}-naukri-manual.png`;
        await page.screenshot({ path: shot }).catch(() => {});
        return { status: 'NEEDS_MANUAL', reason: 'Naukri chatbot questions', screenshotPath: shot };
      }
      const ok = await page.locator('text=successfully applied, text=You have applied').count();
      if (ok) return { status: 'APPLIED' };
      return { status: 'NEEDS_MANUAL', reason: 'no confirmation detected' };
    } finally {
      await page.close();
    }
  },
};
