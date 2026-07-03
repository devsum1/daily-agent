# 9. Security Design

This system holds your job-platform sessions, personal data (resume, contact details), and a set
of API keys. Treat it like any system that can act on your behalf.

## 9.1 Threat model

| Asset | Threat | Mitigation |
|-------|--------|-----------|
| Platform sessions (`storage-state/`) | Theft → account takeover | Gitignored, never committed; file-system perms 600; encrypt at rest on shared hosts; back up to a secrets vault, not cloud drive |
| API keys (Anthropic/OpenAI/Notion/Google/Telegram) | Leak → billing abuse, data access | `.env` only, gitignored; never logged; rotate on suspicion; least-privilege scopes |
| Resume / PII | Exfiltration, accidental exposure in logs | LLM debug payloads redact phone/email; no PII in `LlmUsage`; artifacts dir gitignored |
| Outbound actions (apply/connect/msg) | Runaway automation, ToS ban | `OUTBOUND_ENABLED` kill switch + per-day caps + human-in-the-loop default |
| n8n ⇄ API | Unauthorized triggering | Shared bearer (`API_INTERNAL_TOKEN`); webhook secret; bind services to private network |

## 9.2 Secrets management

- **Single source:** `.env` (local) or the platform's secret store (Railway/Render variables).
  Nothing secret is hard-coded. `.env*` is gitignored (`!.env.example` is the only tracked one).
- **Google service account** JSON lives in `./secrets/` (gitignored), referenced by path.
- **Gmail** uses a **Google App Password**, never your account password; scope is send-only SMTP.
- **Notion / Telegram / Anthropic** tokens are scoped to exactly what's needed (one Notion DB, one
  chat, one workspace).
- **Rotation:** document a quarterly rotation; revoke + reissue immediately if a host is shared or
  a laptop is lost.

## 9.3 Least privilege

- The DB user is app-scoped (not superuser). Mirrors (Sheets/Notion) get their own scoped tokens.
- The scraper is the only component with platform sessions; the API and n8n never see them.
- Internal API endpoints require `Authorization: Bearer ${API_INTERNAL_TOKEN}`; only n8n and you
  hold it. Don't expose `:3001` publicly — keep it on a private network / tunnel.

## 9.4 Data protection

- Postgres is the only durable PII store; enable disk encryption on the host/managed PG.
- `Event` is append-only → tamper-evident audit trail of every outbound action (useful if a
  platform queries your activity).
- Generated artifacts (resumes/letters/screenshots) live in `artifacts/` (gitignored). Purge
  periodically; they contain PII.
- **Prompt-injection defense:** JDs are untrusted input. The `jd-extraction` prompt explicitly
  fences the JD and instructs the model to ignore embedded instructions, and — critically — the
  **apply/no-apply decision is made by deterministic code, not the LLM**, so a malicious JD cannot
  talk the agent into applying or exfiltrating data.

## 9.5 Safe-automation controls (defense in depth)

1. `AUTO_APPLY_MODE` (`off`→`review`→`easy_apply`) — staged trust.
2. `OUTBOUND_ENABLED=false` master kill switch — read-only mode (discover/score/draft only).
3. Per-day caps + min-seconds-between-actions in `profile.json` (enforced in the scraper + API).
4. Easy-Apply only auto-submits clean forms; any custom question → `NEEDS_MANUAL` + alert.
5. Connection requests / messages are opt-in and never enabled by `easy_apply`.
6. CAPTCHA / checkpoint → hard stop, never solved.

## 9.6 Operational hygiene

- Run the scraper from your own IP, non-headless, with human-like pacing (datacenter IPs +
  headless = fast ban). See [docs/05](05-playwright-automation.md) and [DISCLAIMER](../DISCLAIMER.md).
- Keep dependencies patched; pin versions; review `playwright` updates (selector/behaviour drift).
- Don't run this multi-tenant. It's a single-user tool; one person's accounts, one person's data.
