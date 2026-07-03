"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Slack = void 0;
class Slack {
    webhook;
    constructor(webhook = process.env.SLACK_WEBHOOK_URL ?? '') {
        this.webhook = webhook;
    }
    async send(text) {
        if (!this.webhook)
            return;
        await fetch(this.webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
        }).catch(() => undefined);
    }
}
exports.Slack = Slack;
