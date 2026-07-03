"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notion = void 0;
const client_1 = require("@notionhq/client");
// Mirrors each tracked job into a Notion database (the spec's tracking fields).
class Notion {
    client = new client_1.Client({ auth: process.env.NOTION_API_KEY });
    dbId = process.env.NOTION_JOBS_DB_ID ?? '';
    async upsertJob(row) {
        if (!this.dbId)
            return;
        await this.client.pages.create({
            parent: { database_id: this.dbId },
            properties: {
                Company: { title: [{ text: { content: row.company } }] },
                Role: { rich_text: [{ text: { content: row.role } }] },
                'Job URL': { url: row.url },
                Platform: { select: { name: row.platform } },
                'Match Score': { number: row.matchScore ?? 0 },
                Status: { select: { name: row.status } },
                ...(row.recruiter ? { Recruiter: { rich_text: [{ text: { content: row.recruiter } }] } } : {}),
                ...(row.appliedDate ? { 'Applied Date': { date: { start: row.appliedDate } } } : {}),
                ...(row.followUpDate ? { 'Follow-up Date': { date: { start: row.followUpDate } } } : {}),
            },
        }).catch(() => undefined);
    }
}
exports.Notion = Notion;
