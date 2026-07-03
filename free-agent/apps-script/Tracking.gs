/**
 * Application tracking + follow-up reminders.
 *
 * - Installable onEdit: when a Jobs_Master row's Status is set to "Applied",
 *   the job is copied into Applications with a timestamp.
 * - Daily followUpCheck (9 AM): applications 5+ days old with no progress get
 *   a reminder email, once, tracked in the Notes column.
 */

var FOLLOW_UP_DAYS = 5;

/** Installed by setup() as an installable trigger (simple triggers can't email). */
function onEditHandler(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_JOBS) return;
  if (range.getColumn() !== 10 || range.getNumRows() !== 1) return; // J = Status
  if (String(range.getValue()).trim().toLowerCase() !== 'applied') return;

  var row = sheet.getRange(range.getRow(), 1, 1, 13).getValues()[0];
  // Jobs_Master: [id, date, company, role, location, source, exp, salary, url, status, priority, score, matched]
  var apps = SpreadsheetApp.getActive().getSheetByName(SHEET_APPS);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Don't duplicate if this job was already logged.
  var existing = apps.getLastRow() > 1
    ? apps.getRange(2, 1, apps.getLastRow() - 1, 2).getValues() : [];
  var dup = existing.some(function (r) { return r[0] === row[2] && r[1] === row[3]; });
  if (dup) return;

  apps.appendRow([
    row[2],        // Company
    row[3],        // Role
    today,         // Applied Date
    row[5],        // Source
    row[8],        // Application URL
    'base',        // Resume Version
    'Applied',     // Status
    '',            // Interview Stage
    '',            // Notes
  ]);
}

/** Daily 9 AM. One email listing everything due for a follow-up today. */
function followUpCheck() {
  var apps = SpreadsheetApp.getActive().getSheetByName(SHEET_APPS);
  var lastRow = apps.getLastRow();
  if (lastRow < 2) return;

  var data = apps.getRange(2, 1, lastRow - 1, 9).getValues();
  var now = new Date();
  var due = [];

  data.forEach(function (r, i) {
    var appliedDate = new Date(r[2]);
    var status = String(r[6]).toLowerCase();
    var notes = String(r[8]);
    if (isNaN(appliedDate)) return;
    if (status !== 'applied') return;                    // progressed/closed → no nag
    if (notes.indexOf('[follow-up sent') !== -1) return; // already reminded
    var age = (now - appliedDate) / 86400000;
    if (age >= FOLLOW_UP_DAYS) due.push({ rowIndex: i + 2, company: r[0], role: r[1], applied: r[2], url: r[4] });
  });

  if (!due.length) return;

  var html = '<h3>⏰ Follow-ups due</h3><ul>' + due.map(function (d) {
    return '<li>Follow up with recruiter for <b>' + d.company + '</b> — ' + d.role +
           ' (applied ' + Utilities.formatDate(new Date(d.applied), Session.getScriptTimeZone(), 'dd MMM') + ')' +
           (d.url ? ' · <a href="' + d.url + '">posting</a>' : '') + '</li>';
  }).join('') + '</ul>';

  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    'Follow up: ' + due.length + ' application(s) need a nudge', '', { htmlBody: html });

  var stamp = '[follow-up sent ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd') + ']';
  due.forEach(function (d) {
    var cell = apps.getRange(d.rowIndex, 9);
    cell.setValue((cell.getValue() ? cell.getValue() + ' ' : '') + stamp);
  });
}
