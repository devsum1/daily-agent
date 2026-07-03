"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// Gmail via App Password (not your real password). See docs/09-security-design.md.
class Gmail {
    transporter = nodemailer_1.default.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    async send(opts) {
        if (!process.env.GMAIL_USER)
            return;
        await this.transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: opts.to ?? process.env.REPORT_TO_EMAIL ?? process.env.GMAIL_USER,
            subject: opts.subject,
            html: opts.html,
        });
    }
}
exports.Gmail = Gmail;
