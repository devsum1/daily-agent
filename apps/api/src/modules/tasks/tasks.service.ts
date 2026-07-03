import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApplicationsService } from '../applications/applications.service';
import { TrackingService } from '../tracking/tracking.service';
import { OutreachService } from '../outreach/outreach.service';

// Operational workers the API drives itself (n8n owns discovery + reports).
// Everything here is rate-limited / kill-switched downstream, so these are safe to run often.
@Injectable()
export class TasksService {
  private readonly log = new Logger(TasksService.name);
  constructor(
    private readonly apps: ApplicationsService,
    private readonly tracking: TrackingService,
    private readonly outreach: OutreachService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async applyQueueWorker() {
    if (process.env.OUTBOUND_ENABLED !== 'true') return;
    const r = await this.apps.runQueue();
    this.log.log(`apply-queue: ${JSON.stringify(r)}`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async mirror() {
    const r = await this.tracking.syncAll();
    this.log.log(`mirror: ${JSON.stringify(r)}`);
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async draftOutreach() {
    const r = await this.outreach.findForApplied();
    this.log.log(`outreach: ${JSON.stringify(r)}`);
  }
}
