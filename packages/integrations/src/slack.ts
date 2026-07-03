export class Slack {
  constructor(private webhook = process.env.SLACK_WEBHOOK_URL ?? '') {}
  async send(text: string) {
    if (!this.webhook) return;
    await fetch(this.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => undefined);
  }
}
