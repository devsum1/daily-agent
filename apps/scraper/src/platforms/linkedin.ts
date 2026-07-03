import type { BrowserContext } from 'playwright';
import type { Platform, RawJobCard } from '@jsa/core';
import {
  type PlatformAdapter, type SearchQuery, type JdDetailRaw,
  type ApplyTarget, type ApplyOutcome, type RecruiterLead, safeText,
} from './base';
import { humanDelay, isChallenged } from '../browser';

const OUTBOUND = process.env.OUTBOUND_ENABLED === 'true';

/**
 * Reference adapter. Selectors are best-effort against LinkedIn's 2024/25 markup and WILL
 * need maintenance — that's expected for any scraper. On a selector miss we screenshot and
 * return NEEDS_MANUAL rather than guessing.
 */
export const linkedin: PlatformAdapter = {
  platform: 'LINKEDIN' as Platform,

  async search(ctx: BrowserContext, q: SearchQuery): Promise<RawJobCard[]> {
    const page = await ctx.newPage();
    const cards: RawJobCard[] = [];
    try {
      for (let p = 0; p < q.pages; p++) {
        const start = p * 25;
        const url =
          `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q.keyword)}` +
          `&location=${encodeURIComponent(q.location)}&f_TPR=r86400&start=${start}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await humanDelay();
        if (await isChallenged(ctx)) throw new Error('LinkedIn challenge — pausing');

        await page.locator('.scaffold-layout__list, .jobs-search-results-list').first()
          .waitFor({ timeout: 15_000 }).catch(() => {});
        const items = page.locator('li.scaffold-layout__list-item, li.jobs-search-results__list-item');
        const n = await items.count();
        for (let i = 0; i < n; i++) {
          const el = items.nth(i);
          const title = (await el.locator('a.job-card-list__title, .job-card-list__title--link').first().textContent().catch(() => ''))?.trim() ?? '';
          const company = (await el.locator('.artdeco-entity-lockup__subtitle, .job-card-container__primary-description').first().textContent().catch(() => ''))?.trim() ?? '';
          const location = (await el.locator('.job-card-container__metadata-item').first().textContent().catch(() => ''))?.trim() ?? '';
          const href = await el.locator('a.job-card-list__title, a.job-card-container__link').first().getAttribute('href').catch(() => null);
          const easyApply = (await el.locator('text=Easy Apply').count().catch(() => 0)) > 0;
          if (!title || !href) continue;
          cards.push({
            platform: 'LINKEDIN', title, company, location,
            url: href.startsWith('http') ? href : `https://www.linkedin.com${href}`,
            easyApply,
          });
          await humanDelay(300, 900);
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
      // expand "see more"
      await page.locator('button:has-text("See more"), .jobs-description__footer-button').first()
        .click({ timeout: 3000 }).catch(() => {});
      const description = await safeText(page, '.jobs-description__content, .jobs-box__html-content');
      const postedText = await safeText(page, '.jobs-unified-top-card__posted-date, .tvm__text');
      const salaryText = await safeText(page, '.jobs-unified-top-card__job-insight, .salary');
      return { description, postedText, salaryText };
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
      if (await isChallenged(ctx)) return { status: 'NEEDS_MANUAL', reason: 'challenge page' };

      const easyBtn = page.locator('button.jobs-apply-button:has-text("Easy Apply")').first();
      if (!(await easyBtn.count())) {
        return { status: 'EXTERNAL', reason: 'No Easy Apply — external ATS, queue for manual' };
      }
      await easyBtn.click();
      await humanDelay();

      // Walk the multi-step modal. If we ever hit a question we can't satisfy from
      // job.answers (LLM-prefilled), bail to manual instead of guessing.
      for (let step = 0; step < 6; step++) {
        const modal = page.locator('.jobs-easy-apply-modal');
        if (!(await modal.count())) break;

        // resume upload (if asked)
        const upload = modal.locator('input[type="file"]');
        if (await upload.count()) {
          await upload.first().setInputFiles(job.resumePath).catch(() => {});
          await humanDelay();
        }

        // detect free-text / unanswered required questions
        const questionLabels = await modal.locator('label, .fb-form-element-label').allTextContents();
        const unknown = await detectUnansweredRequired(modal, job.answers ?? {});
        if (unknown.length) {
          const shot = `artifacts/${job.jobId}-linkedin-manual.png`;
          await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
          return { status: 'NEEDS_MANUAL', reason: 'custom questions', questions: unknown, screenshotPath: shot };
        }
        void questionLabels;

        const next = modal.locator('button:has-text("Next"), button:has-text("Continue to next step")').first();
        const review = modal.locator('button:has-text("Review")').first();
        const submit = modal.locator('button:has-text("Submit application")').first();

        if (await submit.count()) {
          await submit.click();
          await humanDelay();
          const shot = `artifacts/${job.jobId}-linkedin-applied.png`;
          await page.screenshot({ path: shot }).catch(() => {});
          return { status: 'APPLIED', screenshotPath: shot };
        }
        if (await review.count()) { await review.click(); await humanDelay(); continue; }
        if (await next.count()) { await next.click(); await humanDelay(); continue; }
        break;
      }
      const shot = `artifacts/${job.jobId}-linkedin-stuck.png`;
      await page.screenshot({ path: shot }).catch(() => {});
      return { status: 'NEEDS_MANUAL', reason: 'flow did not reach Submit', screenshotPath: shot };
    } finally {
      await page.close();
    }
  },

  async findRecruiters(ctx: BrowserContext, job: ApplyTarget): Promise<RecruiterLead[]> {
    if (!OUTBOUND) return [];
    const page = await ctx.newPage();
    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded' });
      await humanDelay();
      const leads: RecruiterLead[] = [];
      // "Meet the hiring team" card
      const hire = page.locator('.hirer-card__hirer-information, .jobs-poster__name');
      const cnt = await hire.count();
      for (let i = 0; i < cnt; i++) {
        const name = (await hire.nth(i).textContent())?.trim();
        const link = await page.locator('a.app-aware-link').nth(i).getAttribute('href').catch(() => null);
        if (name) leads.push({ name, role: 'recruiter', profileUrl: link ?? undefined });
      }
      return leads;
    } finally {
      await page.close();
    }
  },
};

async function detectUnansweredRequired(modal: any, answers: Record<string, string>): Promise<string[]> {
  const unanswered: string[] = [];
  const inputs = modal.locator('input[type="text"], textarea, select');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const val = await el.inputValue().catch(() => '');
    if (val) continue;
    const id = (await el.getAttribute('id')) ?? (await el.getAttribute('name')) ?? `q${i}`;
    if (answers[id]) {
      await el.fill(answers[id]).catch(() => {});
    } else {
      const label = await modal.locator(`label[for="${id}"]`).first().textContent().catch(() => id);
      unanswered.push((label ?? id).trim());
    }
  }
  return unanswered;
}
