# 7. Deployment Guide

Two supported paths: **local/VPS via Docker Compose** (recommended — the scraper needs a real
browser session) and **managed (Railway/Render)** for the API + Postgres + n8n, with the scraper
run on a small always-on box you control.

## 7.1 Prerequisites

- Node 20 + pnpm 9, Docker + Docker Compose
- Accounts/keys: Anthropic API, (optional) OpenAI, Telegram bot, Gmail App Password,
  Google service account (Sheets), Notion integration token
- Your LinkedIn/Naukri/etc. logins (used interactively once — see §7.4)

## 7.2 Local / single-VPS (recommended)

```bash
git clone <repo> && cd job-search-agent
cp .env.example .env          # fill in every secret (see docs/09)
pnpm install

# 1) infra
docker compose up -d postgres n8n

# 2) DB schema
pnpm --filter @jsa/api prisma migrate deploy   # or `migrate dev` locally

# 3) one-time: persist platform sessions (opens a real browser)
pnpm --filter @jsa/scraper login linkedin
pnpm --filter @jsa/scraper login naukri
# …repeat for the platforms you enabled

# 4) services
pnpm --filter @jsa/api dev        # http://localhost:3001
pnpm --filter @jsa/scraper dev    # http://localhost:4002 (HTTP server mode)

# 5) import workflows into n8n (http://localhost:5678) and activate them
#    n8n env: set API_BASE=http://api:3001  SCRAPER_BASE=http://scraper:4002
#    plus the same TELEGRAM/GMAIL/SLACK vars
```

For a always-on VPS, run the API + Postgres + n8n via `docker compose up -d` and run the scraper
under `xvfb` (the scraper Dockerfile already wraps it). Keep `HEADLESS=false`.

## 7.3 Managed (Railway / Render)

| Component | Where | Notes |
|-----------|-------|-------|
| Postgres | Railway/Render managed PG | set `DATABASE_URL` |
| API (`apps/api`) | Railway/Render web service | build with `apps/api/Dockerfile`; expose `:3001` |
| n8n | Railway template or Render | point `API_BASE`/`SCRAPER_BASE` at internal URLs |
| Scraper | **your own always-on machine** | browser automation + a real residential IP is far safer than a datacenter IP; tunnel it to the API via Tailscale/Cloudflare Tunnel |

> Hosting the scraper on a datacenter IP dramatically raises the bot-detection/ban risk on
> LinkedIn. Prefer running it from your normal machine/home IP. This is a deliberate split.

Railway deploy sketch:

```bash
railway init
railway add   # Postgres plugin
railway up    # builds apps/api/Dockerfile
railway variables set ANTHROPIC_API_KEY=... AUTO_APPLY_MODE=off OUTBOUND_ENABLED=false ...
```

## 7.4 Session lifecycle

Sessions expire (LinkedIn ~weeks). When the scraper reports a challenge or empty results, it
flags `NEEDS_MANUAL` and pings Telegram. Re-run `pnpm scraper:login <platform>` and restart the
scraper. Sessions live in `./storage-state` (gitignored) — back them up securely, never commit.

## 7.5 First-run checklist

1. `AUTO_APPLY_MODE=off`, `OUTBOUND_ENABLED=false` (defaults) — verify discovery + scoring + drafts
   land in Postgres and the morning report arrives.
2. Inspect a few `Document` rows (tailored resumes) for quality.
3. Flip to `AUTO_APPLY_MODE=review` — approve a couple applications manually from Telegram.
4. Only then consider `easy_apply` with a high `AUTO_APPLY_MIN_SCORE` and small daily caps.

## 7.6 Health & ops

- `GET /reports/daily` — smoke test the report path.
- `prisma studio` (`pnpm db:studio`) — inspect the pipeline state.
- Logs: API logs each pipeline stage; `Event` table is the durable audit trail.
- Backups: nightly `pg_dump`; the mirrors (Sheets/Notion) are reconstructable from Postgres.
