# 1. System Architecture

## 1.1 High-level overview

The system is a set of cooperating services orchestrated by **n8n** on a schedule. Postgres is
the single source of truth; everything else (Sheets, Notion, notifications) is a projection of it.

```mermaid
flowchart TB
    subgraph SCHED["⏰ n8n Orchestrator"]
      A1["Daily 7:00 — Discover & Score"]
      A2["Daily 8:00 — Morning Report"]
      A3["Sun 18:00 — Weekly Analytics"]
      A4["Hourly — Apply Queue Worker"]
    end

    subgraph SCRAPE["🕷️ Scraper service (Playwright)"]
      L1["LinkedIn"]
      L2["Naukri"]
      L3["Instahyre"]
      L4["Hirist"]
      L5["Wellfound"]
      L6["Cutshort"]
    end

    subgraph API["⚙️ NestJS API"]
      M1["Matching / Scoring engine"]
      M2["Generation (resume/cover/msg)"]
      M3["Application engine"]
      M4["Outreach engine"]
      M5["Reports & analytics"]
      M6["LLM gateway (Claude→OpenAI)"]
    end

    subgraph DATA["🗄️ Stores"]
      PG[("PostgreSQL")]
      GS["Google Sheets"]
      NT["Notion"]
      ART["Artifacts (resumes/letters)"]
    end

    subgraph NOTIFY["📣 Notifications"]
      TG["Telegram"]
      GM["Gmail"]
      SL["Slack"]
    end

    A1 --> SCRAPE
    SCRAPE -->|raw jobs| API
    M1 --> PG
    M6 -.-> CLAUDE["Claude API"]
    M6 -.-> OPENAI["OpenAI API"]
    M2 --> ART
    M3 -->|easy apply / queue| SCRAPE
    A2 --> M5
    A3 --> M5
    M5 --> NOTIFY
    PG <--> GS
    PG <--> NT
    M3 -.->|approval request| TG
    TG -.->|approve/reject callback| A4
```

## 1.2 Service responsibilities

| Service | Tech | Responsibility |
|---------|------|----------------|
| **n8n** | n8n | Cron triggers, glue, retries, webhook approvals, fan-out per platform/keyword |
| **scraper** | Playwright + TS | Logs in via persisted session, searches, extracts JD, performs Easy-Apply, screenshots |
| **api** | NestJS | Scoring, LLM generation, application state machine, outreach, reports, mirrors |
| **core** | TS lib | Deterministic scoring (no LLM), shared types, profile loader |
| **integrations** | TS lib | Sheets / Notion / Telegram / Gmail / Slack clients |
| **postgres** | Postgres 16 | System of record |

## 1.3 The pipeline (data flow for one job)

```mermaid
sequenceDiagram
    participant N as n8n
    participant S as Scraper
    participant A as API
    participant L as LLM (Claude)
    participant DB as Postgres
    participant U as You (Telegram)

    N->>S: search(platform, keyword, location)
    S->>S: open session, paginate, collect job cards
    S->>A: POST /jobs/ingest (raw cards)
    A->>DB: upsert Job (status=New, dedupe by hash)
    N->>A: POST /matching/score-pending
    A->>L: extract JD skills + classify archetype  (Haiku, cheap)
    A->>A: deterministic scoring (core/scoring.ts)
    A->>DB: write JobScore (match, exp, comp, priority)
    alt score > 70 && passes thresholds
        A->>L: generate tailored resume + cover + recruiter msg (Opus)
        A->>DB: store Document rows + Application(status=Drafted)
        alt AUTO_APPLY_MODE=easy_apply && easyApply && score>=AUTO_APPLY_MIN_SCORE
            A->>S: enqueue easy-apply
            S->>A: report result + screenshot
            A->>DB: Application(status=Applied)
        else review/off
            A->>U: approval card (Apply? Y/N)
            U-->>A: approve → enqueue apply
        end
    else
        A->>DB: Application(status=Skipped, reason)
    end
```

## 1.4 Design principles

1. **Postgres is truth.** Sheets/Notion are eventually-consistent mirrors written after commit.
2. **Deterministic where possible.** Final scores come from `core/scoring.ts` (pure functions),
   not from the LLM. The LLM only *extracts* and *classifies*; it never decides the gate. This
   makes scoring auditable, reproducible, and cheap.
3. **Idempotency everywhere.** Every job has a stable `dedupeHash`. Re-running a day is safe.
4. **Human-in-the-loop is a first-class state**, not an afterthought — see the Application state
   machine in [docs/02](02-database-schema.md).
5. **Stateless services, stateful DB.** API and scraper can be killed/restarted anytime.
6. **Cost-tiered LLM.** Cheap model (Haiku) for high-volume extraction/scoring; expensive model
   (Opus) only for the handful of jobs that pass the gate and need generation.

## 1.5 Failure & resilience

- Scraper failures (selector drift, CAPTCHA, session expiry) → job marked `NeedsManual`, Telegram
  alert, run continues with other platforms.
- LLM failures → retry with backoff, then fall back Claude→OpenAI via the LLM gateway.
- Mirror (Sheets/Notion) failures → non-fatal; a reconciliation job re-syncs from Postgres.
- All outbound actions pass through a **rate limiter + kill switch** (`OUTBOUND_ENABLED`).
