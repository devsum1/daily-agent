# 6. Claude Prompts

All prompts are files in [`prompts/`](../prompts) so they're versioned and diff-able. The API's
LLM gateway loads them, fills `{{placeholders}}`, and calls Claude (falling back to OpenAI).

## 6.1 Model routing (cost-aware)

| Prompt | Model | Why |
|--------|-------|-----|
| `jd-extraction` | **Haiku** (`ANTHROPIC_MODEL_FAST`) | High volume (every job), structured output, cheap |
| `resume-match` | Haiku | Runs on every shortlist candidate; deterministic-ish |
| `resume-tailor` | **Opus** (`ANTHROPIC_MODEL`) | Only the few that pass the gate; quality matters |
| `cover-letter` | Opus | Same — quality-critical, low volume |
| `recruiter-message` | Haiku | Short, templated |
| `custom-answers` | Opus | Accuracy matters; flags low-confidence |
| `report-generation` | Haiku | Summarization over structured data |

## 6.2 Hard rules baked into every generation prompt

1. **Never fabricate.** Only use facts from `resume-base.md`. If the JD wants a skill the
   candidate lacks, the prompt must *not* claim it — it surfaces it as a gap instead.
2. **Structured output.** Extraction/scoring prompts must return strict JSON (validated; on parse
   failure the gateway retries once with a "return valid JSON only" nudge).
3. **Confidence flagging.** `custom-answers` returns a `confidence` per answer; anything `<0.7`
   forces `NEEDS_MANUAL`.
4. **No PII leakage to logs.** Prompts reference the resume by content but the gateway redacts
   phone/email from `LlmUsage` debug payloads.

## 6.3 The prompts

| File | Input | Output |
|------|-------|--------|
| [`jd-extraction.md`](../prompts/jd-extraction.md) | raw JD text | JSON: skills, years, archetype, comp, companyType |
| [`resume-match.md`](../prompts/resume-match.md) | JD + resume | JSON: match score, missing skills, interview prob, rationale |
| [`resume-tailor.md`](../prompts/resume-tailor.md) | JD + base resume | tailored resume markdown |
| [`cover-letter.md`](../prompts/cover-letter.md) | JD + resume + company | cover letter |
| [`recruiter-message.md`](../prompts/recruiter-message.md) | JD + recruiter + resume | ≤300-char connection note + longer InMail |
| [`custom-answers.md`](../prompts/custom-answers.md) | questions[] + resume | JSON answers + confidence |
| [`report-generation.md`](../prompts/report-generation.md) | metrics JSON | the morning/weekly report markdown |

> **Note on division of labour:** the LLM in `resume-match` produces an *advisory* score, but the
> **gate decision is made by the deterministic engine** (`core/scoring.ts`), not the LLM. The LLM
> score is stored for comparison/telemetry only. This prevents prompt-injection in a JD from
> talking the agent into applying.
