/**
 * outreach-auto.mjs — hands-off LinkedIn referral outreach.
 *
 * Reads data/jobs-latest.json (High + Medium matches), opens a real Chromium
 * window with a persistent profile (login survives across runs), and for each
 * company: people-search → Connect → Add a note → Send. Skips anyone already
 * in data/sent-log.json (never messages the same person twice), moves to the
 * next results page when a page is exhausted, and stops at the daily cap.
 * Ends by writing an HTML report to data/ and opening it.
 *
 * One-time setup (either one):
 *   node outreach-auto.mjs --import-session   reuse your existing Chrome login:
 *                                             paste the li_at cookie, no password/OTP
 *   node outreach-auto.mjs --login            log in manually in the bot window
 * Daily run:        node outreach-auto.mjs            (scheduled via launchd)
 * Flags:            --no-open   don't open the report when finished
 *
 * LinkedIn ToS: scripted invites can get an account restricted. The caps and
 * human-like delays below are deliberately conservative — raise at your risk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const PROFILE_DIR = path.join(DATA, 'browser-profile');
const JOBS_FILE = path.join(DATA, 'jobs-latest.json');
const SENT_FILE = path.join(DATA, 'sent-log.json');

// ── Tunables ────────────────────────────────────────────────────────────────
// Raised 2026-07-09 per explicit user request, above the safe default (was 20).
// LinkedIn's own published limit is ~100-200 invites/WEEK; 28/day (~196/week)
// already sits at the edge of that and carries real restriction risk — do not
// raise further without the user re-confirming they accept that risk.
const DAILY_CAP = 200;              // total invites per day (across reruns)
const PER_COMPANY_CAP = 2;         // invites per company per run — spreads the
                                    // daily budget across more companies (14/day)
                                    // rather than exhausting it on a handful;
                                    // 5-10 contacts/company accumulates over
                                    // several days via the sent-log, not in one run
const MAX_PAGES_PER_COMPANY = 2;   // search pages to walk per company
const MIN_SCORE = 40;              // broadened from 60 so more companies enter
                                    // rotation (was High+Medium only, ~20/day)
const NOTE_LIMIT = 300;            // free accounts: 200 chars; Premium: 300
const PORTFOLIO = 'devsum1-portfolio.netlify.app';

const LOGIN_MODE = process.argv.includes('--login');
const IMPORT_MODE = process.argv.includes('--import-session');
const NO_OPEN = process.argv.includes('--no-open');

// ── Credentials from .env (free-agent/.env or the project-root .env) ────────
// LINKEDIN_EMAIL + LINKEDIN_PASSWORD enable fully automatic login when the
// saved session is missing/expired — no manual step at all.
for (const f of [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const LI_EMAIL = process.env.LINKEDIN_EMAIL || '';
const LI_PASSWORD = /^PUT_YOUR/.test(process.env.LINKEDIN_PASSWORD || '') ? '' : (process.env.LINKEDIN_PASSWORD || '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const human = (lo = 4000, hi = 9000) => sleep(lo + Math.random() * (hi - lo));
const today = new Date().toISOString().slice(0, 10);

// ── Sent log (the "never twice" store) ──────────────────────────────────────
mkdirSync(DATA, { recursive: true });
let sentLog = existsSync(SENT_FILE) ? JSON.parse(readFileSync(SENT_FILE, 'utf8')) : [];
const sentKeys = new Set(sentLog.map((e) => e.key));
const saveSentLog = () => writeFileSync(SENT_FILE, JSON.stringify(sentLog, null, 2));
const personKey = (p, company) => p.profile || `${p.name}|${company}`;

// ── Note text: full (with job link) if it fits, else compact without link ───
function buildNote(job) {
  const full = `Hi, I saw this opening:\n${job.url}\nCould you please consider referring me?\nPortfolio: ${PORTFOLIO}\nThanks!`;
  if (full.length <= NOTE_LIMIT) return { text: full, variant: 'full' };
  const short = `Hi, I saw this opening at ${job.company}. Could you please consider referring me?\nPortfolio: ${PORTFOLIO}\nThanks!`;
  if (short.length <= NOTE_LIMIT) return { text: short, variant: 'short' };
  return { text: short.slice(0, NOTE_LIMIT - 1), variant: 'truncated' };
}

// ── Page helpers ─────────────────────────────────────────────────────────────
async function isLoggedIn(page) {
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(3500);
  return !/\/(login|authwall|checkpoint|uas)/.test(page.url());
}

/**
 * Log in with LINKEDIN_EMAIL/LINKEDIN_PASSWORD from .env. If LinkedIn throws
 * a verification challenge (OTP/captcha), waits up to 3 minutes for a human
 * to solve it in the window, then re-checks. Session persists afterwards.
 */
