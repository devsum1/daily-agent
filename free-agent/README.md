# Free Job Search Agent

A **completely free**, ATS-focused job search agent. No OpenAI, no Claude, no
Telegram, no paid services. Google Sheets is the database, Gmail is the
notification channel, Google Apps Script + GitHub Actions are the automation.

Built for: **Frontend-leaning Fullstack Engineer, 5+ yrs** (React, Next.js,
TypeScript, Java, Spring Boot, Node.js, NestJS, PostgreSQL, MySQL, Redis, AWS,
SEO, Core Web Vitals, System Design).

---

## Architecture

```
                       ┌──────────────────────────────┐
    06:00 IST daily    │   GitHub Actions (free tier) │
   ┌───────────────────│   scraper/src/index.js       │
   │                   └──────────────┬───────────────┘
   │  LinkedIn guest API                  │ HTTPS POST (secret token)
   │  Wellfound / Instahyre / Hirist      ▼
   │  (best-effort JSON-LD)    ┌──────────────────────────────┐
   │                           │  Google Apps Script Web App  │
   │                           │  doPost → dedupe → score     │
   │                           └──────────────┬───────────────┘
   │   Naukri / LinkedIn                      ▼
   │   job-alert emails        ┌──────────────────────────────┐
   └──────────────────────────►│        Google Sheet          │
        07:30 parseJobAlerts   │  Jobs_Master │ Applications  │
        (Gmail → sheet)        │  Recruiters  │ Dashboard     │
                               └──────────────┬───────────────┘
                                              │ time triggers
              ┌───────────────────────────────┼──────────────────────────┐
              ▼                               ▼                          ▼
      08:00 Daily report            09:00 Follow-up check       Sun 19:00 Weekly
      (Gmail HTML digest)           (5-day reminder email)      analytics email
```

**Why email ingestion for Naukri?** Naukri's public JSON API returns
`406 recaptcha required` for non-browser clients (verified), and its search
pages are client-side rendered. Their **daily job-alert emails** are the
reliable, ToS-friendly free channel — Apps Script reads them from your Gmail
and pushes them through the exact same dedupe + scoring pipeline. LinkedIn is
scraped directly via its public guest endpoint (works, verified) *and* can
also flow in via alert emails as a belt-and-braces channel.

---

## Google Sheet schema

**Jobs_Master** — every job ever discovered
| Col | Field | Notes |
|---|---|---|
| A | Job ID | stable hash of company+role+location+source (dedupe key) |
| B | Date | discovery date |
| C | Company | |
| D | Role | |
| E | Location | |
| F | Source | LinkedIn / Naukri / Wellfound / Instahyre / Hirist |
| G | Experience | as listed, e.g. "4-8 Yrs" |
| H | Salary | if disclosed |
| I | Job URL | |
| J | Status | dropdown: New / Reviewed / **Applied** / Skipped |
| K | Priority | High (80+) / Medium (60–79) / Low (<60) |
| L | Match Score | 0–100, keyword engine (see below) |
| M | Matched Skills | which of your skills the JD mentions |

**Applications** — auto-populated when you set Status = "Applied"
| Company | Role | Applied Date | Source | Application URL | Resume Version | Status | Interview Stage | Notes |

Status dropdown: Applied / Interviewing / Rejected / Offer / Withdrawn.
Follow-up stamps are written into Notes as `[follow-up sent YYYY-MM-DD]`.

**Recruiters** — LinkedIn networking tracker (manual entry)
| Name | Company | LinkedIn URL | Email | Contacted | Response |

**Dashboard** — live formulas + charts (built by `setup()`)
Total Jobs · High/Medium Match · Applied · Interviewing · Rejected · Offers ·
Conversion Rate · Recruiters Contacted/Responded, plus an application-funnel
pie chart and jobs-by-source column chart.

---

## Scoring logic (AI matching without an API)

Weighted keyword matching in `apps-script/Scoring.gs` — deterministic,
auditable, tweakable:

- **Core skills, up to 60 pts** (proportional, weighted): React 10, Next.js 10,
  TypeScript 9, JavaScript 7, Frontend Performance/Core Web Vitals 7
- **Secondary skills, up to 25 pts**: Java 8, Spring Boot 8, Node.js 8,
  System Design 8, AWS 7, PostgreSQL 6, NestJS 6, SEO 6, MySQL 5, Redis 5
- **Boosts**: title matches a target role +7 · target company (Atlassian,
  Razorpay, PhonePe, Flipkart, Swiggy, Zomato, Meesho, Uber, Google,
  Microsoft, Adobe) +5 · experience band fits 5 yrs +3
- **Penalties**: JD demands ≥8 yrs min or is a ≤2 yrs junior role −15

Alias table handles JD spellings (`reactjs`≈React, `nextjs`≈Next.js,
`postgres`≈PostgreSQL, `core web vitals`≈Frontend Performance…).
**High = 80+ · Medium = 60–79 · Low = <60.**

---

## Folder structure

