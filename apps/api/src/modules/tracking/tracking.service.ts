import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Sheets, Notion } from '@jsa/integrations';

// Mirrors Postgres (source of truth) → Google Sheets + Notion. Non-fatal on failure;
// a re-sync can always rebuild the mirrors from Postgres.
@Injectable()
export class TrackingService {
  private readonly log = new Logger(TrackingService.name);
  private sheets = new Sheets();
  private notion = new Notion();

  constructor(private readonly prisma: PrismaService) {}

  /** Push every job that has an application but isn't yet mirrored. */
  async syncAll() {
    const jobs = await this.prisma.job.findMany({
      where: { application: { isNot: null } },
      include: { score: true, application: true, outreach: { include: { recruiter: true } } },
      orderBy: { discoveredAt: 'desc' },
      take: 200,
    });

    let synced = 0;
    for (const j of jobs) {
      const recruiter = j.outreach[0]?.recruiter?.name ?? '';
      const appliedDate = j.application?.appliedAt?.toISOString().slice(0, 10);
      const followUp = j.application?.followUpDate?.toISOString().slice(0, 10);
      const score = Math.round(j.score?.priorityScore ?? 0);
      const status = j.application?.status ?? 'NEW';

      await this.sheets.upsertRow([
        j.company, j.title, j.url, j.platform, appliedDate ?? '', j.application?.resumeVersion ?? '',
        score, recruiter, followUp ?? '', status,
      ]);
      await this.notion.upsertJob({
        company: j.company, role: j.title, url: j.url, platform: j.platform,
        appliedDate, resumeVersion: j.application?.resumeVersion ?? undefined,
        matchScore: score, recruiter, followUpDate: followUp, status,
      });
      synced++;
    }
    return { synced };
  }
}
