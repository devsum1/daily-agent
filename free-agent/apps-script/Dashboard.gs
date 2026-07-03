/**
 * Dashboard tab: live formulas + two charts. Rebuilt idempotently by setup().
 */

function buildDashboard() {
  var ss = SpreadsheetApp.getActive();
  var dash = ss.getSheetByName(SHEET_DASHBOARD) || ss.insertSheet(SHEET_DASHBOARD);
  dash.clear();
  dash.getCharts().forEach(function (c) { dash.removeChart(c); });

  var rows = [
    ['Metric', 'Value'],
    ['Total Jobs Found',       '=COUNTA(Jobs_Master!A2:A)'],
    ['High Match (80+)',       '=COUNTIF(Jobs_Master!L2:L,">=80")'],
    ['Medium Match (60–79)',   '=COUNTIFS(Jobs_Master!L2:L,">=60",Jobs_Master!L2:L,"<80")'],
    ['Applied',                '=COUNTA(Applications!A2:A)'],
    ['Interviewing',           '=COUNTIF(Applications!G2:G,"Interviewing")+COUNTIF(Applications!H2:H,"<>")'],
    ['Rejected',               '=COUNTIF(Applications!G2:G,"Rejected")'],
    ['Offers',                 '=COUNTIF(Applications!G2:G,"Offer")'],
    ['Application Conversion Rate', '=IF(COUNTA(Jobs_Master!A2:A)=0,0,ROUND(COUNTA(Applications!A2:A)/COUNTA(Jobs_Master!A2:A)*100,1))&"%"'],
    ['Recruiters Contacted',   '=COUNTIF(Recruiters!E2:E,"Yes")'],
    ['Recruiter Responses',    '=COUNTIF(Recruiters!F2:F,"<>")-COUNTIF(Recruiters!F2:F,"")' ],
  ];
  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  dash.getRange(1, 1, 1, 2).setFontWeight('bold');
  dash.autoResizeColumns(1, 2);

  // Helper series for charts.
  dash.getRange('D1:E1').setValues([['Status', 'Count']]).setFontWeight('bold');
  dash.getRange('D2:E5').setValues([
    ['Applied',      '=COUNTIF(Applications!G2:G,"Applied")'],
    ['Interviewing', '=COUNTIF(Applications!G2:G,"Interviewing")'],
    ['Rejected',     '=COUNTIF(Applications!G2:G,"Rejected")'],
    ['Offer',        '=COUNTIF(Applications!G2:G,"Offer")'],
  ]);
  dash.getRange('G1:H1').setValues([['Source', 'Jobs']]).setFontWeight('bold');
  dash.getRange('G2:H6').setValues([
    ['LinkedIn',  '=COUNTIF(Jobs_Master!F2:F,"LinkedIn")'],
    ['Naukri',    '=COUNTIF(Jobs_Master!F2:F,"Naukri")'],
    ['Wellfound', '=COUNTIF(Jobs_Master!F2:F,"Wellfound")'],
    ['Instahyre', '=COUNTIF(Jobs_Master!F2:F,"Instahyre")'],
    ['Hirist',    '=COUNTIF(Jobs_Master!F2:F,"Hirist")'],
  ]);

  dash.insertChart(dash.newChart()
    .asPieChart()
    .addRange(dash.getRange('D1:E5'))
    .setOption('title', 'Application Funnel')
    .setPosition(13, 1, 0, 0)
    .build());

  dash.insertChart(dash.newChart()
    .asColumnChart()
    .addRange(dash.getRange('G1:H6'))
    .setOption('title', 'Jobs by Source')
    .setPosition(13, 5, 0, 0)
    .build());
}