async function debugShot(page, tag) {
  const file = path.join(DATA, `login-debug-${tag}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}

async function credentialLogin(page) {
  console.log(`🔐 Logging in as ${LI_EMAIL} (credentials from .env)…`);
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(2500);

  // LinkedIn's current login page uses React-generated ids (no #username/#password)
  // and renders the form twice (a hidden layout variant) — match by attribute
  // + visibility instead, and use .first() since both selectors are ambiguous.
  const user = page.locator('input[autocomplete*="username"]:visible').first();
  const pass = page.locator('input[autocomplete="current-password"]:visible').first();
  if (!(await user.count()) || !(await pass.count())) {
    const shot = await debugShot(page, 'no-login-form');
    console.log(`❌ Login form not found on ${page.url()} — screenshot: ${shot}`);
    return isLoggedIn(page); // maybe this profile is already signed in
  }
  await user.fill(LI_EMAIL);
  await sleep(500);
  await pass.fill(LI_PASSWORD);
  await sleep(500);
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true }).first();
  if (await signIn.count()) await signIn.click().catch(() => {});
  else await pass.press('Enter').catch(() => {});
  await sleep(6000);

  // Wrong email/password shows an inline error on the SAME /login page — check
  // this before anything else, otherwise it gets misreported as "verification".
  const errText = await page.getByText(/wrong email or password|couldn.?t find|please enter a valid/i)
    .first().innerText().catch(() => '');
  if (errText && errText.trim()) {
    const shot = await debugShot(page, 'wrong-credentials');
    console.log(`❌ LinkedIn rejected the credentials: "${errText.trim()}" — screenshot: ${shot}`);
    return false;
  }

  let warned = false;
  for (let i = 0; i < 36; i++) { // up to 3 minutes
    const url = page.url();
    if (/linkedin\.com\/(feed|mynetwork)/.test(url)) return true;
    if (/checkpoint|challenge|captcha|verif/i.test(url) && !warned) {
      warned = true;
      const shot = await debugShot(page, 'verification');
      console.log(`⚠️ LinkedIn wants verification (OTP/captcha/"is this you"). Solve it in the window — waiting up to 3 min. Screenshot: ${shot}`);
    }
    await sleep(5000);
  }
  if (!warned) {
    const shot = await debugShot(page, 'stuck');
    console.log(`❌ Login didn't reach the feed and no known error/challenge was detected. Current URL: ${page.url()} — screenshot: ${shot}`);
  }
  return isLoggedIn(page);
}

/**
 * Find all Connect entry points (light DOM + interop-outlet shadow root),
 * tag them with data-jsa-idx for clicking, and return person info per button.
 */
async function scanConnects(page) {
  return page.evaluate(() => {
    const roots = [document];
    const host = document.getElementById('interop-outlet');
    if (host && host.shadowRoot) roots.push(host.shadowRoot);
    const sel = 'a[aria-label*="to connect"], button[aria-label*="to connect"]';
    let els = roots.flatMap((r) => Array.from(r.querySelectorAll(sel)));
    if (!els.length) {
      els = roots.flatMap((r) => Array.from(r.querySelectorAll('a, button')))
        .filter((e) => (e.innerText || '').trim() === 'Connect');
    }
    els = [...new Set(els)];
    return els.map((el, i) => {
      el.setAttribute('data-jsa-idx', String(i));
      const aria = el.getAttribute('aria-label') || '';
      const name = aria.replace(/^Invite\s+/i, '').replace(/\s+to connect.*$/i, '').trim();
      const card = el.closest('li, div[data-chameleon-result-urn], div.entity-result, div[data-view-name]');
      const a = card && card.querySelector('a[href*="/in/"]');
      return { idx: i, name: name || `person-${i}`, profile: a ? a.href.split('?')[0] : '' };
    });
  });
}

