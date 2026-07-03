import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { loadProfile, scoreJob, type JdDetail } from '@jsa/core';

const SCRAPER = process.env.SCRAPER_BASE ?? 'http://localhost:4002';

@Injectable()
export class MatchingService {
  private readonly log = new Logger(MatchingService.name);
  private readonly profile = loadProfile();

  constructor(private readonly prisma: PrismaService, private readonly llm: LlmService) {}

  /** Score every NEW job: extract JD → LLM parse → deterministic score → store. */
  async scorePending(limit = 50) {
    const jobs = await this.prisma.job.findMany({ where: { status: 'NEW' }, take: limit });
    let scored = 0;
    for (const job of jobs) {
      try {
        const jd = await this.extractAndParse(job);
        const result = scoreJob(jd, this.profile, {
          easyApply: job.easyApply,
          companyRating: job.companyRating ?? undefined,
        });

        await this.prisma.$transaction([
          this.prisma.job.update({
            where: { id: job.id },
            data: {
              description: jd.description?.slice(0, 20000),
              salaryMinLpa: jd.salaryMinLpa,
              salaryMaxLpa: jd.salaryMaxLpa,
              companyType: jd.companyType,
              remote: jd.remote ?? job.remote,
              status: result.passedGate ? 'SHORTLISTED' : 'SCORED',
            },
          }),
          this.prisma.jobScore.upsert({
            where: { jobId: job.id },
            create: { jobId: job.id, ...this.toRow(result) },
            update: this.toRow(result),
          }),
          this.prisma.event.create({
            data: { jobId: job.id, type: 'SCORED', actor: 'api', payload: { priority: result.priorityScore, passed: result.passedGate } },
          }),
        ]);
        scored++;
      } catch (e: any) {
        this.log.error(`score failed for ${job.id}: ${e.message}`);
      }
    }
    return { scored, candidates: jobs.length };
  }

  /** Pull JD via scraper, then have the (cheap) LLM extract structured skills/archetype. */
  private async extractAndParse(job: { platform: string; url: string; title: string; company: string; location: string; description: string | null }): Promise<JdDetail> {
    let description = job.description ?? '';
    if (!description) {
      const r = await fetch(`${SCRAPER}/extract-jd`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: job.platform, jobUrl: job.url }),
      }).then((x) => x.json()).catch(() => null);
      description = r?.jd?.description ?? '';
    }

    const { json } = await this.llm.call({
      purpose: 'jd_extract',
      prompt: 'jd-extraction',
      fast: true,
      json: true,
      vars: { title: job.title, company: job.company, location: job.location, jd: description.slice(0, 12000) },
    });

    return {
      description,
      requiredSkills: json?.requiredSkills ?? [],
      niceToHaveSkills: json?.niceToHaveSkills ?? [],
      minYears: json?.minYears ?? undefined,
      maxYears: json?.maxYears ?? undefined,
      salaryMinLpa: json?.salaryMinLpa ?? undefined,
      salaryMaxLpa: json?.salaryMaxLpa ?? undefined,
      archetype: json?.archetype ?? 'other',
      companyType: json?.companyType ?? undefined,
      remote: json?.remote ?? undefined,
    };
  }

  private toRow(r: ReturnType<typeof scoreJob>) {
    return {
      skillMatchPct: r.skillMatchPct,
      experienceMatchPct: r.experienceMatchPct,
      compFitPct: r.compFitPct,
      companyFitPct: r.companyFitPct,
      roleFitPct: r.roleFitPct,
      interviewProbability: r.interviewProbability,
      priorityScore: r.priorityScore,
      matchedSkills: r.matchedSkills,
      missingSkills: r.missingSkills,
      archetype: r.archetype,
      passedGate: r.passedGate,
      rationale: r.rationale,
    };
  }
}
