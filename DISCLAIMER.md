# ⚠️ Read before running

This project automates interactions with job platforms on your behalf. Please understand the
following before you deploy or run it.

## 1. Terms of Service

- **LinkedIn** explicitly prohibits scraping and automated activity (bots, scripts, browser
  automation) in its [User Agreement](https://www.linkedin.com/legal/user-agreement) §8.2.
  Automated logins, connection requests, and messaging are the most common triggers for
  account restriction or permanent ban.
- **Naukri, Instahyre, Hirist, Wellfound, Cutshort** have comparable anti-automation clauses.
- Using LinkedIn **Premium** does not grant any automation rights.

**Consequence:** running aggressive automation against these accounts can get *your* account —
the one you use to actually find a job — restricted. That is the single biggest risk here.

## 2. How this project reduces (not eliminates) that risk

- **Human-in-the-loop by default** (`AUTO_APPLY_MODE=off`). Nothing is submitted or sent
  without your explicit approval.
- **No mass actions.** Hard daily caps: applications, connection requests, and messages are
  rate-limited with random human-like delays (see `config/profile.json → limits`).
- **Reuses your real, already-logged-in browser session** (persisted storage state) instead of
  programmatic credential login, and runs non-headless with realistic pacing.
- **Official APIs preferred** wherever they exist (Notion, Google Sheets, Telegram, Gmail).
  Browser automation is only used where no API exists.
- **Connection requests / messages are opt-in** and never enabled by `easy_apply` mode.

## 3. What this project will NOT do

- It will not solve CAPTCHAs for you or defeat anti-bot challenges. If a platform challenges a
  session, the run pauses and flags it for manual handling.
- It will not fabricate experience or credentials. Tailoring re-orders and re-weights *true*
  facts from your resume; it does not invent skills you don't have.
- It will not run a fully unattended "apply to thousands" mode. That mode does not exist by design.

## 4. Your responsibilities

- You own the accounts and accept the platform-ToS risk of using them this way.
- Keep automation volume low and human-like. The defaults are conservative — do not raise them.
- Review generated resumes/cover letters before they are sent. AI text can contain errors.
- Comply with all applicable laws and the platforms' terms in your jurisdiction.

Use responsibly. This is a personal-productivity tool for **one person applying to their own
jobs with their own accounts** — not a bulk-application or growth-hacking service.
