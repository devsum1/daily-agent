// Scraper entrypoint. Two modes:
//   1) CLI:   tsx src/index.ts search --platform linkedin --keyword "React Developer" --location Bangalore
//   2) Server: tsx src/index.ts serve   → exposes POST /search, /extract-jd, /apply for the API/n8n
import http from 'node:http';
import type { BrowserContext } from 'playwright';
import type { Platform } from '@jsa/core';
import { openContext } from './browser';
import type { PlatformAdapter, SearchQuery, ApplyTarget } from './platforms/base';
import { linkedin } from './platforms/linkedin';
import { naukri } from './platforms/naukri';
import { instahyre, hirist, wellfound, cutshort } from './platforms/others';

const ADAPTERS: Record<string, PlatformAdapter> = {
  LINKEDIN: linkedin, NAUKRI: naukri, INSTAHYRE: instahyre,
  HIRIST: hirist, WELLFOUND: wellfound, CUTSHORT: cutshort,
};

function adapterFor(p: string): PlatformAdapter {
  const a = ADAPTERS[p.toUpperCase()];
  if (!a) throw new Error(`Unknown platform: ${p}`);
  return a;
}

async function withContext<T>(platform: string, fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const ctx = await openContext(platform);
  try { return await fn(ctx); }
  finally { await ctx.browser()?.close(); }
}

// ── HTTP server (used by NestJS API + n8n) ──────────────────────────────────
function serve(port = Number(process.env.SCRAPER_PORT ?? 4002)) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    try {
      const result = await route(req.url ?? '', body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
    } catch (e: any) {
      res.writeHead(500, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: e.message }));
    }
  });
  server.listen(port, () => console.log(`scraper HTTP on :${port}`));
}

async function route(url: string, body: any) {
  if (url.startsWith('/search')) {
    const { platform, keyword, location, pages = 2 } = body;
    const q: SearchQuery = { keyword, location, pages };
    const cards = await withContext(platform, (ctx) => adapterFor(platform).search(ctx, q));
    return { platform, keyword, location, count: cards.length, cards };
  }
  if (url.startsWith('/extract-jd')) {
    const { platform, jobUrl } = body;
    const jd = await withContext(platform, (ctx) => adapterFor(platform).extractJd(ctx, jobUrl));
    return { platform, jobUrl, jd };
  }
  if (url.startsWith('/apply')) {
    const { platform, target } = body as { platform: Platform; target: ApplyTarget };
    const a = adapterFor(platform);
    if (!a.easyApply) return { status: 'EXTERNAL', reason: 'platform has no easyApply adapter' };
    const outcome = await withContext(platform, (ctx) => a.easyApply!(ctx, target));
    return outcome;
  }
  if (url.startsWith('/recruiters')) {
    const { platform, target } = body as { platform: Platform; target: ApplyTarget };
    const a = adapterFor(platform);
    const leads = a.findRecruiters ? await withContext(platform, (ctx) => a.findRecruiters!(ctx, target)) : [];
    return { leads };
  }
  throw new Error(`No route for ${url}`);
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function cli() {
  const cmd = process.argv[2];
  if (cmd === 'serve') return serve();
  if (cmd === 'search') {
    const platform = arg('platform', 'linkedin')!;
    const out = await route('/search', {
      platform, keyword: arg('keyword', 'React Developer'),
      location: arg('location', 'Bangalore'), pages: Number(arg('pages', '2')),
    });
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log('Usage: index.ts [serve | search --platform .. --keyword .. --location ..]');
}

cli().catch((e) => { console.error(e); process.exit(1); });
