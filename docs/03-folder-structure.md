# 3. Folder Structure

A pnpm monorepo. Two deployable apps (`api`, `scraper`), two shared libraries (`core`,
`integrations`), and infra/docs at the root.

```
job-search-agent/
├── README.md
├── DISCLAIMER.md                  # ToS / safety — read first
├── .env.example                   # all config, documented
├── .gitignore                     # storage-state/, artifacts/, secrets/ excluded
├── docker-compose.yml             # postgres + n8n + api (+ scraper profile)
├── package.json / pnpm-workspace.yaml
│
├── config/
│   ├── profile.json               # THE candidate profile — drives scoring
│   └── resume-base.md             # master resume (source of truth, never fabricated)
│
├── prisma/
│   └── schema.prisma              # DB source of truth
├── db/
│   └── init.sql                   # raw DDL mirror (docker init)
│
├── prompts/                       # versioned Claude prompt templates
│   ├── jd-extraction.md
│   ├── resume-match.md
│   ├── resume-tailor.md
│   ├── cover-letter.md
│   ├── recruiter-message.md
│   ├── custom-answers.md
│   └── report-generation.md
│
├── n8n/workflows/                 # importable orchestration
│   ├── daily-job-search.json
│   ├── morning-report.json
│   └── weekly-analytics.json
│
├── packages/
│   ├── core/                      # @jsa/core — pure, testable
│   │   └── src/
│   │       ├── types.ts           # shared domain types
│   │       ├── profile.ts         # load + validate profile.json
│   │       └── scoring.ts         # deterministic scoring engine
│   └── integrations/              # @jsa/integrations
│       └── src/
│           ├── google-sheets.ts
│           ├── notion.ts
│           ├── telegram.ts
│           ├── gmail.ts
│           └── slack.ts
│
├── apps/
│   ├── api/                       # @jsa/api — NestJS
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── config/            # env validation
│   │       ├── prisma/            # PrismaService
│   │       └── modules/
│   │           ├── jobs/          # ingest + dedupe
│   │           ├── matching/      # orchestrates LLM extract + core scoring
│   │           ├── applications/  # state machine, queue, approvals
│   │           ├── outreach/      # recruiter discovery + messages
│   │           ├── tracking/      # Sheets/Notion mirror
│   │           ├── reports/       # daily + weekly
│   │           ├── notifications/ # telegram/gmail/slack fan-out
│   │           └── llm/           # Claude→OpenAI gateway + cost logging
│   │
│   └── scraper/                   # @jsa/scraper — Playwright
│       ├── Dockerfile
│       ├── package.json
│       └── src/
│           ├── index.ts           # CLI: search | apply | login
│           ├── browser.ts         # context, storage-state, human delays
│           ├── session.ts         # login/persist sessions per platform
│           └── platforms/
│               ├── base.ts        # PlatformAdapter interface
│               ├── linkedin.ts
│               ├── naukri.ts
│               ├── instahyre.ts
│               ├── hirist.ts
│               ├── wellfound.ts
│               └── cutshort.ts
│
├── artifacts/                     # (gitignored) generated resumes, letters, screenshots
├── storage-state/                 # (gitignored) persisted browser sessions
├── secrets/                       # (gitignored) service-account json
└── docs/                          # the 10 deliverables (you are here)
```

## Why this shape

- **`core` has zero IO** → the scoring gate is unit-testable and deterministic.
- **`scraper` is the only ToS-sensitive surface** → isolated, rate-limited, easy to disable.
- **`integrations` are thin clients** → swapping Notion for Airtable touches one file.
- **`api` modules mirror the pipeline stages** → each stage is independently deployable/testable.
- **Prompts are files, not string literals** → versioned, diff-able, A/B-testable.
