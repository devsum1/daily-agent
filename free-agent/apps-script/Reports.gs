/**
 * Email reports (Gmail, free, sent as you).
 * - dailyReport(): every morning after the scrape — new jobs, top 10, status.
 * - weeklyReport(): Sunday evening — funnel, top companies, top JD skills.
 */

function dailyReport() {
  var ss = SpreadsheetApp.getActive();
  var jobs = sheetRows(ss, SHEET_JOBS);
  var apps = sheetRows(ss, SHEET_APPS);

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var todays = jobs.filter(function (r) { return dateStr(r[1]) === today; });
  var high = todays.filter(function (r) { return r[11] >= 80; });
  var medium = todays.filter(function (r) { return r[11] >= 60 && r[11] < 80; });

  var top10 = todays.slice().sort(function (a, b) { return b[11] - a[11]; }).slice(0, 10);
  var topTable = htmlTable(
    ['Score', 'Company', 'Role', 'Location', 'Source', 'Link'],
    top10.map(function (r) {
      return [badge(r[11]), r[2], r[3], r[4], r[5], '<a href="' + r[8] + '">open</a>'];
    })
  );

  var statusCounts = countBy(apps, 6); // Applications → Status
  var statusLine = Object.keys(statusCounts).map(function (k) { return k + ': ' + statusCounts[k]; }).join(' · ') || 'none yet';

  var pendingFollowUps = apps.filter(function (r) {
    var applied = new Date(r[2]);
    return String(r[6]).toLowerCase() === 'applied' && !isNaN(applied) &&
      (new Date() - applied) / 86400000 >= FOLLOW_UP_DAYS &&
      String(r[8]).indexOf('[follow-up sent') === -1;
  });

  var html =
    '<h2>Daily Job Opportunities — ' + today + '</h2>' +
    '<p><b>' + todays.length + '</b> new jobs · <b style="color:#188038">' + high.length + ' high match</b> · ' +
    medium.length + ' medium</p>' +
    '<h3>Top 10 today</h3>' + (top10.length ? topTable : '<p>No new jobs today.</p>') +
    '<h3>Application status</h3><p>' + statusLine + '</p>' +
    '<h3>Follow-ups pending</h3><p>' + (pendingFollowUps.length ?
      pendingFollowUps.map(function (r) { return r[0] + ' — ' + r[1]; }).join('<br>') : 'none') + '</p>' +
    '<p style="color:#888">Sheet: <a href="' + ss.getUrl() + '">open tracker</a></p>';

  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Daily Job Opportunities', '', { htmlBody: html });
}

function weeklyReport() {
  var ss = SpreadsheetApp.getActive();
  var jobs = sheetRows(ss, SHEET_JOBS);
  var apps = sheetRows(ss, SHEET_APPS);

  var weekAgo = new Date(Date.now() - 7 * 86400000);
  var jobsWk = jobs.filter(function (r) { return new Date(r[1]) >= weekAgo; });
  var appsWk = apps.filter(function (r) { return new Date(r[2]) >= weekAgo; });

  var interviews = apps.filter(function (r) { return String(r[7]).trim() !== ''; });
  var responded = apps.filter(function (r) {
    return ['interviewing', 'offer', 'rejected'].indexOf(String(r[6]).toLowerCase()) !== -1 || String(r[7]).trim() !== '';
  });
  var responseRate = apps.length ? Math.round(100 * responded.length / apps.length) : 0;

  var topCompanies = topN(countBy(jobsWk, 2), 10);
  var skillFreq = {};
  jobsWk.forEach(function (r) {
    String(r[12] || '').split(',').forEach(function (s) {
      s = s.trim(); if (s) skillFreq[s] = (skillFreq[s] || 0) + 1;
    });
  });
  var topSkills = topN(skillFreq, 10);

  var html =
    '<h2>Weekly Job Search Analytics</h2>' +
    htmlTable(['Metric', 'Value'], [
      ['Jobs found (7d)', jobsWk.length],
      ['High match (80+)', jobsWk.filter(function (r) { return r[11] >= 80; }).length],
      ['Applications (7d)', appsWk.length],
      ['Response rate (all-time)', responseRate + '%'],
      ['Interviews scheduled', interviews.length],
    ]) +
    '<h3>Top hiring companies this week</h3>' + listHtml(topCompanies) +
    '<h3>Skills appearing most in matched JDs</h3>' + listHtml(topSkills) +
    '<p style="color:#888">Sheet: <a href="' + ss.getUrl() + '">open tracker</a></p>';

  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Weekly Job Search Analytics', '', { htmlBody: html });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sheetRows(ss, name) {
  var sh = ss.getSheetByName(name);
  var lastRow = sh.getLastRow();
  return lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues() : [];
}

function dateStr(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

function countBy(rows, col) {
  var out = {};
  rows.forEach(function (r) {
    var k = String(r[col] || '').trim();
    if (k) out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function topN(counts, n) {
  return Object.keys(counts)
    .sort(function (a, b) { return counts[b] - counts[a]; })
    .slice(0, n)
    .map(function (k) { return k + ' (' + counts[k] + ')'; });
}

function listHtml(items) {
  return items.length ? '<ul><li>' + items.join('</li><li>') + '</li></ul>' : '<p>none</p>';
}

function badge(score) {
  var color = score >= 80 ? '#188038' : score >= 60 ? '#f9ab00' : '#d93025';
  return '<b style="color:' + color + '">' + score + '</b>';
}

function htmlTable(headers, rows) {
  var th = headers.map(function (h) { return '<th style="text-align:left;padding:4px 10px;border-bottom:2px solid #ddd">' + h + '</th>'; }).join('');
  var trs = rows.map(function (r) {
    return '<tr>' + r.map(function (c) { return '<td style="padding:4px 10px;border-bottom:1px solid #eee">' + c + '</td>'; }).join('') + '</tr>';
  }).join('');
  return '<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><tr>' + th + '</tr>' + trs + '</table>';
}
