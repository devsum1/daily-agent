// Local end-to-end demo: scrape → score (same engine as Apps Script) → digest.
// Usage: node run-local.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { scrapeLinkedIn } from './src/linkedin.js';
import { scrapeNaukri } from './src/naukri.js';
import { scrapeOthers } from './src/others.js';

// Load the Apps Script scoring engine verbatim (it's ES5-compatible JS).
const scoringSrc = readFileSync(new URL('../apps-script/Scoring.gs', import.meta.url), 'utf8');
const scoreJob = new Function(scoringSrc + '; return scoreJob;')();

const results = await Promise.allSettled([scrapeLinkedIn(), scrapeNaukri(), scrapeOthers()]);
const jobs = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

const scored = jobs.map((job) => ({ ...job, ...scoreJob(job) }))
  .sort((a, b) => b.score - a.score);

const high = scored.filter((j) => j.score >= 80);
const medium = scored.filter((j) => j.score >= 60 && j.score < 80);

console.log('\n════════ DAILY JOB OPPORTUNITIES (local run) ════════');
console.log(`Total jobs found : ${scored.length}`);
console.log(`High match (80+) : ${high.length}`);
console.log(`Medium (60–79)   : ${medium.length}`);
console.log('\nTop 10:');
for (const j of scored.slice(0, 10)) {
  console.log(`  [${String(j.score).padStart(3)}] ${j.priority.padEnd(6)} ${j.title} @ ${j.company} · ${j.location} (${j.source})`);
  console.log(`        ${j.url}`);
}

const outPath = new URL('../../data/jobs-latest.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(scored, null, 2));
console.log(`\nFull scored list: ${outPath} (${scored.length} jobs)`);
