/**
 * generate-outreach.mjs
 * Reads free-agent/data/jobs-latest.json, picks High + Medium matches,
 * dedupes by company, and writes free-agent/data/outreach-today.html —
 * a self-contained page with LinkedIn people-search links and a
 * ready-to-paste console auto-connect script for each job.
 *
 * Usage:  node generate-outreach.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN      = path.join(ROOT, 'data', 'jobs-latest.json');
const OUT     = path.join(ROOT, 'data', 'outreach-today.html');

// ── Load & filter ──────────────────────────────────────────────────────────
let jobs;
try {
  jobs = JSON.parse(readFileSync(IN, 'utf8'));
} catch {
  console.error(`Cannot read ${IN}. Run "node run-local.mjs" first.`);
  process.exit(1);
}

const targets = jobs.filter(j => j.score >= 60).slice(0, 30); // High + Medium, cap 30

// ── Build the auto-connect script with a fixed JOB_LINK ───────────────────
function consoleScript(job) {
  const note = `Hi, I saw this Software Developer opening:
${job.url}
Could you please consider referring me if my profile matches?
Portfolio: devsum1-portfolio.netlify.app
Thanks!`;

  // Escape backticks/backslashes inside the note for embedding in a template literal
  const safeNote = note.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `/* Auto-connect script — ${job.company} | ${job.title} */
const NOTE = \`${safeNote}\`;
const DELAY_MS = 2000;
const MODAL_WAIT_MS = 4000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getShadow(){const h=document.getElementById('interop-outlet');return h&&h.shadowRoot?h.shadowRoot:document;}
function deepQuery(s){let e=null;try{e=document.querySelector(s);}catch(_){}if(e)return e;const sr=getShadow();if(sr!==document)try{e=sr.querySelector(s);}catch(_){}return e;}
function deepQueryAll(s,r){const sc=r||getShadow();try{return[...sc.querySelectorAll(s)];}catch(_){return[];}}
function waitForAny(sels,timeout=10000){return new Promise((res,rej)=>{const start=Date.now();const poll=()=>{for(const s of sels){const e=deepQuery(s);if(e)return res({el:e,sel:s});}if(Date.now()-start>=timeout)return rej(new Error('Timeout: '+sels.join('|')));setTimeout(poll,250);};poll();});}
function getModal(){const sr=getShadow();return sr.querySelector('div.send-invite,div[data-test-modal],div.artdeco-modal--layer-default,div.artdeco-modal');}
function setReactTextarea(t,v){const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;setter.call(t,v);t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));}
function closeModal(){const d=deepQuery('button.artdeco-modal__dismiss,button[data-test-modal-close-btn]');if(d){d.click();}}
async function sendWithNote(){try{await waitForAny(['div.send-invite','div[data-test-modal]','div.artdeco-modal__actionbar','div.artdeco-modal'],MODAL_WAIT_MS);await sleep(600);const modal=getModal();if(!modal){console.error('❌ Modal not found');return false;}const bar=modal.querySelector('.artdeco-modal__actionbar')||modal;const addNote=bar.querySelector('button[aria-label="Add a note"]')||bar.querySelector('button.artdeco-button--secondary');if(addNote){addNote.click();await sleep(700);}const ta=await waitForAny(['textarea#custom-message','textarea[name="message"]','div.send-invite textarea','div.artdeco-modal textarea'],8000).then(r=>r.el);setReactTextarea(ta,NOTE);console.log('✅ Note typed ('+NOTE.length+' chars)');await sleep(600);const lm=getModal()||modal;const lb=lm.querySelector('.artdeco-modal__actionbar')||lm;const send=lb.querySelector('button[aria-label="Send invitation"],button[aria-label="Send now"]')||lb.querySelector('button.artdeco-button--primary');if(!send){console.error('❌ Send button not found');closeModal();return false;}if(send.disabled){console.warn('⚠️ Send disabled — note too long ('+NOTE.length+' chars)');closeModal();return false;}send.click();console.log('✅ Sent!');await sleep(1500);return true;}catch(err){console.error('❌',err.message);closeModal();await sleep(1000);return false;}}
async function run(){const SEL='a[aria-label*="to connect"],button[aria-label*="to connect"],a[aria-label*="Invite"][aria-label*="connect"],button[aria-label*="Invite"][aria-label*="connect"]';let els=[...document.querySelectorAll(SEL),...deepQueryAll(SEL)];if(!els.length){const all=[...document.querySelectorAll('a,button'),...deepQueryAll('a,button')];els=all.filter(e=>e.innerText.trim()==='Connect');}els=[...new Set(els)];if(!els.length){console.warn('❌ No Connect elements. Are you on a LinkedIn people-search page?');return;}console.log('Found '+els.length+' Connect buttons\\n');let sent=0,failed=0;for(let i=0;i<els.length;i++){const el=els[i];const name=(el.getAttribute('aria-label')||'').replace('Invite ','').replace(' to connect','')||'Person '+(i+1);console.log('--- ['+(i+1)+'/'+els.length+'] '+name+' ---');el.scrollIntoView({behavior:'smooth',block:'center'});await sleep(500);el.click();console.log('✅ Clicked Connect');await sleep(500);const ok=await sendWithNote();ok?sent++:failed++;if(i<els.length-1){console.log('⏳ Waiting...');await sleep(DELAY_MS);}}console.log('\\n🎉 Done! Sent: '+sent+' | Failed: '+failed);}
run();`;
}

