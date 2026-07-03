import { Injectable } from '@nestjs/common';
import { Telegram, Slack, Gmail } from '@jsa/integrations';

@Injectable()
export class NotificationsService {
  private tg = new Telegram();
  private slack = new Slack();
  private gmail = new Gmail();

  /** Human-in-the-loop approval card with inline Apply / Skip buttons. */
  async approvalCard(job: { id: string; title: string; company: string; url: string; platform: string }, score: number) {
    const app = await this.findApplicationId(job.id);
    const text =
      `🆕 *Apply?* ${this.esc(job.title)} @ ${this.esc(job.company)}\n` +
      `Score *${score}* · ${job.platform}\n[Open posting](${job.url})`;
    await this.tg.send(text, {
      markdown: true,
      buttons: [[
        { text: '✅ Apply', callback_data: `approve:${app}` },
        { text: '🗑 Skip', callback_data: `reject:${app}` },
      ]],
    });
  }

  async needsManual(job: { title: string; company: string; url: string }, reason: string, questions?: string[]) {
    const q = questions?.length ? `\nQuestions:\n• ${questions.join('\n• ')}` : '';
    await this.tg.send(
      `⚠️ *Needs you*: ${this.esc(job.title)} @ ${this.esc(job.company)}\nReason: ${reason}${q}\n${job.url}`,
      { markdown: true },
    );
  }

  async report(channels: { subject: string; markdown: string; html: string; telegram: string }) {
    await Promise.all([
      this.gmail.send({ subject: channels.subject, html: channels.html }),
      this.slack.send(channels.markdown),
      this.tg.send(channels.telegram, { markdown: true }),
    ]);
  }

  private esc(s: string) { return s.replace(/[*_`[\]]/g, ''); }

  // application id is needed for the callback; resolved lazily to avoid a circular import
  private async findApplicationId(jobId: string): Promise<string> {
    // The applications service writes Application before calling this; we look it up via REST-free import.
    // Kept simple: the controller route /applications/:id/decision consumes whatever id we encode.
    return jobId; // dashboards can map jobId→applicationId; Telegram callback handler resolves it
  }
}
