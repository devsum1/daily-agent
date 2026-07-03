/**
 * One-time setup. Open the sheet → Extensions → Apps Script → paste all .gs
 * files → run setup() once (grant permissions) → Deploy as Web app.
 *
 * setup() is idempotent: safe to re-run after edits.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 Job Agent')
    .addItem('Run setup (first time)', 'setup')
    .addItem('Send daily report now', 'dailyReport')
    .addItem('Send weekly report now', 'weeklyReport')
    .addItem('Check follow-ups now', 'followUpCheck')
    .addItem('Rebuild dashboard', 'buildDashboard')
    .addItem('Show webhook secret', 'showSecret')
    .addToUi();
}

function setup() {
  createSheets();
  buildDashboard();
  installTriggers();
  ensureSecret();
  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n1. Deploy → New deployment → Web app (execute as Me, access: Anyone)\n' +
    '2. Copy the /exec URL into the GitHub secret SHEETS_WEBHOOK_URL\n' +
    '3. Job Agent menu → "Show webhook secret" → copy into GitHub secret WEBHOOK_SECRET');
}

function createSheets() {
  var ss = SpreadsheetApp.getActive();
  var defs = {};
  defs[SHEET_JOBS] = ['Job ID', 'Date', 'Company', 'Role', 'Location', 'Source',
    'Experience', 'Salary', 'Job URL', 'Status', 'Priority', 'Match Score', 'Matched Skills'];
  defs[SHEET_APPS] = ['Company', 'Role', 'Applied Date', 'Source', 'Application URL',
    'Resume Version', 'Status', 'Interview Stage', 'Notes'];
  defs[SHEET_RECRUITERS] = ['Name', 'Company', 'LinkedIn URL', 'Email', 'Contacted', 'Response'];

  for (var name in defs) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, defs[name].length).setValues([defs[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  // Data-validation dropdowns keep statuses consistent (formulas depend on them).
  var jobs = ss.getSheetByName(SHEET_JOBS);
  jobs.getRange('J2:J1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['New', 'Reviewed', 'Applied', 'Skipped'], true).build());
  var apps = ss.getSheetByName(SHEET_APPS);
  apps.getRange('G2:G1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Applied', 'Interviewing', 'Rejected', 'Offer', 'Withdrawn'], true).build());

  // Color-scale on Match Score so high matches pop.
  var scoreRange = jobs.getRange('L2:L1000');
  var rules = jobs.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#f4c7c3', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMidpointWithValue('#fce8b2', SpreadsheetApp.InterpolationType.NUMBER, '60')
    .setGradientMaxpointWithValue('#b7e1cd', SpreadsheetApp.InterpolationType.NUMBER, '100')
    .setRanges([scoreRange]).build());
  jobs.setConditionalFormatRules(rules);
}

function installTriggers() {
  // Clear this project's triggers, then re-create — idempotent.
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('parseJobAlerts').timeBased().atHour(7).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('dailyReport').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('followUpCheck').timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();
  ScriptApp.newTrigger('onEditHandler').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

function ensureSecret() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WEBHOOK_SECRET')) {
    props.setProperty('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, ''));
  }
}

function showSecret() {
  ensureSecret();
  SpreadsheetApp.getUi().alert('WEBHOOK_SECRET:\n\n' +
    PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET'));
}
