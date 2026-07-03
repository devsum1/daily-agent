import type { BrowserContext, Page } from 'playwright';
import type { Platform, RawJobCard } from '@jsa/core';

export interface SearchQuery {
  keyword: string;
  location: string;
  pages: number;
}

export interface JdDetailRaw {
  description: string;
  salaryText?: string;
  postedText?: string;
  companyType?: string;
  companyRating?: number;
}

export interface ApplyTarget {
  jobId: string;
  url: string;
  resumePath: string;            // path to tailored resume pdf in artifacts/
  answers?: Record<string, string>;
}

export type ApplyOutcome =
  | { status: 'APPLIED'; confirmationRef?: string; screenshotPath?: string }
  | { status: 'EXTERNAL'; reason: string }
  | { status: 'NEEDS_MANUAL'; reason: string; questions?: string[]; screenshotPath?: string };

export interface RecruiterLead {
  name: string;
  title?: string;
  profileUrl?: string;
  role: 'hiring_manager' | 'engineering_manager' | 'recruiter';
}

export interface PlatformAdapter {
  readonly platform: Platform;
  /** Reuses persisted session. Returns normalized cards (no JD yet). */
  search(ctx: BrowserContext, q: SearchQuery): Promise<RawJobCard[]>;
  /** Opens a posting and returns the raw JD text + meta for LLM extraction. */
  extractJd(ctx: BrowserContext, url: string): Promise<JdDetailRaw>;
  /** Optional: platform supports Easy-Apply / 1-click. */
  easyApply?(ctx: BrowserContext, job: ApplyTarget): Promise<ApplyOutcome>;
  /** Optional: find recruiter/HM leads for a posting. */
  findRecruiters?(ctx: BrowserContext, job: ApplyTarget): Promise<RecruiterLead[]>;
}

// ── shared parsing helpers ───────────────────────────────────────────────────
export async function safeText(page: Page, selector: string): Promise<string> {
  try {
    const el = page.locator(selector).first();
    return (await el.textContent({ timeout: 5000 }))?.trim() ?? '';
  } catch {
    return '';
  }
}

export function dedupeHashInput(platform: Platform, company: string, title: string, location: string) {
  return `${platform}|${company.toLowerCase().trim()}|${title.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
}
