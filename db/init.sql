-- Raw DDL mirror of prisma/schema.prisma. Runs on first Postgres boot via docker-compose.
-- Prisma migrations remain the source of truth in app code; this file documents the shape
-- and seeds a fresh DB so n8n/manual SQL can be explored before the API ever runs.

CREATE TYPE platform AS ENUM ('LINKEDIN','NAUKRI','INSTAHYRE','HIRIST','WELLFOUND','CUTSHORT');
CREATE TYPE job_status AS ENUM ('NEW','SCORED','SHORTLISTED','SKIPPED','ARCHIVED');
CREATE TYPE application_status AS ENUM (
  'NEW','DRAFTED','QUEUED','APPLIED','NEEDS_MANUAL','RECRUITER_CONTACTED',
  'INTERVIEW_SCHEDULED','REJECTED','OFFER','WITHDRAWN');
CREATE TYPE document_type AS ENUM ('RESUME','COVER_LETTER','RECRUITER_MESSAGE','CUSTOM_ANSWERS','CONNECTION_NOTE');
CREATE TYPE apply_method AS ENUM ('EASY_APPLY','EXTERNAL','ONE_CLICK','MANUAL');
CREATE TYPE outreach_status AS ENUM ('IDENTIFIED','DRAFTED','REQUEST_SENT','CONNECTED','REPLIED','NO_RESPONSE');

CREATE TABLE "Job" (
  id              TEXT PRIMARY KEY,
  "dedupeHash"    TEXT UNIQUE NOT NULL,
  platform        platform NOT NULL,
  "externalId"    TEXT,
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  "companyDomain" TEXT,
  location        TEXT NOT NULL,
  remote          BOOLEAN NOT NULL DEFAULT false,
  url             TEXT NOT NULL,
  description     TEXT,
  "postedAt"      TIMESTAMPTZ,
  "salaryText"    TEXT,
  "salaryMinLpa"  DOUBLE PRECISION,
  "salaryMaxLpa"  DOUBLE PRECISION,
  "easyApply"     BOOLEAN NOT NULL DEFAULT false,
  "companyRating" DOUBLE PRECISION,
  "companyType"   TEXT,
  status          job_status NOT NULL DEFAULT 'NEW',
  "rawJson"       JSONB,
  "discoveredAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_status_idx ON "Job"(status);
CREATE INDEX job_company_idx ON "Job"(platform, company);
CREATE INDEX job_discovered_idx ON "Job"("discoveredAt");

CREATE TABLE "JobScore" (
  id                     TEXT PRIMARY KEY,
  "jobId"                TEXT UNIQUE NOT NULL REFERENCES "Job"(id) ON DELETE CASCADE,
  "skillMatchPct"        DOUBLE PRECISION NOT NULL,
  "experienceMatchPct"   DOUBLE PRECISION NOT NULL,
  "compFitPct"           DOUBLE PRECISION NOT NULL,
  "companyFitPct"        DOUBLE PRECISION NOT NULL,
  "roleFitPct"           DOUBLE PRECISION NOT NULL,
  "interviewProbability" DOUBLE PRECISION NOT NULL,
  "priorityScore"        DOUBLE PRECISION NOT NULL,
  "matchedSkills"        TEXT[] NOT NULL DEFAULT '{}',
  "missingSkills"        TEXT[] NOT NULL DEFAULT '{}',
  archetype              TEXT NOT NULL,
  "passedGate"           BOOLEAN NOT NULL,
  rationale              TEXT,
  "scoredAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobscore_priority_idx ON "JobScore"("priorityScore");
CREATE INDEX jobscore_gate_idx ON "JobScore"("passedGate");

CREATE TABLE "Application" (
  id                TEXT PRIMARY KEY,
  "jobId"           TEXT UNIQUE NOT NULL REFERENCES "Job"(id) ON DELETE CASCADE,
  status            application_status NOT NULL DEFAULT 'NEW',
  "applyMethod"     apply_method,
  "resumeVersion"   TEXT,
  "appliedAt"       TIMESTAMPTZ,
  "followUpDate"    TIMESTAMPTZ,
  "needsHumanReason" TEXT,
  "confirmationRef" TEXT,
  "screenshotPath"  TEXT,
  attempts          INT NOT NULL DEFAULT 0,
  "lastError"       TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX app_status_idx ON "Application"(status);
CREATE INDEX app_followup_idx ON "Application"("followUpDate");

CREATE TABLE "Document" (
  id        TEXT PRIMARY KEY,
  "jobId"   TEXT NOT NULL REFERENCES "Job"(id) ON DELETE CASCADE,
  type      document_type NOT NULL,
  version   INT NOT NULL DEFAULT 1,
  content   TEXT NOT NULL,
  "filePath" TEXT,
  model     TEXT,
  "tokensIn"  INT,
  "tokensOut" INT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX doc_job_type_idx ON "Document"("jobId", type);

CREATE TABLE "Recruiter" (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  title       TEXT,
  company     TEXT,
  "profileUrl" TEXT UNIQUE,
  email       TEXT,
  source      platform,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Outreach" (
  id          TEXT PRIMARY KEY,
  "jobId"     TEXT REFERENCES "Job"(id) ON DELETE SET NULL,
  "recruiterId" TEXT NOT NULL REFERENCES "Recruiter"(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  status      outreach_status NOT NULL DEFAULT 'IDENTIFIED',
  message     TEXT,
  "sentAt"    TIMESTAMPTZ,
  "repliedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outreach_status_idx ON "Outreach"(status);

CREATE TABLE "Event" (
  id        TEXT PRIMARY KEY,
  "jobId"   TEXT REFERENCES "Job"(id) ON DELETE SET NULL,
  type      TEXT NOT NULL,
  actor     TEXT NOT NULL,
  payload   JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_type_idx ON "Event"(type);
CREATE INDEX event_created_idx ON "Event"("createdAt");

CREATE TABLE "LlmUsage" (
  id        TEXT PRIMARY KEY,
  purpose   TEXT NOT NULL,
  provider  TEXT NOT NULL,
  model     TEXT NOT NULL,
  "tokensIn"  INT NOT NULL,
  "tokensOut" INT NOT NULL,
  "costUsd"   DOUBLE PRECISION NOT NULL,
  "jobId"   TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX llm_created_idx ON "LlmUsage"("createdAt");
CREATE INDEX llm_purpose_idx ON "LlmUsage"(purpose);

CREATE TABLE "DailyMetric" (
  id                     TEXT PRIMARY KEY,
  date                   DATE UNIQUE NOT NULL,
  "jobsDiscovered"       INT NOT NULL DEFAULT 0,
  "jobsShortlisted"      INT NOT NULL DEFAULT 0,
  "applicationsSubmitted" INT NOT NULL DEFAULT 0,
  "recruitersContacted"  INT NOT NULL DEFAULT 0,
  "recruiterReplies"     INT NOT NULL DEFAULT 0,
  "interviewsScheduled"  INT NOT NULL DEFAULT 0,
  "llmCostUsd"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
);
