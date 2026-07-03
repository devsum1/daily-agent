import { Client } from '@notionhq/client';

// Mirrors each tracked job into a Notion database (the spec's tracking fields).
export class Notion {
  private client = new Client({ auth: process.env.NOTION_API_KEY });
  private dbId = process.env.NOTION_JOBS_DB_ID ?? '';

  async upsertJob(row: {
    company: string; role: string; url: string; platform: string;
    appliedDate?: string; resumeVersion?: string; matchScore?: number;
    recruiter?: string; followUpDate?: string; status: string;
  }) {
    if (!this.dbId) return;
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
