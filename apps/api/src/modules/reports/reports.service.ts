import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly notify: NotificationsService,
  ) {}

  /** Build the 8 AM digest. Returns channel-ready payloads. */
  async daily() {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const today = since.toISOString().slice(0, 10);

    const [appliedToday, discoveredToday, shortlisted, recruiters, followUps] = await Promise.all([
      this.prisma.application.findMany({ where: { appliedAt: { gte: since } }, include: { job: true } }),
      this.prisma.job.findMany({ where: { discoveredAt: { gte: since } }, include: { score: true } }),
      this.prisma.job.findMany({ where: { status: 'SHORTLISTED' }, include: { score: true }, orderBy: { score: { priorityScore: 'desc' } }, take: 10 }),
      this.prisma.outreach.findMany({ where: { sentAt: { gte: since } }, include: { recruiter: true, job: true } }),
      this.prisma.application.findMany({ where: { followUpDate: { lte: new Date() }, status: { in: ['APPLIED', 'RECRUITER_CONTACTED'] } }, include: { job: true }, take: 10 }),
    ]);

    const top5 = [...shortlisted].slice(0, 5).map((j) => ({
      role: j.title, company: j.company, score: Math.round(j.score?.priorityScore ?? 0), platform: j.platform,
      reason: j.score?.rationale ?? '',
    }));

    const metrics = {
      date: today,
      applicationsSubmitted: appliedToday.length,
      companiesApplied: [...new Set(appliedToday.map((a) => a.job.company))],
      highPriority: shortlisted.filter((j) => (j.score?.priorityScore ?? 0) >= 85).map((j) => `${j.title} @ ${j.company} (${Math.round(j.score!.priorityScore)})`),
      recruitersContacted: recruiters.map((r) => `${r.recruiter.name} — ${r.job?.company ?? ''}`),
      newJobs: discoveredToday.map((j) => `${j.title} @ ${j.company} [${j.platform}]`),
      interviewRanking: shortlisted.map((j) => `${j.title} @ ${j.company} — ${Math.round(j.score?.interviewProbability ?? 0)}% · ${j.platform}`),
      followUps: followUps.map((a) => `${a.job.title} @ ${a.job.company}`),
      referralOpportunities: shortlisted.filter((j) => ['product', 'saas', 'fintech', 'ai'].includes(j.companyType ?? '')).map((j) => j.company),
      top5,
    };

    // Let the cheap model render the markdown exactly per the spec's section order.
    const { text: markdown } = await this.llm.call({
      purpose: 'report', prompt: 'report-generation', fast: true,
      vars: { date: today, metricsJson: JSON.stringify(metrics, null, 2) },
      maxTokens: 2000,
    });

    return {
      subject: `Job Search Summary — ${today} (${metrics.applicationsSubmitted} applied)`,
      markdown,
      html: `<pre style="font-family:ui-monospace,monospace">${this.escapeHtml(markdown)}</pre>`,
      telegram: markdown.slice(0, 3800),
      sections: metrics,
    };
  }

  /** Sunday weekly analytics. */
  async weekly() {
    const since = new Date(Date.now() - 7 * 864e5);
    const [apps, outreach, interviews, cost] = await Promise.all([
      this.prisma.application.findMany({ where: { createdAt: { gte: since } }, include: { job: true } }),
      this.prisma.outreach.findMany({ where: { createdAt: { gte: since } } }),
      this.prisma.application.count({ where: { status: 'INTERVIEW_SCHEDULED', updatedAt: { gte: since } } }),
      this.prisma.llmUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: since } } }),
    ]);

    const applied = apps.filter((a) => a.appliedAt);
    const replies = outreach.filter((o) => o.repliedAt).length;
    const byPlatform = this.countBy(applied.map((a) => a.job.platform));
    const conversion = applied.length ? Math.round((interviews / applied.length) * 100) : 0;

    const md =
      `# Weekly Analytics — ${new Date().toISOString().slice(0, 10)}\n\n` +
      `- **Applications Sent:** ${applied.length}\n` +
      `- **Recruiter Replies:** ${replies}\n` +
      `- **Interviews Scheduled:** ${interviews}\n` +
      `- **Conversion Rate:** ${conversion}%\n` +
      `- **Top Platforms:** ${Object.entries(byPlatform).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(', ') || '—'}\n` +
      `- **LLM Spend:** $${(cost._sum.costUsd ?? 0).toFixed(2)}\n\n` +
      `## Recommendations\n` +
      this.recommend(applied.length, interviews, replies, byPlatform);

    return {
      subject: `Weekly Job Search Analytics — ${applied.length} applied, ${interviews} interviews`,
      markdown: md,
      html: `<pre style="font-family:ui-monospace,monospace">${this.escapeHtml(md)}</pre>`,
      telegram: md.slice(0, 3800),
    };
  }

  private recommend(applied: number, interviews: number, replies: number, byPlatform: Record<string, number>) {
    const tips: string[] = [];
    if (applied < 10) tips.push('- Volume is low — widen keywords or locations, or raise per-platform page count.');
    if (applied > 0 && interviews / applied < 0.1) tips.push('- Low interview rate — tighten the skill gate or improve resume tailoring.');
    if (replies === 0) tips.push('- No recruiter replies — enable opt-in outreach and personalize connection notes more.');
    const best = Object.entries(byPlatform).sort((a, b) => b[1] - a[1])[0];
    if (best) tips.push(`- ${best[0]} is your highest-volume source — consider focusing effort there.`);
    return tips.join('\n') || '- Healthy week. Keep the cadence.';
  }

  private countBy(arr: string[]) { return arr.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {}); }
  private escapeHtml(s: string) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)); }
}
