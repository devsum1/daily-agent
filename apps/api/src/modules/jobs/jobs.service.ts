import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { RawJobCard } from '@jsa/core';

@Injectable()
export class JobsService {
  private readonly log = new Logger(JobsService.name);
  constructor(private readonly prisma: PrismaService) {}

  private hash(c: RawJobCard) {
    const key = `${c.platform}|${c.company.toLowerCase().trim()}|${c.title.toLowerCase().trim()}|${c.location.toLowerCase().trim()}`;
    return createHash('sha256').update(key).digest('hex');
  }

  /** Idempotent upsert. Returns count of newly inserted jobs. */
  async ingest(cards: RawJobCard[]): Promise<{ inserted: number; seen: number }> {
    let inserted = 0;
    for (const c of cards) {
      const dedupeHash = this.hash(c);
      const existing = await this.prisma.job.findUnique({ where: { dedupeHash } });
      if (existing) continue;
      await this.prisma.job.create({
        data: {
          dedupeHash,
          platform: c.platform as any,
          externalId: c.externalId,
          title: c.title,
          company: c.company,
          location: c.location,
          remote: /remote/i.test(c.location),
          url: c.url,
          salaryText: c.salaryText,
          easyApply: !!c.easyApply,
          status: 'NEW',
          rawJson: c as any,
        },
      });
      await this.prisma.event.create({
        data: { type: 'DISCOVERED', actor: 'scraper', payload: { title: c.title, company: c.company, platform: c.platform } },
      });
      inserted++;
    }
    this.log.log(`ingest: ${inserted} new / ${cards.length} seen`);
    return { inserted, seen: cards.length };
  }
}
