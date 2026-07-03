"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Telegram = void 0;
// Minimal Telegram Bot API client (sendMessage + inline approval buttons).
const API = (token) => `https://api.telegram.org/bot${token}`;
class Telegram {
    token;
    chatId;
    constructor(token = process.env.TELEGRAM_BOT_TOKEN ?? '', chatId = process.env.TELEGRAM_CHAT_ID ?? '') {
        this.token = token;
        this.chatId = chatId;
    }
    async send(text, opts = {}) {
        if (!this.token)
            return;
        await fetch(`${API(this.token)}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                chat_id: this.chatId,
                text,
                parse_mode: opts.markdown ? 'Markdown' : undefined,
                reply_markup: opts.buttons ? { inline_keyboard: opts.buttons } : undefined,
                disable_web_page_preview: true,
            }),
        }).catch(() => undefined);
    }
}
exports.Telegram = Telegram;
