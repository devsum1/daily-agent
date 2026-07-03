import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { loadProfile } from '@jsa/core';

const SCRAPER = process.env.SCRAPER_BASE ?? 'http://localhost:4002';

// Finds recruiter/HM leads for APPLIED jobs and drafts personalized notes.
// Sending stays opt-in (OUTBOUND_ENABLED) and rate-limited — drafting is always safe.
@Injectable()
export class OutreachService {
  private profile = loadProfile();
  constructor(private readonly prisma: PrismaService, private readonly llm: LlmService) {}

  async findForApplied(limit = 10) {
    const apps = await this.prisma.application.findMany({
      where: { status: 'APPLIED' },
      include: { job: true },
      take: limit,
    });
    let drafted = 0;
    for (const app of apps) {
      const platformCfg = this.profile.platforms[app.job.platform.toLowerCase()];
      if (!platformCfg?.outreach) continue;

      const res = await fetch(`${SCRAPER}/recruiters`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: app.job.platform, target: { jobId: app.jobId, url: app.job.url } }),
      }).then((r) => r.json()).catch(() => ({ leads: [] }));

      for (const lead of res.leads ?? []) {
        const recruiter = await this.prisma.recruiter.upsert({
          where: { profileUrl: lead.profileUrl ?? `${app.jobId}-${lead.name}` },
          create: { name: lead.name, title: lead.title, company: app.job.company, profileUrl: lead.profileUrl, source: app.job.platform as any },
          update: {},
        });
        const msg = await this.llm.call({
          purpose: 'recruiter_msg', prompt: 'recruiter-message', fast: true, json: true, jobId: app.jobId,
          vars: { recruiterName: lead.name, recruiterTitle: lead.role, company: app.job.company, title: app.job.title,
            leadStrength: 'React/Next.js performance', candidateSummary: this.profile.candidate.currentRole },
        });
        await this.prisma.outreach.create({
          data: { jobId: app.jobId, recruiterId: recruiter.id, role: lead.role, status: 'DRAFTED',
            message: JSON.stringify(msg.json ?? msg.text) },
        });
        drafted++;
      }
    }
    return { drafted };
  }
}
