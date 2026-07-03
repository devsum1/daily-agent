/**
 * Job-alert email ingestion — the reliable free channel for Naukri (whose
 * public API is captcha-gated for non-browser clients) and a bonus channel
 * for LinkedIn/Instahyre/Hirist.
 *
 * Prereq: create daily job alerts on each platform for your keywords
 * (Naukri → Job Alerts, LinkedIn → saved-search alerts, etc.). The alerts
 * land in this Gmail account; parseJobAlerts() runs daily at 07:30, extracts
 * jobs, and feeds them through the same dedupe + scoring pipeline.
 */

var ALERT_QUERY = 'newer_than:1d (from:naukri.com OR from:linkedin.com OR from:instahyre.com OR from:hirist.com OR from:hirist.tech)';

var LINK_PATTERNS = [
  { source: 'Naukri',    re: /<a[^>]+href="(https?:\/\/(?:www\.)?naukri\.com\/job-listings-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi },
  { source: 'LinkedIn',  re: /<a[^>]+href="(https?:\/\/(?:www\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi },
  { source: 'Instahyre', re: /<a[^>]+href="(https?:\/\/(?:www\.)?instahyre\.com\/job-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi },
  { source: 'Hirist',    re: /<a[^>]+href="(https?:\/\/(?:www\.)?hirist\.(?:com|tech)\/j\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi },
];

function parseJobAlerts() {
  var threads = GmailApp.search(ALERT_QUERY, 0, 50);
  var jobs = [];
  var seen = {};

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var html = msg.getBody();
      LINK_PATTERNS.forEach(function (p) {
        var m;
        while ((m = p.re.exec(html)) !== null) {
          var url = cleanUrl(m[1]);
          var title = stripTags(m[2]);
          if (!url || !title || title.length < 5 || seen[url]) continue;
          if (/view all|see more|unsubscribe|settings/i.test(title)) continue;
          seen[url] = true;
          jobs.push({
            source: p.source,
            title: title.slice(0, 120),
            company: guessCompany(html, m.index) || '(from alert)',
            location: '',
            url: url,
            experience: '',
            salary: '',
            description: title, // scoring works on title keywords for alerts
            postedAt: '',
          });
        }
      });
    });
  });

  if (jobs.length) {
    var res = ingestJobs(jobs);
    Logger.log('email ingest: %s inserted / %s parsed', res.inserted, jobs.length);
  } else {
    Logger.log('email ingest: no alert jobs found (query: %s)', ALERT_QUERY);
  }
}

/** Strip tracking params; keep the canonical job URL for dedupe. */
function cleanUrl(u) {
  u = u.replace(/&amp;/g, '&');
  var q = u.indexOf('?');
  return q === -1 ? u : u.slice(0, q);
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Look just after the link for a plausible company line (best-effort). */
function guessCompany(html, fromIndex) {
  var window = stripTags(html.slice(fromIndex, fromIndex + 600));
  // Alert layouts commonly render "Title Company Location…" — take the second
  // chunk of 2–5 capitalised words after the title text.
  var m = window.match(/^[^|•·\n]{5,120}?\s{1,}([A-Z][\w&.'-]+(?:\s+[A-Z&][\w&.'-]+){0,4})\b/);
  return m ? m[1].trim().slice(0, 60) : '';
}
