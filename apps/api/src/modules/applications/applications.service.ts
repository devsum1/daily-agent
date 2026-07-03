import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { NotificationsService } from '../notifications/notifications.service';
import { loadProfile } from '@jsa/core';

const SCRAPER = process.env.SCRAPER_BASE ?? 'http://localhost:4002';

@Injectable()
export class ApplicationsService {
  private readonly log = new Logger(ApplicationsService.name);
  private readonly profile = loadProfile();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly notify: NotificationsService,
  ) {}

  private baseResume(): string {
    try { return readFileSync(resolve(this.profile.candidate.baseResumePath), 'utf-8'); }
    catch { return ''; }
  }

  /** For every shortlisted job without docs: generate resume + cover + recruiter message. */
  async draftShortlisted(limit = 20) {
    const jobs = await this.prisma.job.findMany({
      where: { status: 'SHORTLISTED', application: null },
      include: { score: true },
      take: limit,
    });
    const resume = this.baseResume();
    let drafted = 0;

    for (const job of jobs) {
      const skills = job.score?.matchedSkills?.join(', ') ?? '';
      const jdExcerpt = (job.description ?? '').slice(0, 2500);

      const [tailored, cover, recruiter] = await Promise.all([
        this.llm.call({ purpose: 'resume', prompt: 'resume-tailor', think: true, jobId: job.id,
          vars: { title: job.title, company: job.company, requiredSkills: skills, jdExcerpt, resume } }),
        this.llm.call({ purpose: 'cover', prompt: 'cover-letter', think: true, jobId: job.id,
          vars: { title: job.title, company: job.company, requiredSkills: skills, jdExcerpt, resume } }),
        this.llm.call({ purpose: 'recruiter_msg', prompt: 'recruiter-message', fast: true, json: true, jobId: job.id,
          vars: { recruiterName: '', recruiterTitle: 'Recruiter', company: job.company, title: job.title,
            leadStrength: skills.split(',')[0] ?? 'React/Next.js', candidateSummary: this.profile.candidate.currentRole } }),
      ]);

      await this.prisma.$transaction([
        this.prisma.document.create({ data: { jobId: job.id, type: 'RESUME', content: tailored.text, model: process.env.ANTHROPIC_MODEL } }),
        this.prisma.document.create({ data: { jobId: job.id, type: 'COVER_LETTER', content: cover.text, model: process.env.ANTHROPIC_MODEL } }),
        this.prisma.document.create({ data: { jobId: job.id, type: 'RECRUITER_MESSAGE', content: JSON.stringify(recruiter.json ?? recruiter.text) } }),
        this.prisma.application.create({ data: { jobId: job.id, status: 'DRAFTED' } }),
        this.prisma.event.create({ data: { jobId: job.id, type: 'DRAFTED', actor: 'api' } }),
      ]);
      drafted++;
    }
    return { drafted };
  }

  /** Decide what to do with DRAFTED apps based on AUTO_APPLY_MODE. */
  async dispatch(mode = process.env.AUTO_APPLY_MODE ?? 'off') {
    const drafted = await this.prisma.application.findMany({
      where: { status: 'DRAFTED' },
      include: { job: { include: { score: true } } },
    });
    const minScore = Number(process.env.AUTO_APPLY_MIN_SCORE ?? 80);
    let queued = 0;
    let flagged = 0;

    for (const app of drafted) {
      const score = app.job.score?.priorityScore ?? 0;
      const eligibleAuto = mode === 'easy_apply' && app.job.easyApply && score >= minScore;

      if (eligibleAuto) {
        await this.prisma.application.update({ where: { id: app.id }, data: { status: 'QUEUED', applyMethod: 'EASY_APPLY' } });
        queued++;
      } else {
        // review / off → request human approval (Telegram inline buttons)
        await this.notify.approvalCard(app.job, score);
        flagged++;
      }
    }
    return { mode, queued, flagged };
  }

  /** Worker: process QUEUED apps via the scraper, respecting daily caps. */
  async runQueue() {
    if (process.env.OUTBOUND_ENABLED !== 'true') return { skipped: 'OUTBOUND_ENABLED=false' };
    const cap = this.profile.limits.maxEasyApplyPerDay ?? 10;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const appliedToday = await this.prisma.application.count({ where: { appliedAt: { gte: since } } });
    let budget = Math.max(0, cap - appliedToday);

    const queued = await this.prisma.application.findMany({
      where: { status: 'QUEUED' }, include: { job: true, }, take: budget,
    });
    let applied = 0; let manual = 0;

    for (const app of queued) {
      if (budget-- <= 0) break;
      const resumeDoc = await this.prisma.document.findFirst({ where: { jobId: app.jobId, type: 'RESUME' }, orderBy: { version: 'desc' } });
      const outcome = await fetch(`${SCRAPER}/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: app.job.platform, target: { jobId: app.jobId, url: app.job.url, resumePath: resumeDoc?.filePath ?? '' } }),
      }).then((r) => r.json()).catch((e) => ({ status: 'NEEDS_MANUAL', reason: e.message }));

      if (outcome.status === 'APPLIED') {
        await this.prisma.application.update({ where: { id: app.id }, data: {
          status: 'APPLIED', appliedAt: new Date(), resumeVersion: resumeDoc?.id,
          confirmationRef: outcome.confirmationRef, screenshotPath: outcome.screenshotPath,
          followUpDate: new Date(Date.now() + 5 * 864e5), attempts: { increment: 1 } } });
        await this.prisma.event.create({ data: { jobId: app.jobId, type: 'APPLIED', actor: 'scraper' } });
        applied++;
      } else {
        await this.prisma.application.update({ where: { id: app.id }, data: {
          status: 'NEEDS_MANUAL', needsHumanReason: outcome.reason, screenshotPath: outcome.screenshotPath, attempts: { increment: 1 } } });
        await this.notify.needsManual(app.job, outcome.reason, outcome.questions);
        manual++;
      }
    }
    return { applied, manual };
  }

  /** Telegram/dashboard callback. */
  async decide(applicationId: string, approve: boolean) {
    const status = approve ? 'QUEUED' : 'WITHDRAWN';
    await this.prisma.application.update({ where: { id: applicationId }, data: { status } });
    await this.prisma.event.create({ data: { type: approve ? 'APPROVED' : 'REJECTED', actor: 'human', payload: { applicationId } } });
    return { applicationId, status };
  }
}
