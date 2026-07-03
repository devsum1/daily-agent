import { google } from 'googleapis';
import { readFileSync } from 'node:fs';

// Mirrors the tracker (one row per job) to a Google Sheet via a service account.
export class Sheets {
  private sheets;
  private sheetId = process.env.GSHEET_TRACKER_ID ?? '';

  constructor() {
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? './secrets/google-service-account.json';
    let credentials: any;
    try { credentials = JSON.parse(readFileSync(keyFile, 'utf-8')); } catch { credentials = undefined; }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /** Append (or you can switch to update-by-key) a tracker row. */
  async upsertRow(row: (string | number)[]) {
    if (!this.sheetId) return;
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: 'Tracker!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    }).catch(() => undefined);
  }

  static header() {
    return ['Company', 'Role', 'Job URL', 'Platform', 'Applied Date', 'Resume Version', 'Match Score', 'Recruiter', 'Follow-up Date', 'Status'];
  }
}
