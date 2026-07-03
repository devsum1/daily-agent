/**
 * Webhook + ingestion. The GitHub Actions scraper POSTs a batch of job cards
 * here; we authenticate, dedupe against Jobs_Master, score, and append.
 *
 * Deploy: Deploy → New deployment → Web app → execute as Me, access: Anyone.
 * The shared secret (Script Property WEBHOOK_SECRET, set by setup()) is what
 * actually gates writes.
 */

var SHEET_JOBS = 'Jobs_Master';
var SHEET_APPS = 'Applications';
var SHEET_RECRUITERS = 'Recruiters';
var SHEET_DASHBOARD = 'Dashboard';

function doPost(e) {
  var out = { ok: false, inserted: 0, seen: 0 };
  try {
    var payload = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!secret || payload.secret !== secret) {
      out.error = 'unauthorized';
      return jsonOut(out, 401);
    }
    var res = ingestJobs(payload.jobs || []);
    out.ok = true; out.inserted = res.inserted; out.seen = res.seen;
  } catch (err) {
    out.error = String(err);
  }
  return jsonOut(out);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Dedupe by hash(company|title|location|source), score, append to Jobs_Master. */
function ingestJobs(jobs) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_JOBS);
  var lastRow = sheet.getLastRow();
  var existing = {};
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r) { existing[r[0]] = true; });
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var rows = [];
  jobs.forEach(function (job) {
    if (!job.title || !job.company || !job.url) return;
    var id = jobId(job);
    if (existing[id]) return;
    existing[id] = true;
    var s = scoreJob(job);
    rows.push([
      id, today, job.company, job.title, job.location || '', job.source || '',
      job.experience || '', job.salary || '', job.url, 'New', s.priority, s.score,
      s.matched.join(', '),
    ]);
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    sortJobsByScore(sheet);
  }
  return { inserted: rows.length, seen: jobs.length };
}

function jobId(job) {
  var key = [(job.company || ''), (job.title || ''), (job.location || ''), (job.source || '')]
    .join('|').toLowerCase().replace(/\s+/g, ' ');
  // djb2 hash → base36; stable and short
  var h = 5381;
  for (var i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return 'J' + (h >>> 0).toString(36).toUpperCase();
}

function sortJobsByScore(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .sort([{ column: 2, ascending: false }, { column: 12, ascending: false }]);
  }
}
