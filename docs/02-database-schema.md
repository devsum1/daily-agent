# 2. Database Schema

PostgreSQL 16. The authoritative definition is [`prisma/schema.prisma`](../prisma/schema.prisma);
a raw-SQL mirror is in [`db/init.sql`](../db/init.sql) (used by the Docker init + as documentation).

## 2.1 ER diagram

```mermaid
erDiagram
    Job ||--o| JobScore : has
    Job ||--o| Application : has
    Job ||--o{ Document : produces
    Job ||--o{ Outreach : "may target"
    Job ||--o{ Event : logs
    Recruiter ||--o{ Outreach : "contacted via"
    Job {
        string id PK
        string dedupeHash UK
        enum platform
        string title
        string company
        string url
        text description
        float salaryMinLpa
        float salaryMaxLpa
        bool easyApply
        float companyRating
        enum status
    }
    JobScore {
        string jobId FK
        float skillMatchPct
        float experienceMatchPct
        float compFitPct
        float priorityScore
        bool passedGate
        string[] missingSkills
    }
    Application {
        string jobId FK
        enum status
        enum applyMethod
        string resumeVersion
        datetime appliedAt
        datetime followUpDate
    }
    Document {
        string jobId FK
        enum type
        int version
        text content
    }
    Recruiter {
        string id PK
        string name
        string title
        string profileUrl UK
    }
    Outreach {
        string recruiterId FK
        string jobId FK
        enum status
        text message
    }
```

## 2.2 Tables

| Table | Purpose |
|-------|---------|
| `Job` | Every discovered posting. Deduped by `dedupeHash`. |
| `JobScore` | One score row per job (deterministic engine output). |
| `Application` | Application lifecycle / state machine per job. |
| `Document` | Generated artifacts (resume, cover, recruiter msg, custom answers), versioned. |
| `Recruiter` | People found for outreach. |
| `Outreach` | One row per (recruiter, job) contact attempt. |
| `Event` | Append-only audit log of every action. |
| `LlmUsage` | One row per LLM call → cost tracking. |
| `DailyMetric` | Pre-aggregated rollups for reports/analytics. |

## 2.3 The Tracking System mapping

The spec's tracking fields map directly onto the **`Job` + `JobScore` + `Application` + `Recruiter`**
join. This is what gets mirrored to Google Sheets / Notion (one row per job):

| Spec field | Source column |
|------------|---------------|
| Company | `Job.company` |
| Role | `Job.title` |
| Job URL | `Job.url` |
| Platform | `Job.platform` |
| Applied Date | `Application.appliedAt` |
| Resume Version | `Application.resumeVersion` → `Document.version` |
| Match Score | `JobScore.priorityScore` |
| Recruiter | `Recruiter.name` (via `Outreach`) |
| Follow-up Date | `Application.followUpDate` |
| Status | `Application.status` |

## 2.4 Application state machine

```mermaid
stateDiagram-v2
    [*] --> NEW
    NEW --> DRAFTED: score>70, docs generated
    NEW --> [*]: SKIPPED (gate failed)
    DRAFTED --> QUEUED: human approves / auto (easy_apply)
    DRAFTED --> WITHDRAWN: human rejects
    QUEUED --> APPLIED: apply worker success
    QUEUED --> NEEDS_MANUAL: custom Qs / captcha
    NEEDS_MANUAL --> APPLIED: human completes
    APPLIED --> RECRUITER_CONTACTED: outreach sent
    RECRUITER_CONTACTED --> INTERVIEW_SCHEDULED
    APPLIED --> INTERVIEW_SCHEDULED
    INTERVIEW_SCHEDULED --> OFFER
    INTERVIEW_SCHEDULED --> REJECTED
    APPLIED --> REJECTED
    OFFER --> [*]
    REJECTED --> [*]
```

## 2.5 Key constraints & indexes

- `Job.dedupeHash` **UNIQUE** → idempotent ingestion; re-running a day never duplicates.
- `JobScore.priorityScore` indexed → fast "top N" for reports.
- `Application.followUpDate` indexed → daily "follow-ups required" query.
- `Event` is **append-only** (no updates/deletes) → full audit trail for every outbound action,
  which matters for the ToS-sensitive operations.
- `LlmUsage` → exact cost reconciliation against the estimate in [docs/08](08-cost-estimate.md).
