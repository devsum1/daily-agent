// Minimal Telegram Bot API client (sendMessage + inline approval buttons).
const API = (token: string) => `https://api.telegram.org/bot${token}`;

export class Telegram {
  constructor(
    private token = process.env.TELEGRAM_BOT_TOKEN ?? '',
    private chatId = process.env.TELEGRAM_CHAT_ID ?? '',
  ) {}

  async send(text: string, opts: { markdown?: boolean; buttons?: { text: string; callback_data: string }[][] } = {}) {
    if (!this.token) return;
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