```
free-agent/
├── README.md                     ← you are here
├── .github/workflows/
│   └── daily-jobs.yml            GitHub Actions: 06:00 IST daily scrape
├── scraper/                      Node 20, one dependency (cheerio)
│   ├── package.json
│   └── src/
│       ├── config.js             keywords, locations, rate limits — edit me
│       ├── index.js              orchestrator + webhook push
│       ├── linkedin.js           LinkedIn guest API (verified working)
│       ├── naukri.js             Naukri API attempt (bot-gated; kept for when it works)
│       └── others.js             Wellfound/Instahyre/Hirist via JSON-LD (best-effort)
└── apps-script/                  paste all 7 files into one Apps Script project
    ├── Setup.gs                  one-time setup: tabs, triggers, secret, menu
    ├── Code.gs                   doPost webhook, dedupe, ingest
    ├── Scoring.gs                keyword scoring engine
    ├── EmailIngest.gs            Gmail job-alert parser (Naukri channel)
    ├── Tracking.gs               Applied → Applications, follow-up reminders
    ├── Reports.gs                daily + weekly HTML emails
    └── Dashboard.gs              metrics formulas + charts
```

---

## Setup guide (~20 minutes, one time)

### Part 1 — Google Sheet + Apps Script (10 min)

1. Create a new Google Sheet at [sheets.new](https://sheets.new). Name it
   e.g. **Job Search Tracker**.
2. **Extensions → Apps Script**. Delete the default `Code.gs` content.
3. Create one script file per file in [apps-script/](apps-script/) (File → +
   → Script), paste the contents of all 7 files.
4. In the editor toolbar select **`setup`** and click **Run**. Grant the
   permissions it asks for (Sheets, Gmail, Triggers — it runs as *your*
   account; nothing leaves your Google account).
5. Back in the sheet you'll see the tabs + a **🤖 Job Agent** menu.
6. **Deploy → New deployment → ⚙️ Web app** → *Execute as: Me* · *Who has
   access: Anyone* → **Deploy**. Copy the `/exec` URL.
7. **🤖 Job Agent → Show webhook secret** — copy the token.

> Set the Apps Script project timezone to `Asia/Kolkata` (Project Settings)
> so the 8 AM trigger means 8 AM IST.

### Part 2 — GitHub Actions scraper (5 min)

1. Create a **new GitHub repo** (free, can be private) and push the contents
   of this `free-agent/` folder to its root (so `.github/workflows/` sits at
   the repo root).
2. Repo → **Settings → Secrets and variables → Actions** → add:
   - `SHEETS_WEBHOOK_URL` = the `/exec` URL from Part 1 step 6
   - `WEBHOOK_SECRET` = the token from Part 1 step 7
3. Actions tab → **Daily job scrape → Run workflow** to test. Watch the log:
   you should see `linkedin: N jobs` and `webhook response: {"ok":true,…}`,
   then rows appear in Jobs_Master, scored and sorted.

### Part 3 — job-alert emails (5 min, powers the Naukri channel)

1. **Naukri**: log in → Job Alerts → create alerts for your keywords
   (e.g. *Senior Frontend Engineer – Bangalore*, *Fullstack Engineer –
   Gurgaon*…), frequency **Daily**, sent to this Gmail.
2. **LinkedIn**: run each job search → toggle **Job alert** on, Daily, Email.
3. Instahyre/Hirist: enable their daily digest emails too if you use them.
4. Done — `parseJobAlerts` reads them every morning at 07:30 and ingests
   anything new before the 08:00 digest goes out.

---

## Daily usage

- **08:00** — "Daily Job Opportunities" email lands: totals, high-match count,
  top-10 table with scores and links, application status, pending follow-ups.
- Open the sheet, review **High/Medium** rows, apply on the platform, then set
  **Status = Applied** — the row is auto-copied to Applications with a
  timestamp.
- **5 days later** — if the application is still sitting at "Applied", you get
  a "Follow up with recruiter for Company X" email (once per application).
- Log networking in **Recruiters** (Contacted = Yes / Response = free text) —
  it feeds the dashboard counters.
- **Sunday 19:00** — weekly analytics email: jobs found, applied, response
  rate, interviews, top hiring companies, most-demanded skills in matched JDs.

## Tuning

- Search terms/locations → [scraper/src/config.js](scraper/src/config.js)
- Skill weights, target roles/companies → [apps-script/Scoring.gs](apps-script/Scoring.gs)
- Report times → `installTriggers()` in [apps-script/Setup.gs](apps-script/Setup.gs)
- After editing any `.gs` file, just save — no redeploy needed for triggers;
  redeploy the web app only if you change `doPost`.

## Costs & limits

Everything sits inside free tiers: GitHub Actions (public repo: unlimited;
private: 2,000 min/mo — this uses ~5 min/day), Apps Script (90 min/day
runtime, 100 emails/day — we send ~2), Sheets (10M cells). **₹0/month.**

## Honest notes

- Scraping LinkedIn's guest endpoint is against their ToS. Volume here is low
  (~30 requests/morning) and read-only, but be aware; the email-alert channel
  is the fully ToS-clean alternative for every platform.
- Naukri direct API is captcha-gated (verified) → use its alert emails.
- Wellfound/Instahyre/Hirist sit behind Cloudflare/login for search; the
  scraper tries JSON-LD extraction and fails gracefully — their alert emails
  are the dependable channel.
