"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sheets = void 0;
const googleapis_1 = require("googleapis");
const node_fs_1 = require("node:fs");
// Mirrors the tracker (one row per job) to a Google Sheet via a service account.
class Sheets {
    sheets;
    sheetId = process.env.GSHEET_TRACKER_ID ?? '';
    constructor() {
        const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? './secrets/google-service-account.json';
        let credentials;
        try {
            credentials = JSON.parse((0, node_fs_1.readFileSync)(keyFile, 'utf-8'));
        }
        catch {
            credentials = undefined;
        }
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = googleapis_1.google.sheets({ version: 'v4', auth });
    }
    /** Append (or you can switch to update-by-key) a tracker row. */
    async upsertRow(row) {
        if (!this.sheetId)
            return;
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
exports.Sheets = Sheets;
