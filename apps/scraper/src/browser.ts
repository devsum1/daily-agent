import { chromium, type BrowserContext } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const STORAGE_DIR = process.env.STORAGE_STATE_DIR ?? './storage-state';
const HEADLESS = process.env.HEADLESS === 'true';
const DMIN = Number(process.env.HUMAN_DELAY_MIN_MS ?? 1500);
const DMAX = Number(process.env.HUMAN_DELAY_MAX_MS ?? 6000);

export function storagePath(platform: string) {
  return resolve(STORAGE_DIR, `${platform.toLowerCase()}.json`);
}

/** Launch a context using the persisted session for a platform. */
export async function openContext(platform: string): Promise<BrowserContext> {
  const sp = storagePath(platform);
  if (!existsSync(sp)) {
    throw new Error(
      `No session for ${platform}. Run:  pnpm scraper:login ${platform.toLowerCase()}`,
    );
  }
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: sp,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  ctx.setDefaultTimeout(30_000);
  return ctx;
}

/** Random human-like pause. Always await between meaningful actions. */
export function humanDelay(min = DMIN, max = DMAX): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}

/** Detect anti-bot challenge pages. We STOP, we don't solve. */
export async function isChallenged(ctx: BrowserContext): Promise<boolean> {
  const page = ctx.pages()[0];
  if (!page) return false;
  const url = page.url();
  const challengeMarkers = ['checkpoint', 'captcha', '/uas/', 'security-verification', 'challenge'];
  if (challengeMarkers.some((m) => url.includes(m))) return true;
  const body = (await page.content()).toLowerCase();
  return body.includes('verify you are human') || body.includes("you're a robot");
}