async function dismissModal(page) {
  const d = page.locator('button.artdeco-modal__dismiss, button[data-test-modal-close-btn]').first();
  if (await d.count()) await d.click().catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
  await sleep(800);
}

/**
 * Handle the invite modal after clicking Connect.
 * Returns { status: 'sent'|'sent-no-note'|'email-required'|'limit'|'no-modal'|'failed', variant }
 */
async function handleInviteModal(page, note) {
  const modal = page.locator('div.artdeco-modal, div.send-invite, div[data-test-modal]').first();
  try { await modal.waitFor({ state: 'visible', timeout: 7000 }); } catch { return { status: 'no-modal', variant: 'none' }; }
  await sleep(700);

  const text = (await modal.innerText().catch(() => '')) || '';
  if (/invitation limit|weekly limit|reached the.*limit/i.test(text)) {
    await dismissModal(page);
    return { status: 'limit', variant: 'none' };
  }
  if (await modal.locator('input[type="email"]').count()) {
    await dismissModal(page); // LinkedIn wants their email — can't automate, skip
    return { status: 'email-required', variant: 'none' };
  }

  const addNote = modal.locator('button[aria-label="Add a note"]');
  if (await addNote.count()) { await addNote.first().click().catch(() => {}); await sleep(800); }

  const ta = modal.locator('textarea#custom-message, textarea[name="message"], textarea').first();
  let variant = 'none';
  if (await ta.count()) {
    await ta.fill(note.text).catch(() => {});
    variant = note.variant;
    await sleep(600);
  }

  let send = modal.locator(
    'button[aria-label="Send invitation"], button[aria-label="Send now"], button[aria-label="Send without a note"]'
  ).first();
  if (!(await send.count())) send = modal.locator('button.artdeco-button--primary').first();
  if (!(await send.count())) { await dismissModal(page); return { status: 'failed', variant }; }

  if (await send.isDisabled().catch(() => false)) {
    // Note over this account's char limit — clear it and send a plain invite.
    if (await ta.count()) { await ta.fill('').catch(() => {}); variant = 'none'; await sleep(500); }
    if (await send.isDisabled().catch(() => false)) { await dismissModal(page); return { status: 'failed', variant }; }
  }

  await send.click().catch(() => {});
  await modal.waitFor({ state: 'hidden', timeout: 7000 }).catch(() => {});
  return { status: variant === 'none' ? 'sent-no-note' : 'sent', variant };
}

async function nextPage(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);
  const next = page.locator('button[aria-label="Next"]').first();
  if (!(await next.count()) || !(await next.isEnabled().catch(() => false))) return false;
  await next.click().catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(3500 + Math.random() * 2000);
  return true;
}

