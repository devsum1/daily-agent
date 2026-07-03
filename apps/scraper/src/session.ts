// One-time interactive login. Opens a real headed browser, YOU log in by hand
// (incl. 2FA), then we persist cookies/localStorage. We never type your password.
//
//   pnpm scraper:login linkedin
//
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { storagePath } from './browser';

const LOGIN_URLS: Record<string, string> = {
  linkedin: 'https://www.linkedin.com/login',
  naukri: 'https://www.naukri.com/nlogin/login',
  instahyre: 'https://www.instahyre.com/login/',
  hirist: 'https://www.hirist.tech/login',
  wellfound: 'https://wellfound.com/login',
  cutshort: 'https://cutshort.io/login',
};

async function main() {
  const platform = (process.argv[2] ?? '').toLowerCase();
  const url = LOGIN_URLS[platform];
  if (!url) {
    console.error(`Usage: pnpm scraper:login <${Object.keys(LOGIN_URLS).join('|')}>`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.goto(url);

  console.log(`\n👉 Log into ${platform} in the opened window (finish any 2FA).`);
  console.log('   When you can see your logged-in homepage, press ENTER here to save the session.\n');

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });

  const sp = storagePath(platform);
  mkdirSync(dirname(sp), { recursive: true });
  await ctx.storageState({ path: sp });
  console.log(`✅ Saved session → ${sp}`);
  await browser.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
