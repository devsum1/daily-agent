import nodemailer from 'nodemailer';

// Gmail via App Password (not your real password). See docs/09-security-design.md.
export class Gmail {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  async send(opts: { to?: string; subject: string; html: string }) {
    if (!process.env.GMAIL_USER) return;
    await this.transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: opts.to ?? process.env.REPORT_TO_EMAIL ?? process.env.GMAIL_USER,
      subject: opts.subject,
      html: opts.html,
    });
  }
}