// ── Report ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function writeReport(results, meta) {
  const sent = results.filter((r) => r.status.startsWith('sent'));
  const companiesAllTime = new Set(sentLog.map((e) => e.company)).size;
  const rows = results.map((r) => `
    <tr>
      <td>${esc(r.company)}</td>
      <td>${r.profile ? `<a href="${esc(r.profile)}" target="_blank">${esc(r.name)}</a>` : esc(r.name)}</td>
      <td>${r.status.startsWith('sent') ? '✅' : '⚠️'} ${esc(r.status)}${r.variant !== 'none' ? ` (note: ${r.variant})` : ''}</td>
      <td><a href="${esc(r.jobUrl)}" target="_blank">${esc(r.jobTitle)}</a></td>
      <td>${esc(r.time)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Outreach report — ${today}</title>
<style>
  body{font-family:-apple-system,sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;color:#1d1d1d}
  table{width:100%;border-collapse:collapse;font-size:14px;margin-top:16px}
  th{text-align:left;padding:8px 10px;background:#f3f2ee;border-bottom:2px solid #ccc}
  td{padding:8px 10px;border-bottom:1px solid #e0e0e0}
  .warn{background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 14px;margin-top:14px;font-size:13px}
</style></head><body>
<h1>🤝 LinkedIn outreach report — ${today}</h1>
<p><strong>${sent.length}</strong> invites sent today · ${meta.dups} people skipped (already contacted) ·
   ${results.length - sent.length} skipped/failed · <strong>${sentLog.length}</strong> people contacted all-time ·
   companies attempted today: ${meta.companies} ·
   <strong>${companiesAllTime}</strong> distinct companies reached all-time (goal: 50-100)</p>
${meta.limitHit ? '<div class="warn">⛔ LinkedIn weekly invitation limit reached — run stopped early. It resets weekly; the schedule will pick up again automatically.</div>' : ''}
${meta.error ? `<div class="warn">❌ ${esc(meta.error)}</div>` : ''}
<table><thead><tr><th>Company</th><th>Person</th><th>Status</th><th>For job</th><th>Time</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">No new people reached this run.</td></tr>'}</tbody></table>
<p style="color:#666;font-size:12px;margin-top:20px">
  sent-log: ${esc(SENT_FILE)} · note "full" includes the job link; "short" fits the 200-char free limit
  (message the job link after they accept) · "sent-no-note" = plain invite (note quota/limit hit).
</p>
</body></html>`;

  const file = path.join(DATA, `outreach-report-${today}.html`);
  writeFileSync(file, html);
  writeFileSync(path.join(DATA, 'outreach-report-latest.html'), html);
  if (!NO_OPEN && process.platform === 'darwin') execFile('open', [file], () => {});
  return file;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const results = [];
const meta = { dups: 0, companies: 0, limitHit: false, error: '' };
let ctx;

try {
  // Ask for the cookie BEFORE opening a browser window (import mode only).
  let importCookie = '';
  if (IMPORT_MODE) {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nIn your normal Chrome: linkedin.com → F12 → Application tab → Cookies →');
    console.log('https://www.linkedin.com → copy the VALUE of the "li_at" cookie.\n');
    importCookie = (await rl.question('Paste li_at value here: ')).trim().replace(/^["']|["']$/g, '');
    rl.close();
    if (!importCookie) { console.error('❌ Nothing pasted — aborting.'); process.exit(1); }
  }

  // Prefer the installed Google Chrome (familiar UI, weaker bot fingerprint);
  // fall back to Playwright's bundled Chromium if Chrome isn't available.
  const launchOpts = {
    headless: false,
    viewport: { width: 1280, height: 860 },
    args: ['--disable-blink-features=AutomationControlled'],
  };
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, { ...launchOpts, channel: 'chrome' });
  } catch {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, launchOpts);
  }
  const page = ctx.pages()[0] || (await ctx.newPage());

  if (IMPORT_MODE) {
    await ctx.addCookies([{
      name: 'li_at', value: importCookie,
      domain: '.linkedin.com', path: '/',
      httpOnly: true, secure: true, sameSite: 'None',
    }]);
    const ok = await isLoggedIn(page);
    console.log(ok
      ? '✅ Chrome session imported — daily runs are now fully hands-off.'
      : '❌ Cookie rejected (expired or copied wrong). Copy li_at again, or use "npm run login".');
    await ctx.close();
    process.exit(ok ? 0 : 1);
  }

  if (LOGIN_MODE) {
    let ok = false;
    if (LI_EMAIL && LI_PASSWORD) {
      ok = await credentialLogin(page); // fills the form for you; you only handle OTP if asked
    } else {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
      console.log('👤 Log in to LinkedIn in the window (incl. any OTP). I\'ll wait up to 5 minutes…');
      for (let i = 0; i < 60; i++) {
        await sleep(5000);
        if (/linkedin\.com\/(feed|mynetwork|in)\//.test(page.url())) break;
      }
      ok = await isLoggedIn(page);
    }
    console.log(ok ? '✅ Session saved — daily runs are now fully hands-off.' : '❌ Not logged in. Run "npm run login" again.');
    await ctx.close();
    process.exit(ok ? 0 : 1);
  }

  if (!(await isLoggedIn(page))) {
    // Session missing/expired → log in by ourselves using .env credentials.
    const ok = LI_EMAIL && LI_PASSWORD ? await credentialLogin(page) : false;
    if (!ok) {
      meta.error = LI_EMAIL && LI_PASSWORD
        ? 'Auto-login failed — LinkedIn asked for verification. Run "npm run login" once to clear it.'
        : 'No session and no credentials. Set LINKEDIN_EMAIL/LINKEDIN_PASSWORD in .env, or run: npm run login';
      throw new Error(meta.error);
    }
    console.log('✅ Logged in automatically.');
  }

  // Jobs → one best job per company, High+Medium only.
  if (!existsSync(JOBS_FILE)) throw new Error(`No ${JOBS_FILE} — run "node run-local.mjs" first.`);
  const jobs = JSON.parse(readFileSync(JOBS_FILE, 'utf8'));
  const byCompany = new Map();
  for (const j of jobs.filter((x) => x.score >= MIN_SCORE).sort((a, b) => b.score - a.score)) {
    if (!byCompany.has(j.company)) byCompany.set(j.company, j);
  }

  const sentToday = sentLog.filter((e) => (e.sentAt || '').startsWith(today)).length;
  let budget = Math.max(0, DAILY_CAP - sentToday);
  console.log(`📋 ${byCompany.size} companies · already sent today: ${sentToday} · budget left: ${budget}`);

  outer:
  for (const [company, job] of byCompany) {
    if (budget <= 0) break;
    meta.companies++;
    const note = buildNote(job);
    const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${company}"`)}&origin=GLOBAL_SEARCH_HEADER`;
    console.log(`\n🏢 ${company} — ${job.title} (${job.score})`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(4000);

    let companySent = 0;
    let pageNum = 1;
    const attempted = new Set();

    while (companySent < PER_COMPANY_CAP && budget > 0) {
      const people = await scanConnects(page).catch(() => []);
      const target = people.find((p) => {
        const key = personKey(p, company);
        if (sentKeys.has(key)) { if (!attempted.has(key)) { meta.dups++; attempted.add(key); } return false; }
        return !attempted.has(key);
      });

      if (!target) {
        // Everyone on this page handled → next page (the scenario you asked for)
        if (pageNum >= MAX_PAGES_PER_COMPANY) break;
        if (!(await nextPage(page))) break;
        pageNum++;
        console.log(`   ↪ page ${pageNum}`);
        continue;
      }

      const key = personKey(target, company);
      attempted.add(key);
      const btn = page.locator(`[data-jsa-idx="${target.idx}"]`).first();
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(600);
      const clicked = await btn.click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (!clicked) { results.push({ company, ...target, status: 'failed', variant: 'none', jobTitle: job.title, jobUrl: job.url, time: new Date().toLocaleTimeString() }); continue; }
      await sleep(600);

      const { status, variant } = await handleInviteModal(page, note);
      results.push({ company, name: target.name, profile: target.profile, status, variant, jobTitle: job.title, jobUrl: job.url, time: new Date().toLocaleTimeString() });
      console.log(`   ${status.startsWith('sent') ? '✅' : '⚠️'} ${target.name} — ${status}`);

      if (status === 'limit') { meta.limitHit = true; break outer; }
      if (status.startsWith('sent')) {
        sentKeys.add(key);
        sentLog.push({ key, name: target.name, profile: target.profile, company, jobUrl: job.url, jobTitle: job.title, note: variant, sentAt: new Date().toISOString() });
        saveSentLog(); // crash-safe: persist after every send
        companySent++;
        budget--;
      }
      await human();
    }
  }
} catch (err) {
  if (!meta.error) meta.error = err.message;
  console.error('❌', err.message);
} finally {
  if (ctx) await ctx.close().catch(() => {});
  const sent = results.filter((r) => r.status.startsWith('sent')).length;
  const file = writeReport(results, meta);
  console.log(`\n🎉 Done. Sent ${sent} invites · skipped ${meta.dups} already-contacted · report: ${file}`);
}
