# 8. Cost Estimate

Costs split into **LLM** (variable, the main lever) and **infrastructure** (mostly fixed). The
design deliberately keeps LLM cost low by (a) using deterministic scoring — **no LLM in the
scoring gate** — and (b) routing high-volume work to the cheap model and reserving the expensive
model for the few jobs that pass the gate.

## 8.1 Model pricing (per 1M tokens)

| Model | Role here | Input | Output |
|-------|-----------|-------|--------|
| Claude Haiku 4.5 | JD extraction, recruiter msgs, reports (high volume) | $1.00 | $5.00 |
| Claude Opus 4.8 | tailored resume + cover letter (low volume, quality-critical) | $5.00 | $25.00 |
| OpenAI GPT-4o | fallback only | $2.50 | $10.00 |

Pricing is also encoded in `apps/api/src/modules/llm/llm.service.ts` and every call is logged to
the `LlmUsage` table, so the estimate below can be reconciled against actuals at any time.

## 8.2 Per-day LLM estimate (typical: ~100 new jobs/day, ~12 shortlisted)

| Step | Model | Calls/day | ~Tokens (in/out) | Cost/day |
|------|-------|-----------|-------------------|----------|
| JD extraction | Haiku | 100 | 2,500 / 300 | **$0.40** |
| Deterministic scoring | — | 100 | 0 / 0 | $0.00 |
| Tailored resume | Opus (adaptive think) | 12 | 1,800 / 2,200 | **$0.77** |
| Cover letter | Opus (adaptive think) | 12 | 1,500 / 900 | **$0.36** |
| Recruiter message | Haiku | 12 | 600 / 250 | $0.02 |
| Custom-answer drafting | Opus | ~3 | 1,500 / 600 | $0.07 |
| Daily report | Haiku | 1 | 3,000 / 1,500 | $0.01 |
| **Total** | | | | **≈ $1.63/day** |

**≈ $49 / month** at this volume. Scales roughly linearly with jobs discovered and shortlist size.

### Cost levers

- Lower `perPlatformSearchPagesPerRun` / fewer keyword×location combos → fewer JD extractions.
- Tighten the gate (`shortlistMinScore`) → fewer Opus generations (the dominant cost).
- Cache the base resume in the prompt prefix (prompt caching) → ~90% off repeated resume tokens.
- Drop the optional `resume-match` advisory LLM pass (not used in the gate anyway).
- Run JD extraction as a nightly **Batch** (50% cheaper, non-latency-sensitive).

## 8.3 Infrastructure

| Item | Option | Cost/month |
|------|--------|-----------:|
| Postgres | Railway/Render managed (hobby) | $0–7 |
| API container | Railway/Render | $5–10 |
| n8n | self-hosted (Docker) | $0 (or n8n Cloud ~$20) |
| Scraper | **your own always-on machine** | $0 (electricity) |
| Domain/tunnel (optional) | Cloudflare Tunnel | $0 |
| **Infra subtotal** | | **$5–25** |

## 8.4 Bottom line

| Scenario | LLM | Infra | **Total/mo** |
|----------|----:|------:|-------------:|
| Light (50 jobs/day, 6 shortlist) | ~$25 | ~$7 | **~$32** |
| Typical (100 jobs/day, 12 shortlist) | ~$49 | ~$15 | **~$64** |
| Heavy (200 jobs/day, 25 shortlist) | ~$100 | ~$25 | **~$125** |

The single biggest cost driver is **how many jobs pass the gate and get Opus-generated documents**
— not discovery. Keep the gate strict and costs stay modest.