// ── LinkedIn people-search URL ─────────────────────────────────────────────
function liSearchUrl(company) {
  const q = encodeURIComponent(`"${company}"`);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&origin=GLOBAL_SEARCH_HEADER`;
}

// ── HTML generation ────────────────────────────────────────────────────────
const today = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });

const rows = targets.map((j, i) => {
  const badgeColor = j.score >= 80 ? '#0d7c3e' : '#9c6200';
  const badge = `<span style="background:${badgeColor};color:#fff;padding:2px 7px;border-radius:10px;font-size:12px">${j.priority} ${j.score}</span>`;
  const scriptId = `script_${i}`;
  const scriptContent = consoleScript(j).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
  <tr>
    <td>${badge}</td>
    <td><strong>${j.company}</strong></td>
    <td><a href="${j.url}" target="_blank" style="color:#0a66c2">${j.title}</a></td>
    <td>${j.location || '—'}</td>
    <td>
      <a href="${liSearchUrl(j.company)}" target="_blank"
         style="display:inline-block;padding:4px 10px;background:#0a66c2;color:#fff;border-radius:4px;text-decoration:none;font-size:13px;margin-right:6px">
        🔍 Find people
      </a>
      <button onclick="copyScript(${i})"
              style="padding:4px 10px;background:#f3f2ee;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:13px">
        📋 Copy script
      </button>
    </td>
  </tr>
  <tr id="${scriptId}" style="display:none">
    <td colspan="5" style="padding:0 16px 16px;background:#f8f8f8">
      <pre style="font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:4px">${scriptContent}</pre>
    </td>
  </tr>`;
}).join('');

const scripts = targets.map((j, i) => {
  const raw = consoleScript(j).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  return `scripts[${i}] = \`${raw}\`;`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LinkedIn Outreach — ${today}</title>
<style>
  body { font-family: -apple-system,sans-serif; max-width: 1100px; margin: 40px auto; padding: 0 20px; color: #1d1d1d; }
  h1 { font-size: 22px; }
  .meta { color: #666; margin-bottom: 20px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 8px 10px; background: #f3f2ee; border-bottom: 2px solid #ccc; }
  td { padding: 8px 10px; border-bottom: 1px solid #e0e0e0; vertical-align: middle; }
  tr:hover > td { background: #fafafa; }
  .tip { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; }
</style>
</head>
<body>
<h1>🔗 LinkedIn Outreach — ${today}</h1>
<p class="meta">${targets.length} companies from today's High + Medium matches · Generated by free-agent</p>

<div class="tip">
  <strong>How to use:</strong>
  1. Click <strong>🔍 Find people</strong> → LinkedIn search opens → filter by "1st+ degree" or just scroll results.<br>
  2. Click <strong>📋 Copy script</strong> → paste in browser DevTools console (F12 → Console) on that search page.<br>
  3. Script auto-clicks every Connect button and sends your referral note. Keep to ~20 invites/day.
</div>

<table>
  <thead>
    <tr>
      <th>Score</th><th>Company</th><th>Role</th><th>Location</th><th>Actions</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<script>
const scripts = [];
${scripts}

function copyScript(i) {
  navigator.clipboard.writeText(scripts[i]).then(() => {
    const btn = document.querySelectorAll('button')[i];
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
  // Also toggle the preview row
  const pre = document.getElementById('script_' + i);
  pre.style.display = pre.style.display === 'none' ? 'table-row' : 'none';
}
</script>
</body>
</html>`;

writeFileSync(OUT, html);
console.log(`\n✅ Outreach page written → ${OUT}`);
console.log(`   ${targets.length} companies to reach out to today`);
console.log(`   Open in browser: open "${OUT}"`);
