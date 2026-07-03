/**
 * Resume ↔ JD matching without any paid API: weighted keyword scoring.
 *
 * Score /100 =
 *   up to 60  — matched core-skill weights × 2.2, capped (React/Next/TS/JS…)
 *   up to 25  — matched secondary-skill weights × 0.9, capped (Java/AWS/DB…)
 *   up to 15  — boosts: target role title, target company, experience band fit
 *   penalty   — JD wants ≥8 yrs minimum or is a junior (≤2 yrs) role
 *
 * Capped sums (not strict coverage) so a JD naming 3–4 of your strongest
 * skills scores High even if it doesn't list your whole stack — important
 * for short JDs and title-only email alerts.
 *
 * High = 80+, Medium = 60–79, Low = <60 (written to the Priority column).
 */

// Candidate profile: skill → weight. Aliases let JD spellings match.
var CORE_SKILLS = {
  'react':            { w: 10, aliases: ['react.js', 'reactjs', 'react js'] },
  'next.js':          { w: 10, aliases: ['nextjs', 'next js'] },
  'typescript':       { w: 9,  aliases: ['ts'] },
  'javascript':       { w: 7,  aliases: ['js', 'es6', 'ecmascript'] },
  'frontend performance': { w: 7, aliases: ['web performance', 'core web vitals', 'lighthouse', 'page speed', 'lcp', 'web vitals'] },
};

var SECONDARY_SKILLS = {
  'java':          { w: 8, aliases: ['java 17', 'java 11', 'java 8'] },
  'spring boot':   { w: 8, aliases: ['springboot', 'spring-boot', 'spring'] },
  'node.js':       { w: 8, aliases: ['nodejs', 'node js', 'node'] },
  'system design': { w: 8, aliases: ['scalable architecture', 'distributed systems', 'hld', 'lld'] },
  'aws':           { w: 7, aliases: ['amazon web services', 'ec2', 's3', 'cloud'] },
  'postgresql':    { w: 6, aliases: ['postgres'] },
  'nestjs':        { w: 6, aliases: ['nest.js', 'nest js'] },
  'seo':           { w: 6, aliases: ['search engine optimization', 'search engine optimisation'] },
  'mysql':         { w: 5, aliases: [] },
  'redis':         { w: 5, aliases: [] },
};

var TARGET_ROLES = [
  'senior frontend engineer', 'frontend engineer ii', 'software engineer ii',
  'fullstack engineer', 'full stack engineer', 'senior software engineer', 'sde 2', 'sde-2', 'sde ii',
  'react developer', 'frontend developer', 'next.js developer',
];

var TARGET_COMPANIES = [
  'atlassian', 'razorpay', 'phonepe', 'flipkart', 'swiggy', 'zomato',
  'meesho', 'uber', 'google', 'microsoft', 'adobe',
];

var CANDIDATE_YEARS = 5;

/**
 * @param {Object} job {title, company, description, experience}
 * @returns {Object} {score, priority, matched}  score 0–100
 */
function scoreJob(job) {
  var text = [job.title, job.description, job.experience].join(' ').toLowerCase();
  var matched = [];

  function matchedWeight(skillMap) {
    var gained = 0;
    for (var skill in skillMap) {
      var entry = skillMap[skill];
      var terms = [skill].concat(entry.aliases);
      var hit = terms.some(function (t) {
        // word-boundary-ish match; escape regex specials in the term
        var esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])', 'i').test(text);
      });
      if (hit) { gained += entry.w; matched.push(skill); }
    }
    return gained;
  }

  var score = Math.min(60, matchedWeight(CORE_SKILLS) * 2.2)
            + Math.min(25, matchedWeight(SECONDARY_SKILLS) * 0.9);

  var titleLc = (job.title || '').toLowerCase();
  if (TARGET_ROLES.some(function (r) { return titleLc.indexOf(r) !== -1; })) score += 7;
  if (TARGET_COMPANIES.some(function (c) { return (job.company || '').toLowerCase().indexOf(c) !== -1; })) score += 5;

  score += experienceFit(text, job.experience || '');

  score = Math.max(0, Math.min(100, Math.round(score)));
  var priority = score >= 80 ? 'High' : score >= 60 ? 'Medium' : 'Low';
  return { score: score, priority: priority, matched: matched };
}

/** +3 if the JD's years band fits the candidate; −15 if clearly out of band. */
function experienceFit(text, expLabel) {
  var m = (expLabel + ' ' + text).match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+)?\s*(?:years|yrs)/i)
       || (expLabel + ' ' + text).match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  if (!m) return 0; // unspecified → neutral
  var lo = parseInt(m[1], 10);
  var hi = m[2] ? parseInt(m[2], 10) : lo + 3;
  if (CANDIDATE_YEARS >= lo && CANDIDATE_YEARS <= hi) return 3;
  if (lo >= 8 || hi <= 2) return -15; // too senior or clearly junior
  return -5;
}
