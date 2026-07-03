# Autonomous Job Search & Application Agent

An AI agent that **discovers, evaluates, tracks, drafts, and (optionally) applies** to jobs
across LinkedIn, Naukri, Instahyre, Hirist, Wellfound and Cutshort — tailored to a single
candidate profile (Sumit Singh, 5+ yrs Fullstack/Frontend).

> **Read [`DISCLAIMER.md`](./DISCLAIMER.md) before running anything.** Browser automation of
> LinkedIn/Naukri violates their Terms of Service and can get your account restricted or banned.
> This system therefore ships **human-in-the-loop by default**: it drafts and queues, you approve.

---

## What it does

| Stage | Description |
|-------|-------------|
| **Discover** | Scheduled daily searches across 6 platforms for your keywords + locations |
| **Evaluate** | Claude extracts the JD, scores skill/experience/comp fit, computes a priority score |
| **Shortlist** | Only jobs with `matchScore > 70` move forward |
| **Generate** | Tailored resume, cover letter, recruiter message, custom Q&A — all stored |
| **Apply** | Auto for Easy-Apply (opt-in); everything else queued for one-click human approval |
| **Outreach** | Finds recruiter/HM, drafts connection notes (sending is opt-in + rate-limited) |
| **Track** | Postgres = source of truth; mirrored to Google Sheets + Notion |
| **Report** | 8 AM daily digest + Sunday weekly analytics via Email / Slack / Telegram |

## The 10 deliverables

All design docs live in [`docs/`](./docs):

1. [System Architecture](docs/01-system-architecture.md)
2. [Database Schema](docs/02-database-schema.md)
3. [Folder Structure](docs/03-folder-structure.md)
4. [n8n Workflow](docs/04-n8n-workflow.md)
5. [Playwright Automation](docs/05-playwright-automation.md)
6. [Claude Prompts](docs/06-claude-prompts.md)
7. [Deployment Guide](docs/07-deployment-guide.md)
8. [Cost Estimate](docs/08-cost-estimate.md)
9. [Security Design](docs/09-security-design.md)
10. [Implementation Plan](docs/10-implementation-plan.md)

## Tech stack

- **Frontend (dashboard):** Next.js + React + Tailwind *(scaffold described, not the focus)*
- **Backend:** Node.js + NestJS (`apps/api`)
- **Browser automation:** Playwright (`apps/scraper`)
- **Orchestration:** n8n (`n8n/workflows`)
- **DB:** PostgreSQL (Prisma — `prisma/schema.prisma`)
- **AI:** Claude API (primary) + OpenAI (fallback) — `apps/api/src/modules/llm`
- **Storage/mirror:** Google Sheets + Notion (`packages/integrations`)
- **Notify:** Telegram + Gmail + Slack
- **Deploy:** Docker Compose → Railway / Render

## Quick start (local)

```bash
cp .env.example .env            # fill in secrets (see Security Design)
docker compose up -d postgres n8n
pnpm install
pnpm --filter @jsa/api prisma migrate dev
pnpm --filter @jsa/api dev      # NestJS API on :3001
pnpm --filter @jsa/scraper login   # one-time: persist platform sessions
```

Then import the workflows in [`n8n/workflows`](./n8n/workflows) into your n8n instance
(`http://localhost:5678`) and set the schedule triggers.

## Repository layout

```
job-search-agent/
├── apps/
│   ├── api/         NestJS — scoring, generation, tracking, reports, REST API
│   └── scraper/     Playwright — per-platform discovery + Easy-Apply
├── packages/
│   ├── core/        Shared types + the deterministic scoring engine
│   └── integrations/ Sheets, Notion, Telegram, Gmail clients
├── prisma/          schema.prisma (single source of truth for the DB)
├── db/              init.sql (raw DDL mirror)
├── n8n/             Importable workflow JSON
├── prompts/         Versioned Claude prompt templates
├── config/          profile.json (the candidate profile)
└── docs/            The 10 deliverables
```

## Operating modes

Set `AUTO_APPLY_MODE` in `.env`:

- `off` — discover + score + draft only. **Default. Safest.**
- `review` — everything queued; you approve each apply from the dashboard/Telegram.
- `easy_apply` — auto-submits only platform "Easy Apply / 1-click" forms above a score
  threshold; everything else still queued. Sending connection requests stays manual.

There is intentionally **no fully-unattended "apply to everything" mode.**
